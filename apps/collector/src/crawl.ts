import type { Database } from "@your-league-coach/db";
import {
  collectorState,
  matches,
  patches,
  seedPlayers,
  seedQueueProgress,
} from "@your-league-coach/db/schema/lol";
import type { Item } from "@your-league-coach/lol-data/ddragon";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  ingestMatch,
  MIN_MATCH_DURATION_S,
  skipMalformedRunePage,
} from "./ingest";
import { checkPatches, recognizePatch } from "./patch";
import type { RiotClient } from "./riot/client";
import { RiotAuthError } from "./riot/errors";
import { CRAWL_QUEUE_WEIGHTS, SECOND_MS } from "./riot/limits";
import { seedPlayersForKey } from "./seed";

// Start a fresh player/queue far enough back to cover two typical patches.
const BACKFILL_SECONDS = 28 * 24 * 60 * 60;
const HISTORY_PAGE_SIZE = 100;
const QUEUE_WEIGHT_TOTAL = CRAWL_QUEUE_WEIGHTS.reduce(
  (total, [, weight]) => total + weight,
  0
);
// Bound sparse histories and rejected candidates in QA, not just inserts.
const QA_WINDOW_LIMIT = 12;
const QA_CANDIDATE_MULTIPLIER = 6;
const QA_PAGES_PER_WINDOW = 4;
export type CrawlQueue = (typeof CRAWL_QUEUE_WEIGHTS)[number][0];

// Smooth weighted round-robin. Ties go to the first queue in weight-table order.
export const createCrawlQueueRotation = (): (() => CrawlQueue) => {
  const scores = CRAWL_QUEUE_WEIGHTS.map(([queue, weight]) => ({
    queue,
    weight,
    score: 0,
  }));
  return () => {
    let [next] = scores;
    for (const entry of scores) {
      entry.score += entry.weight;
      if (!next || entry.score > next.score) {
        next = entry;
      }
    }
    if (!next) {
      throw new TypeError("Crawl queue weights are empty");
    }
    next.score -= QUEUE_WEIGHT_TOTAL;
    return next.queue;
  };
};

const nextCrawlQueue = createCrawlQueueRotation();

export const historyStartTime = (windowEnd: number, previous?: Date | null) =>
  previous
    ? Math.floor(previous.getTime() / SECOND_MS)
    : windowEnd - BACKFILL_SECONDS;

export interface CrawlDependencies {
  readonly db: Database;
  readonly loadItems: (version: string) => Promise<ReadonlyMap<number, Item>>;
  readonly now?: () => number;
  readonly riot: Pick<RiotClient, "matchIdsByPuuid" | "match" | "timeline">;
  readonly signal?: AbortSignal;
}

const nextSeed = async (db: Database, queue: CrawlQueue) => {
  const [seed] = await db
    .select({
      id: seedPlayers.id,
      puuid: seedPlayers.puuid,
      crawledUntil: seedQueueProgress.crawledUntil,
    })
    .from(seedPlayers)
    .leftJoin(
      seedQueueProgress,
      and(
        eq(seedQueueProgress.seedPlayerId, seedPlayers.id),
        eq(seedQueueProgress.queueId, queue)
      )
    )
    .orderBy(
      sql`${seedQueueProgress.crawledUntil} asc nulls first`,
      asc(seedPlayers.id)
    )
    .limit(1);
  return seed;
};

type Seed = NonNullable<Awaited<ReturnType<typeof nextSeed>>>;

const processMatch = async (
  { db, riot, signal, loadItems, now }: CrawlDependencies,
  matchId: string,
  queue: CrawlQueue,
  seedId: Seed["id"]
) => {
  const match = await riot.match(matchId);
  if (match.metadata.matchId !== matchId || match.info.queueId !== queue) {
    return false;
  }
  const patch = await recognizePatch(db, match.info.gameVersion);
  if (!patch || match.info.gameDuration < MIN_MATCH_DURATION_S) {
    return false;
  }
  if (await skipMalformedRunePage(db, match, now)) {
    return false;
  }
  const timeline = await riot.timeline(matchId);
  const items = await loadItems(patch.ddragonVersion);
  signal?.throwIfAborted();
  return await ingestMatch(
    db,
    { match, timeline, items, seedTier: null },
    { seedId, now }
  );
};

function* historyPages(
  { db, riot, signal }: CrawlDependencies,
  seed: Seed,
  queue: CrawlQueue,
  endTime: number,
  pageLimit: number
) {
  const startTime = historyStartTime(endTime, seed.crawledUntil);
  for (let page = 0; page < pageLimit; page += 1) {
    signal?.throwIfAborted();
    yield readHistoryPage(
      riot,
      seed,
      {
        queue,
        startTime,
        endTime,
        start: page * HISTORY_PAGE_SIZE,
        count: HISTORY_PAGE_SIZE,
      },
      db
    );
  }
}

const unseenIds = async (db: Database, ids: string[]) => {
  if (!ids.length) {
    return [];
  }
  const known = await db
    .select({ id: matches.matchId })
    .from(matches)
    .where(inArray(matches.matchId, ids));
  const seen = new Set(known.map(({ id }) => id));
  return Array.from(new Set(ids)).filter((id) => !seen.has(id));
};

const readHistoryPage = async (
  riot: CrawlDependencies["riot"],
  seed: Seed,
  options: Parameters<CrawlDependencies["riot"]["matchIdsByPuuid"]>[1],
  db: Database
) => {
  const ids = await riot.matchIdsByPuuid(seed.puuid, options);
  return {
    unseen: await unseenIds(db, ids),
    last: ids.length < HISTORY_PAGE_SIZE,
  };
};

