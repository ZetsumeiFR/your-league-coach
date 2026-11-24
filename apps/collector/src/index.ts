import { createDb } from "@your-league-coach/db";
import {
  fetchChampions,
  fetchItems,
  fetchVersions,
  type Item,
} from "@your-league-coach/lol-data/ddragon";
import { aggregateStats, type LoadChampions } from "./aggregate";
import { crawlOnce, crawlWindow, createCrawlQueueRotation } from "./crawl";
import { checkPatches } from "./patch";
import { retainStats } from "./retention";
import { RiotClient } from "./riot/client";
import { RiotRateLimiter } from "./riot/rate-limiter";
import {
  type Job,
  jobErrorMessage,
  recordJobError,
  runScheduler,
} from "./scheduler";
import { seedPlayersForKey } from "./seed";
import { readStatWindow } from "./stat-window";

// --no-crawl disables both Riot jobs, leaving patch/aggregation/retention active.
const USAGE =
  "Usage: bun src/index.ts [--no-crawl | --once <patch|seed|crawl|aggregate|retention> [--limit N (seed/crawl only)]]";
const QA_TIMEOUT_MS = 180_000;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

type Command =
  | { readonly mode: "scheduled"; readonly crawl: boolean }
  | { readonly mode: "once"; readonly job: Job; readonly limit?: number };

export const parseArgs = (args: readonly string[]): Command | null => {
  if (args.length === 0 || (args.length === 1 && args[0] === "--no-crawl")) {
    return { mode: "scheduled", crawl: args.length === 0 };
  }
  const [once, job, flag, rawLimit] = args;
  if (
    once !== "--once" ||
    (job !== "patch" &&
      job !== "seed" &&
      job !== "crawl" &&
      job !== "aggregate" &&
      job !== "retention")
  ) {
    return null;
  }
  if (args.length === 2) {
    return { mode: "once", job };
  }
  const limit = Number(rawLimit);
  if (
    args.length !== 4 ||
    (job !== "seed" && job !== "crawl") ||
    flag !== "--limit" ||
    !rawLimit ||
    !POSITIVE_INTEGER.test(rawLimit) ||
    !Number.isSafeInteger(limit)
  ) {
    return null;
  }
  return { mode: "once", job, limit };
};

export const createItemLoader = (baseUrl?: string) => {
  const cache = new Map<string, ReadonlyMap<number, Item>>();
  return async (version: string) => {
    const cached = cache.get(version);
    if (cached) {
      return cached;
    }
    const items = await fetchItems(version, "en_US", { baseUrl });
    const byId = new Map(items.map((item) => [item.id, item]));
    cache.set(version, byId);
    return byId;
  };
};

const createChampionLoader = (baseUrl?: string): LoadChampions => {
  // Cache the in-flight promise too: a provisional patch can share its version
  // with the previous patch even when both are loaded concurrently.
  const cache = new Map<string, ReturnType<LoadChampions>>();
  return (version) => {
    const cached = cache.get(version);
    if (cached) {
      return cached;
    }
    const loading = (async () => {
      try {
        const champions = await fetchChampions(version, "en_US", { baseUrl });
        return new Map(champions.map((champion) => [champion.key, champion]));
      } catch (error) {
        cache.delete(version);
        throw error;
      }
    })();
    cache.set(version, loading);
    return loading;
  };
};

const writeLog = (message: string) => {
  process.stdout.write(`${message}\n`);
};

const createJobs = (
  db: ReturnType<typeof createDb>,
  signal: AbortSignal,
  baseUrl?: string
) => {
  const getVersions = () => fetchVersions({ baseUrl });
  const loadChampions = createChampionLoader(baseUrl);
  return {
    patch: () => checkPatches(db, getVersions),
    aggregate: () => aggregateStats(db, loadChampions, signal),
    retention: () => retainStats(db, signal),
  };
};

type RiotWork = Parameters<typeof crawlOnce>[0];

