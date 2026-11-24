import { createDb } from "@your-league-coach/db";
import {
  fetchItems,
  fetchVersions,
  type Item,
} from "@your-league-coach/lol-data/ddragon";
import { crawlOnce, recordCrawlError } from "./crawl";
import { checkPatches } from "./patch";
import { RiotClient } from "./riot/client";
import { RiotAuthError } from "./riot/errors";
import { RiotRateLimiter } from "./riot/rate-limiter";
import { seedPlayersForKey } from "./seed";

const USAGE = "Usage: bun src/index.ts --once <patch|seed|crawl> [--limit N]";
const QA_TIMEOUT_MS = 180_000;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const parseArgs = (args: readonly string[]) => {
  const [once, job, flag, rawLimit] = args;
  if (
    once !== "--once" ||
    (job !== "patch" && job !== "seed" && job !== "crawl")
  ) {
    return null;
  }
  if (args.length === 2) {
    return { job, limit: undefined };
  }
  const limit = Number(rawLimit);
  if (
    args.length !== 4 ||
    flag !== "--limit" ||
    !rawLimit ||
    !POSITIVE_INTEGER.test(rawLimit) ||
    !Number.isSafeInteger(limit)
  ) {
    return null;
  }
  return { job, limit };
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
  if (!DATABASE_URL || (command.job !== "patch" && !RIOT_API_KEY)) {
    process.stderr.write(
      "DATABASE_URL and (for seed/crawl) RIOT_API_KEY are required\n"
    );
    return 1;
  }
  const db = createDb({ DATABASE_URL });
  const getVersions = () => fetchVersions({ baseUrl: DDRAGON_BASE_URL });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGTERM", abort);
  process.once("SIGINT", abort);
  const signal =
    command.limit === undefined
      ? controller.signal
      : AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(QA_TIMEOUT_MS),
        ]);
  let requests = 0;
  try {
    if (command.job === "patch") {
      await checkPatches(db, getVersions);
      process.stdout.write("Patch check complete\n");
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
    if (command.job === "seed") {
      const seeds = await seedPlayersForKey(db, riot, apiKey, {
        force: true,
        sample: command.limit !== undefined,
      });
      process.stdout.write(`Seeds refreshed: ${seeds}\n`);
    } else {
      const inserted = await crawlOnce(
        {
          db,
          riot,
          apiKey,
          signal,
          getVersions,
          loadItems: createItemLoader(DDRAGON_BASE_URL),
        },
        command.limit
      );
      process.stdout.write(`Matches inserted: ${inserted}\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof RiotAuthError && command.job === "seed") {
      await recordCrawlError(db, error);
    }
    const message =
      error instanceof RiotAuthError
        ? error.message
        : `${command.job} job failed`;
    process.stderr.write(
      `${signal.aborted ? "Collector interrupted" : message}\n`
    );
    return 1;
  } finally {
    process.removeListener("SIGTERM", abort);
    process.removeListener("SIGINT", abort);
    process.stdout.write(`Riot requests: ${requests}\n`);
    await db.$client.end();
  }
};

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2)).catch(() => {
    process.stderr.write("Collector job failed\n");
    return 1;
  });
}