interface WindowBudget {
  readonly candidateLimit: number;
  candidates: number;
  inserted: number;
  readonly limit: number;
}

const budgetSpent = ({
  inserted,
  candidates,
  limit,
  candidateLimit,
}: WindowBudget) => inserted >= limit || candidates >= candidateLimit;

function* candidatesForPage(
  deps: CrawlDependencies,
  ids: string[],
  queue: CrawlQueue,
  seed: Seed,
  budget: WindowBudget
) {
  for (const id of ids) {
    deps.signal?.throwIfAborted();
    if (budgetSpent(budget)) {
      return;
    }
    budget.candidates += 1;
    yield processMatch(deps, id, queue, seed.id);
  }
}

const finishWindow = async (
  { db, signal, now = Date.now }: CrawlDependencies,
  seed: Seed,
  queue: CrawlQueue,
  endTime: number
) => {
  signal?.throwIfAborted();
  const crawledUntil = new Date(endTime * SECOND_MS);
  await db.transaction(async (tx) => {
    await tx
      .select({ id: collectorState.id })
      .from(collectorState)
      .for("update");
    const [eligible] = await tx
      .select({ id: seedPlayers.id })
      .from(seedPlayers)
      .where(eq(seedPlayers.id, seed.id))
      .for("share");
    if (!eligible) {
      return;
    }
    await tx
      .insert(seedQueueProgress)
      .values({ seedPlayerId: seed.id, queueId: queue, crawledUntil })
      .onConflictDoUpdate({
        target: [seedQueueProgress.seedPlayerId, seedQueueProgress.queueId],
        set: {
          crawledUntil: sql`greatest(${seedQueueProgress.crawledUntil}, excluded.crawled_until)`,
        },
      });
    await tx.update(collectorState).set({ lastCrawlAt: new Date(now()) });
  });
};

export const crawlWindow = async (
  deps: CrawlDependencies,
  queue: CrawlQueue,
  {
    limit = Number.POSITIVE_INFINITY,
    candidateLimit = Number.POSITIVE_INFINITY,
    pageLimit = Number.POSITIVE_INFINITY,
  } = {}
) => {
  const { db, now = Date.now } = deps;
  const seed = await nextSeed(db, queue);
  const budget = { inserted: 0, candidates: 0, limit, candidateLimit };
  if (!seed) {
    return { inserted: 0, candidates: 0, complete: false, hasSeed: false };
  }
  const endTime = Math.floor(now() / SECOND_MS);
  let complete = false;
  for await (const { unseen, last } of historyPages(
    deps,
    seed,
    queue,
    endTime,
    pageLimit
  )) {
    const before = budget.candidates;
    for await (const inserted of candidatesForPage(
      deps,
      unseen,
      queue,
      seed,
      budget
    )) {
      budget.inserted += Number(inserted);
    }
    complete = last && budget.candidates - before === unseen.length;
    if (last || budgetSpent(budget)) {
      break;
    }
  }
  if (complete) {
    await finishWindow(deps, seed, queue, endTime);
  }
  return {
    inserted: budget.inserted,
    candidates: budget.candidates,
    complete,
    hasSeed: true,
  };
};

function* crawlWindows(
  deps: CrawlDependencies,
  nextQueue: () => CrawlQueue,
  budget: WindowBudget,
  limited: boolean
) {
  const windowLimit = limited ? QA_WINDOW_LIMIT : 1;
  for (
    let window = 0;
    window < windowLimit && !budgetSpent(budget);
    window += 1
  ) {
    yield crawlWindow(deps, nextQueue(), {
      limit: budget.limit - budget.inserted,
      candidateLimit: budget.candidateLimit - budget.candidates,
      pageLimit: limited ? QA_PAGES_PER_WINDOW : Number.POSITIVE_INFINITY,
    });
  }
}

export const recordCrawlError = async (
  db: Database,
  error: RiotAuthError,
  now = Date.now
) => {
  await db
    .update(collectorState)
    .set({ lastError: error.message, lastErrorAt: new Date(now()) });
};

export const crawlOnce = async (
  deps: CrawlDependencies & {
    readonly riot: RiotClient;
    readonly apiKey: string;
    readonly getVersions?: () => Promise<readonly string[]>;
    readonly nextQueue?: () => CrawlQueue;
  },
  limit?: number
) => {
  const {
    db,
    riot,
    apiKey,
    now,
    getVersions,
    nextQueue = nextCrawlQueue,
  } = deps;
  try {
    const [known] = await db
      .select({ patch: patches.patch })
      .from(patches)
      .limit(1);
    if (!known) {
      await checkPatches(db, getVersions, now);
    }
    await seedPlayersForKey(db, riot, apiKey, { sample: limit !== undefined });
    const budget = {
      inserted: 0,
      candidates: 0,
      limit: limit ?? Number.POSITIVE_INFINITY,
      candidateLimit:
        limit === undefined
          ? Number.POSITIVE_INFINITY
          : limit * QA_CANDIDATE_MULTIPLIER,
    };
    for await (const result of crawlWindows(
      deps,
      nextQueue,
      budget,
      limit !== undefined
    )) {
      budget.inserted += result.inserted;
      budget.candidates += result.candidates;
      if (!result.hasSeed) {
        break;
      }
    }
    if (budget.inserted > 0) {
      await db
        .update(collectorState)
        .set({ lastCrawlAt: new Date((now ?? Date.now)()) });
    }
    return budget.inserted;
  } catch (error) {
    if (error instanceof RiotAuthError) {
      await recordCrawlError(db, error, now);
    }
    throw error;
  }
};