const runOnce = async (
  { job, limit }: Extract<Command, { mode: "once" }>,
  jobs: ReturnType<typeof createJobs>,
  work: RiotWork
) => {
  switch (job) {
    case "patch": {
      const { current, previous } = await jobs.patch();
      writeLog(
        `Patch check complete: current=${current}, previous=${previous}`
      );
      return 0;
    }
    case "aggregate": {
      const replaced = await jobs.aggregate();
      writeLog(
        replaced
          ? "Aggregation complete"
          : "Aggregation skipped: no stable patch window"
      );
      return replaced ? 0 : 1;
    }
    case "retention": {
      const retained = await jobs.retention();
      writeLog(
        `Retention deleted: matches=${retained.matches}, aggregates=${retained.aggregates}`
      );
      return 0;
    }
    case "seed": {
      const { db, riot, apiKey } = work;
      const seeds = await seedPlayersForKey(db, riot, apiKey, {
        force: true,
        sample: limit !== undefined,
      });
      writeLog(`Seeds refreshed: ${seeds}`);
      return 0;
    }
    case "crawl": {
      const inserted = await crawlOnce(work, limit);
      writeLog(`Matches inserted: ${inserted}`);
      return 0;
    }
    default:
      throw new TypeError(`Unknown collector job: ${job satisfies never}`);
  }
};

const scheduledRiot = (work: RiotWork) => {
  const { db, riot, apiKey } = work;
  const nextQueue = createCrawlQueueRotation();
  return {
    seed: () =>
      seedPlayersForKey(db, riot, apiKey, { force: true, sample: false }),
    crawl: async () => {
      if ((await readStatWindow(db)).length === 0) {
        return false;
      }
      const result = await crawlWindow(work, nextQueue());
      return result.hasSeed;
    },
  };
};

const needsRiotKey = (command: Command): boolean =>
  command.mode === "scheduled"
    ? command.crawl
    : command.job === "seed" || command.job === "crawl";

const reportFailure = async (
  db: ReturnType<typeof createDb>,
  command: Command,
  signal: AbortSignal,
  error: unknown
) => {
  if (signal.aborted) {
    process.stderr.write("Collector interrupted\n");
    return command.mode === "scheduled" ? 0 : 1;
  }
  if (command.mode === "once") {
    process.stderr.write(`${jobErrorMessage(command.job, error)}\n`);
    await recordJobError(db, command.job, error);
  } else {
    process.stderr.write("Collector scheduler failed\n");
  }
  return 1;
};

const run = async (args: readonly string[]) => {
  const command = parseArgs(args);
  if (!command) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const {
    DATABASE_URL,
    DDRAGON_BASE_URL,
    RIOT_API_KEY,
    RIOT_PLATFORM,
    RIOT_REGION,
  } = process.env;
  if (!DATABASE_URL || (needsRiotKey(command) && !RIOT_API_KEY)) {
    process.stderr.write(
      "DATABASE_URL and (when Riot jobs are enabled) RIOT_API_KEY are required\n"
    );
    return 1;
  }
  const db = createDb({ DATABASE_URL });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGTERM", abort);
  process.on("SIGINT", abort);
  const signal =
    command.mode === "scheduled" || command.limit === undefined
      ? controller.signal
      : AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(QA_TIMEOUT_MS),
        ]);
  let requests = 0;
  const jobs = createJobs(db, signal, DDRAGON_BASE_URL);
  try {
    if (command.mode === "scheduled" && !command.crawl) {
      await runScheduler({ db, jobs, log: writeLog, signal });
      return 0;
    }
    const apiKey = RIOT_API_KEY ?? "";
    const riot = new RiotClient({
      apiKey,
      platform: RIOT_PLATFORM ?? "euw1",
      region: RIOT_REGION ?? "europe",
      limiter: new RiotRateLimiter(),
      signal,
      transport: (url, init) => {
        requests += 1;
        return fetch(url, init);
      },
    });
    const deps = {
      db,
      riot,
      apiKey,
      signal,
      getVersions: () => fetchVersions({ baseUrl: DDRAGON_BASE_URL }),
      loadItems: createItemLoader(DDRAGON_BASE_URL),
    };
    if (command.mode === "once") {
      return await runOnce(command, jobs, deps);
    }
    await runScheduler({
      db,
      jobs,
      log: writeLog,
      signal,
      riot: scheduledRiot(deps),
    });
    return 0;
  } catch (error) {
    return await reportFailure(db, command, signal, error);
  } finally {
    await db.$client.end();
    process.removeListener("SIGTERM", abort);
    process.removeListener("SIGINT", abort);
    writeLog(`Riot requests: ${requests}`);
  }
};

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2)).catch(() => {
    process.stderr.write("Collector job failed\n");
    return 1;
  });
}
