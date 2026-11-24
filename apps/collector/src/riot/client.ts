import type { z } from "zod";
import {
  RiotAuthError,
  RiotHttpError,
  RiotPayloadError,
  RiotRateLimitError,
  RiotTransportError,
} from "./errors";
import {
  RATE_LIMIT_RETRIES,
  REQUEST_TIMEOUT_MS,
  SERVER_RETRY_DELAYS_MS,
} from "./limits";
import type { RiotRateLimiter, RiotRoute } from "./rate-limiter";
import {
  apexLeagueSchema,
  type LeagueEntry,
  leagueEntriesSchema,
  matchIdsSchema,
  matchSchema,
  puuidSchema,
  timelineSchema,
} from "./schemas";

export const SOLO_LEAGUE_QUEUE = "RANKED_SOLO_5x5";
const ROUTING_LABEL = /^[a-z][a-z0-9]*$/i;

export type RiotTransport = (url: URL, init: RequestInit) => Promise<Response>;

interface RiotClientOptions {
  readonly apiKey: string;
  readonly limiter: RiotRateLimiter;
  readonly platform: string;
  readonly region: string;
  readonly signal?: AbortSignal;
  readonly transport?: RiotTransport;
}

interface MatchListOptions {
  readonly count?: number;
  readonly endTime?: number;
  readonly queue: number;
  readonly start?: number;
  readonly startTime?: number;
}

export class RiotClient {
  readonly #crawlDenied = new AbortController();
  readonly #options: RiotClientOptions;
  readonly #transport: RiotTransport;
  readonly #platform: string;
  readonly #region: string;

  constructor(options: RiotClientOptions) {
    if (
      !(
        ROUTING_LABEL.test(options.platform) &&
        ROUTING_LABEL.test(options.region)
      )
    ) {
      throw new TypeError("Invalid Riot API routing label");
    }
    this.#options = options;
    this.#transport = options.transport ?? fetch;
    this.#platform = `${options.platform.toLowerCase()}.api.riotgames.com`;
    this.#region = `${options.region.toLowerCase()}.api.riotgames.com`;
  }

  get crawlStop(): AbortSignal {
    return this.#crawlDenied.signal;
  }

  async leagueExpEntries(
    queue: typeof SOLO_LEAGUE_QUEUE,
    tier: "EMERALD" | "DIAMOND",
    division: "I" | "II" | "III" | "IV",
    page: number,
    limit?: number
  ): Promise<LeagueEntry[]> {
    const entries = await this.#request(
      this.#platform,
      "leagueExpEntries",
      `/lol/league-exp/v4/entries/${queue}/${tier}/${division}?page=${page}`,
      leagueEntriesSchema
    );
    return await this.#resolveEntries(entries.slice(0, limit));
  }

  async apexLeague(tier: "challenger" | "grandmaster" | "master") {
    const endpoint = `/lol/league/v4/${tier}leagues/by-queue`;
    const league = await this.#request(
      this.#platform,
      endpoint,
      `${endpoint}/${SOLO_LEAGUE_QUEUE}`,
      apexLeagueSchema
    );
    return { entries: await this.#resolveEntries(league.entries) };
  }

  matchIdsByPuuid(puuid: string, options: MatchListOptions) {
    const query = new URLSearchParams({
      queue: String(options.queue),
      count: String(options.count ?? 100),
    });
    if (options.startTime !== undefined) {
      query.set("startTime", String(options.startTime));
    }
    if (options.endTime !== undefined) {
      query.set("endTime", String(options.endTime));
    }
    if (options.start !== undefined) {
      query.set("start", String(options.start));
    }
    return this.#request(
      this.#region,
      "matchIdsByPuuid",
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${query}`,
      matchIdsSchema,
      this.crawlStop
    );
  }

  match(matchId: string) {
    return this.#request(
      this.#region,
      "match",
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      matchSchema,
      this.crawlStop
    );
  }

  timeline(matchId: string) {
    return this.#request(
      this.#region,
      "timeline",
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      timelineSchema,
      this.crawlStop
    );
  }

  async #resolveEntries(entries: z.infer<typeof leagueEntriesSchema>) {
    const resolved: LeagueEntry[] = [];
    for await (const entry of this.#entryLookups(entries)) {
      resolved.push(entry);
    }
    return resolved;
  }

  *#entryLookups(entries: z.infer<typeof leagueEntriesSchema>) {
    for (const entry of entries) {
      yield "puuid" in entry
        ? entry
        : this.#request(
            this.#platform,
            "summonerById",
            `/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`,
            puuidSchema
          );
    }
  }

  async #request<T>(
    host: string,
    method: string,
    path: string,
    schema: z.ZodType<T>,
    crawlStop?: AbortSignal
  ) {
    const url = new URL(`https://${host}${path}`);
    const route = { host, method, path: url.pathname };
    const { limiter, signal } = this.#options;
    // Only admission uses the crawl latch. An admitted HTTP request may finish.
    const admission =
      signal && crawlStop
        ? AbortSignal.any([signal, crawlStop])
        : (crawlStop ?? signal);
    const attempt = async (
      rateRetries: number,
      serverRetries: number
    ): Promise<T> => {
      admission?.throwIfAborted();
      await limiter.acquire(route, admission);
      admission?.throwIfAborted();
      const reply = await this.#attempt(url, route, schema);
      crawlStop?.throwIfAborted();
      if (reply.kind === "ok") {
        return reply.data;
      }
      if (reply.kind === "payload") {
        throw new RiotPayloadError(method);
      }
      if (reply.kind === "transport") {
        throw new RiotTransportError(reply.reason);
      }
      const { status } = reply;
      if (status === 429) {
        if (rateRetries >= RATE_LIMIT_RETRIES) {
          throw new RiotRateLimitError();
        }
        return await attempt(rateRetries + 1, serverRetries);
      }
      const backoff = SERVER_RETRY_DELAYS_MS[serverRetries];
      if (status < 500 || status >= 600 || backoff === undefined) {
        throw new RiotHttpError(status);
      }
      await limiter.wait(backoff, admission);
      return await attempt(rateRetries, serverRetries + 1);
    };
    return await attempt(0, 0);
  }

  async #attempt<T>(url: URL, route: RiotRoute, schema: z.ZodType<T>) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const outer = this.#options.signal;
    const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
    let parsing = false;
    try {
      signal.throwIfAborted();
      const response = await this.#transport(url, {
        headers: { "X-Riot-Token": this.#options.apiKey },
        redirect: "error",
        signal,
      });
      this.#options.limiter.observe(route, response.status, response.headers);
      if (response.status === 401 || response.status === 403) {
        // Latch synchronously for every endpoint, before body disposal or DB I/O.
        this.#crawlDenied.abort();
        await response.body?.cancel().catch(() => undefined);
        throw new RiotAuthError(response.status);
      }
      if (!response.ok) {
        // No error body is trusted or included in diagnostics.
        await response.body?.cancel();
        return { kind: "http", status: response.status } as const;
      }
      parsing = true;
      const result = schema.safeParse(await response.json());
      return result.success
        ? ({ kind: "ok", data: result.data } as const)
        : ({ kind: "payload" } as const);
    } catch (error) {
      if (error instanceof RiotAuthError) {
        this.#crawlDenied.abort();
        throw error;
      }
      // Never attach the original error: transports and parse errors may contain sensitive input.
      if (signal.aborted) {
        return {
          kind: "transport",
          reason: outer?.aborted ? "aborted" : "timeout",
        } as const;
      }
      if (parsing) {
        return { kind: "payload" } as const;
      }
      return { kind: "transport", reason: "network" } as const;
    }
  }
}
