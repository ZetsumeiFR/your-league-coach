import { expect, test } from "bun:test";
import { setImmediate as drainTurn } from "node:timers/promises";
import { collectorState } from "@your-league-coach/db/schema/lol";
import { checkPatches } from "../../src/patch";
import { RiotClient, SOLO_LEAGUE_QUEUE } from "../../src/riot/client";
import { RiotRateLimiter } from "../../src/riot/rate-limiter";
import { runScheduler } from "../../src/scheduler";
import { withTestDatabase } from "../test-database";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

class SchedulerClock {
  #time = 0;
  readonly #deadlines = new Map<number, Set<() => void>>();
  readonly #scheduled = new Map<number, () => void>();

  readonly now = () => this.#time;

  pending(at: number) {
    if (this.#deadlines.has(at)) {
      return Promise.resolve();
    }
    const ready = Promise.withResolvers<void>();
    this.#scheduled.set(at, ready.resolve);
    return ready.promise;
  }

  advanceTo(at: number) {
    this.#time = at;
    for (const [deadline, wakeups] of this.#deadlines) {
      if (deadline <= at) {
        for (const wake of wakeups) {
          wake();
        }
      }
    }
  }

  readonly wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const at = this.#time + ms;
      const wakeups = this.#deadlines.get(at) ?? new Set();
      const wake = () => {
        signal.removeEventListener("abort", wake);
        wakeups.delete(wake);
        if (wakeups.size === 0) {
          this.#deadlines.delete(at);
        }
        resolve();
      };
      wakeups.add(wake);
      this.#deadlines.set(at, wakeups);
      signal.addEventListener("abort", wake, { once: true });
      this.#scheduled.get(at)?.();
      this.#scheduled.delete(at);
    });
}

test.skipIf(!process.env.DATABASE_URL)(
  "a failed Data Dragon fetch records a safe error, other jobs recur, and shutdown drains active work",
  async () => {
    await withTestDatabase(async (db) => {
      const clock = new SchedulerClock();
      const stop = new AbortController();
      const inFlight = Promise.withResolvers<void>();
      const secondAggregate = Promise.withResolvers<void>();
      const logs: string[] = [];
      let aggregates = 0;
      let retentions = 0;
      let crawls = 0;
      const fetchVersions = (_url: string): Promise<Response> =>
        Promise.reject(
          new TypeError("Data Dragon unreachable (untrusted response: secret)")
        );
      const running = runScheduler({
        db,
        clock,
        signal: stop.signal,
        log: (message) => {
          logs.push(message);
        },
        jobs: {
          patch: () =>
            checkPatches(
              db,
              async () => {
                await fetchVersions("http://127.0.0.1:9/api/versions.json");
                return [];
              },
              clock.now
            ),
          aggregate: () => {
            aggregates += 1;
            if (aggregates === 2) {
              secondAggregate.resolve();
              return inFlight.promise;
            }
            return Promise.resolve();
          },
          retention: () => {
            retentions += 1;
            return Promise.resolve();
          },
        },
        riot: {
          crawlStop: new AbortController().signal,
          seed: () => Promise.resolve(),
          crawl: () => {
            crawls += 1;
            return Promise.resolve(false);
          },
        },
      });
      try {
        await Promise.all([
          clock.pending(30 * MINUTE),
          clock.pending(60 * MINUTE),
          clock.pending(1000),
        ]);
        expect(await db.select().from(collectorState)).toMatchObject([
          { lastError: "patch job failed", lastErrorAt: new Date(0) },
        ]);
        let settled = false;
        const finished = running.then(() => {
          settled = true;
        });
        clock.advanceTo(30 * MINUTE);
        await secondAggregate.promise;
        stop.abort();
        // An event-loop turn drains ready work without advancing the fake clock.
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        expect(settled).toBe(false);
        expect(retentions).toBe(1);
        expect(crawls).toBe(2);
        expect(logs.join("\n")).not.toContain("secret");
        inFlight.resolve();
        await finished;
      } finally {
        stop.abort();
        inFlight.resolve();
        await running;
      }
      expect(logs.at(-1)).toBe("Collector stopped");
    });
  }
);

function* advanceDays(clock: SchedulerClock, syncSeed: boolean) {
  for (let at = 30 * MINUTE; at <= 2 * DAY; at += 30 * MINUTE) {
    clock.advanceTo(at);
    if (syncSeed && at % DAY === 0) {
      yield clock.pending(at + DAY);
    }
    yield drainTurn();
  }
}

const scenarios = [
  { mode: "healthy" },
  { mode: "pending" },
  { mode: "crawl", status: 401 },
  { mode: "crawl", status: 403 },
  { mode: "seed", status: 401 },
  { mode: "seed", status: 403 },
] as const;

