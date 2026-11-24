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
  readonly queue: number;
  readonly start?: number;
  readonly startTime?: number;
}

export class RiotClient {
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

  async leagueExpEntries(
    queue: typeof SOLO_LEAGUE_QUEUE,
    tier: "EMERALD" | "DIAMOND",
    division: "I" | "II" | "III" | "IV",
    page: number
  ): Promise<LeagueEntry[]> {
    const entries = await this.#request(
      this.#platform,
      "leagueExpEntries",
      `/lol/league-exp/v4/entries/${queue}/${tier}/${division}?page=${page}`,
      leagueEntriesSchema
    );
    return await this.#resolveEntries(entries);
  }

  async apexLeague(tier: "challenger" | "grandmaster" | "master") {
    const league = await this.#request(
      this.#platform,
      "apexLeague",
      `/lol/league/v4/${tier}leagues/by-queue/${SOLO_LEAGUE_QUEUE}`,
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
    if (options.start !== undefined) {
      query.set("start", String(options.start));
    }
    return this.#request(
      this.#region,
      "matchIdsByPuuid",
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${query}`,
      matchIdsSchema
    );
  }

  match(matchId: string) {
    return this.#request(
      this.#region,
      "match",
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
      matchSchema
    );
  }

  timeline(matchId: string) {
    return this.#request(
      this.#region,
      "timeline",
      `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`,
      timelineSchema
    );
  }

  #resolveEntries(entries: z.infer<typeof leagueEntriesSchema>) {
    const resolved: LeagueEntry[] = [];
    const resolveNext = async (index: number): Promise<LeagueEntry[]> => {
      const entry = entries[index];
      if (entry === undefined) {
        return resolved;
      }
      resolved.push(
        "puuid" in entry
          ? entry
          : await this.#request(
              this.#platform,
              "summonerById",
              `/lol/summoner/v4/summoners/${encodeURIComponent(entry.summonerId)}`,
              puuidSchema
            )
      );
      return await resolveNext(index + 1);
    };
    return resolveNext(0);
  }

  async #request<T>(
    host: string,
    method: string,
    path: string,
    schema: z.ZodType<T>
  ) {
    const url = new URL(`https://${host}${path}`);
    const route = { host, method, path: url.pathname };
    const { limiter, signal } = this.#options;
    const attempt = async (
      rateRetries: number,
      serverRetries: number
    ): Promise<T> => {
      await limiter.acquire(route, signal);
      const reply = await this.#attempt(url, route, schema);
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
      if (status === 401 || status === 403) {
        throw new RiotAuthError(status);
      }
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
      await limiter.wait(backoff, signal);
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
    } catch {
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
