import { setTimeout as delay } from "node:timers/promises";
import type { Database } from "@your-league-coach/db";
import { collectorState } from "@your-league-coach/db/schema/lol";
import { recordCrawlError } from "./crawl";
import { RiotAuthError } from "./riot/errors";

const MINUTE_MS = 60_000;
const PATCH_INTERVAL_MS = 60 * MINUTE_MS;
const AGGREGATE_INTERVAL_MS = 30 * MINUTE_MS;
const SEED_INTERVAL_MS = 24 * 60 * MINUTE_MS;
const IDLE_CRAWL_MS = 1000;
const CRAWL_RETRY_MS = MINUTE_MS;

export type Job = "patch" | "aggregate" | "retention" | "seed" | "crawl";
type JobResult = "done" | "idle" | "failed";
type Work = () => Promise<unknown>;

export class JobInterruptedError extends Error {}

interface Clock {
  readonly now: () => number;
  readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
}

const systemClock: Clock = {
  now: Date.now,
  wait: async (ms, signal) => {
    try {
      await delay(ms, undefined, { signal });
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  },
};

export const jobErrorMessage = (job: Job, error: unknown) => {
  if (error instanceof RiotAuthError) {
    return error.message;
  }
  return error instanceof JobInterruptedError
    ? `${job} job interrupted`
    : `${job} job failed`;
};

export const recordJobError = async (
  db: Database,
  job: Job,
  error: unknown,
  now = Date.now
) => {
  if (error instanceof RiotAuthError) {
    await recordCrawlError(db, error, now);
    return;
  }
  // Never persist untrusted exception text: it may contain a connection URL,
  // headers, query parameters, or a Riot identity.
  await db.update(collectorState).set({
    lastError: jobErrorMessage(job, error),
    lastErrorAt: new Date(now()),
  });
};

interface SchedulerOptions {
  readonly clock?: Clock;
  readonly db: Database;
  readonly jobs: Readonly<Record<"patch" | "aggregate" | "retention", Work>>;
  readonly log: (message: string) => void;
  readonly riot?: Readonly<{
    crawl: () => Promise<boolean>;
    crawlStop: AbortSignal;
    seed: Work;
  }>;
  readonly signal: AbortSignal;
}

const runJob = async (
  { db, log, signal, clock = systemClock }: SchedulerOptions,
  job: Job,
  work: Work
): Promise<JobResult> => {
  if (signal.aborted) {
    return "idle";
  }
  try {
    const result = await work();
    if (result === false) {
      return "idle";
    }
    if (job !== "crawl") {
      log(`${job} job complete`);
    }
    return "done";
  } catch (error) {
    // A real denial still needs its heartbeat when the same response stopped
    // the crawl lane. Cancellation caused by another caller is not a new error.
    if (!signal.aborted || error instanceof RiotAuthError) {
      log(jobErrorMessage(job, error));
      try {
        await recordJobError(db, job, error, clock.now);
      } catch {
        log("Collector error heartbeat could not be written");
      }
    }
    return "failed";
  }
};

const periodic = async (
  { clock = systemClock, signal }: SchedulerOptions,
  interval: number,
  work: () => Promise<JobResult | undefined>
) => {
  const cycle = async () => {
    const deadline = clock.now() + interval;
    const result = await work();
    if (signal.aborted) {
      return;
    }
    const remaining = Math.max(0, deadline - clock.now());
    await clock.wait(
      result === "idle" ? Math.min(remaining, MINUTE_MS) : remaining,
      signal
    );
  };
  for await (const _ of cycles(cycle, signal)) {
    // A cycle includes its delay; no interval can overlap the previous run.
  }
};

function* cycles<T>(cycle: () => Promise<T>, signal: AbortSignal) {
  while (!signal.aborted) {
    yield cycle();
  }
}

const runCrawl = async (
  options: SchedulerOptions,
  { crawl, crawlStop }: NonNullable<SchedulerOptions["riot"]>
) => {
  const { clock = systemClock, log } = options;
  const signal = AbortSignal.any([options.signal, crawlStop]);
  const cycle = async () => {
    const crawled = await runJob({ ...options, signal }, "crawl", crawl);
    if (!signal.aborted && (crawled === "failed" || crawled === "idle")) {
      await clock.wait(
        crawled === "idle" ? IDLE_CRAWL_MS : CRAWL_RETRY_MS,
        signal
      );
    }
  };
  for await (const _ of cycles(cycle, signal)) {
    // Wait for the admitted request before leaving the crawl lane.
  }
  if (crawlStop.aborted) {
    log("Riot crawl stopped until restart");
  }
};

export const runScheduler = async (options: SchedulerOptions) => {
  const { jobs, log, riot } = options;
  log(
    options.riot
      ? "Collector started"
      : "Collector started (crawl and seed disabled)"
  );
  const outcomes = await Promise.allSettled([
    periodic(options, PATCH_INTERVAL_MS, async () => {
      await runJob(options, "patch", jobs.patch);
      await runJob(options, "retention", jobs.retention);
    }),
    periodic(options, AGGREGATE_INTERVAL_MS, () =>
      runJob(options, "aggregate", jobs.aggregate)
    ),
    ...(riot
      ? [
          periodic(options, SEED_INTERVAL_MS, () =>
            runJob(options, "seed", riot.seed)
          ),
          runCrawl(options, riot),
        ]
      : []),
  ]);
  if (outcomes.some((outcome) => outcome.status === "rejected")) {
    throw new Error("Collector scheduler failed");
  }
  log("Collector stopped");
};
