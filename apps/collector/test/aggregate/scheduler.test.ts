import { expect, test } from "bun:test";
import { setImmediate as drainTurn } from "node:timers/promises";
import { collectorState } from "@your-league-coach/db/schema/lol";
import { checkPatches } from "../../src/patch";
import { RiotAuthError } from "../../src/riot/errors";
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

function* advanceDays(clock: SchedulerClock) {
  for (let at = 30 * MINUTE; at <= 2 * DAY; at += 30 * MINUTE) {
    clock.advanceTo(at);
    yield drainTurn();
  }
}

for (const mode of ["healthy", 401, 403, "pending"] as const) {
  test.skipIf(!process.env.DATABASE_URL)(
    `daily seed runs at hours 0, 24, and 48 when crawl is ${mode}`,
    async () => {
      await withTestDatabase(async (db) => {
        const clock = new SchedulerClock();
        const stop = new AbortController();
        const stoppedCrawl = Promise.withResolvers<void>();
        const heldCrawl = Promise.withResolvers<boolean>();
        const starts: number[] = [];
        const auth = mode === 401 || mode === 403;
        let crawls = 0;
        let aggregates = 0;
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
            patch: () => Promise.resolve(),
            retention: () => Promise.resolve(),
            aggregate: () => {
              aggregates += 1;
              return Promise.resolve();
            },
          },
          riot: {
            seed: () => {
              starts.push(clock.now());
              return Promise.resolve();
            },
            crawl: () => {
              crawls += 1;
              if (auth) {
                return Promise.reject(new RiotAuthError(mode));
              }
              return mode === "pending"
                ? heldCrawl.promise
                : Promise.resolve(false);
            },
          },
        });
        try {
          await clock.pending(30 * MINUTE);
          if (auth) {
            await stoppedCrawl.promise;
          }
          if (mode === "healthy") {
            await clock.pending(1000);
          }
          for await (const _ of advanceDays(clock)) {
            // Let each set of due jobs finish before moving to the next deadline.
          }
          expect(starts).toEqual([0, DAY, 2 * DAY]);
          expect(aggregates).toBe(97);
          expect(crawls).toBe(mode === "healthy" ? 97 : 1);
          if (auth) {
            expect(await db.select().from(collectorState)).toMatchObject([
              {
                lastError: `Riot API authentication failed (HTTP ${mode})`,
                lastErrorAt: new Date(0),
              },
            ]);
          }
        } finally {
          stop.abort();
          heldCrawl.resolve(false);
          await running;
        }
      });
    }
  );
}