for (const scenario of scenarios) {
  const { mode } = scenario;
  const status = "status" in scenario ? scenario.status : undefined;
  test.skipIf(!process.env.DATABASE_URL)(
    `daily seed and maintenance continue: ${mode} ${status ?? ""}`,
    async () => {
      await withTestDatabase(async (db) => {
        const clock = new SchedulerClock();
        const stop = new AbortController();
        const stoppedCrawl = Promise.withResolvers<void>();
        const heldHistory = Promise.withResolvers<Response>();
        const seedDenial = Promise.withResolvers<Response>();
        const historyEntered = Promise.withResolvers<void>();
        const starts: number[] = [];
        const history: number[] = [];
        let seedRequests = 0;
        let crawls = 0;
        let aggregates = 0;
        let patches = 0;
        let retentions = 0;
        const riot = new RiotClient({
          apiKey: "fixture-key",
          platform: "euw1",
          region: "europe",
          limiter: new RiotRateLimiter({
            now: clock.now,
            sleep: (ms, signal) => clock.wait(ms, signal ?? stop.signal),
          }),
          signal: stop.signal,
          transport: (url) => {
            if (url.pathname.startsWith("/lol/league-exp/")) {
              seedRequests += 1;
              if (mode === "seed") {
                return seedRequests === 1
                  ? seedDenial.promise
                  : Promise.resolve(new Response(null, { status }));
              }
              return Promise.resolve(Response.json([]));
            }
            history.push(clock.now());
            historyEntered.resolve();
            if (mode === "crawl") {
              return Promise.resolve(new Response(null, { status }));
            }
            if (
              (mode === "seed" || mode === "pending") &&
              history.length === 1
            ) {
              return heldHistory.promise;
            }
            return Promise.resolve(Response.json([]));
          },
        });
        const running = runScheduler({
          db,
          clock,
          signal: stop.signal,
          log: (message) => {
            if (message === "Riot crawl stopped until restart") {
              stoppedCrawl.resolve();
            }
          },
          jobs: {
            patch: () => {
              patches += 1;
              return Promise.resolve();
            },
            retention: () => {
              retentions += 1;
              return Promise.resolve();
            },
            aggregate: () => {
              aggregates += 1;
              return Promise.resolve();
            },
          },
          riot: {
            crawlStop: riot.crawlStop,
            seed: async () => {
              starts.push(clock.now());
              await riot.leagueExpEntries(SOLO_LEAGUE_QUEUE, "EMERALD", "I", 1);
            },
            crawl: async () => {
              crawls += 1;
              await riot.matchIdsByPuuid("fixture-puuid", { queue: 420 });
              if (mode === "seed") {
                // An in-flight window would fetch a second page after the
                // first returns if the client did not guard request admission.
                await riot.matchIdsByPuuid("fixture-puuid", {
                  queue: 420,
                  start: 100,
                });
              }
              return false;
            },
          },
        });
        try {
          await clock.pending(30 * MINUTE);
          await historyEntered.promise;
          if (mode === "seed") {
            seedDenial.resolve(new Response(null, { status }));
            await clock.pending(DAY);
            expect(await db.select().from(collectorState)).toMatchObject([
              {
                lastError: `Riot API authentication failed (HTTP ${status})`,
                lastErrorAt: new Date(0),
              },
            ]);
            heldHistory.resolve(Response.json([]));
          }
          if (status !== undefined) {
            await stoppedCrawl.promise;
          }
          if (mode === "healthy") {
            await clock.pending(1000);
          }
          for await (const _ of advanceDays(clock, mode === "seed")) {
            // Let each set of due jobs finish before moving to the next deadline.
          }
          expect(starts).toEqual([0, DAY, 2 * DAY]);
          expect(seedRequests).toBe(3);
          expect(aggregates).toBe(97);
          expect(patches).toBe(49);
          expect(retentions).toBe(49);
          if (mode === "healthy") {
            expect(crawls).toBeGreaterThan(1);
          } else {
            expect(crawls).toBe(1);
            expect(history).toEqual([0]);
          }
          if (status !== undefined) {
            expect(await db.select().from(collectorState)).toMatchObject([
              {
                lastError: `Riot API authentication failed (HTTP ${status})`,
                lastErrorAt: new Date(mode === "seed" ? 2 * DAY : 0),
              },
            ]);
          }
        } finally {
          stop.abort();
          heldHistory.resolve(Response.json([]));
          seedDenial.resolve(Response.json([]));
          await running;
        }
      });
    }
  );
}
