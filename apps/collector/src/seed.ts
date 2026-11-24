import { createHash } from "node:crypto";
import type { Database } from "@your-league-coach/db";
import { collectorState, seedPlayers } from "@your-league-coach/db/schema/lol";
import { eq, sql } from "drizzle-orm";
import { type RiotClient, SOLO_LEAGUE_QUEUE } from "./riot/client";

const TIERS = ["EMERALD", "DIAMOND"] as const;
const DIVISIONS = ["I", "II", "III", "IV"] as const;
const APEX_TIERS = ["master", "grandmaster", "challenger"] as const;
const MAX_DIVISION_PAGES = 5;
// A limited crawl only needs a sample of a single page, including legacy lookups.
const QA_SEED_COUNT = 8;
const UPSERT_BATCH_SIZE = 1000;

type SeedInput = typeof seedPlayers.$inferInsert;
type SeedClient = Pick<RiotClient, "apexLeague" | "leagueExpEntries">;

function* divisions(riot: SeedClient) {
  for (const tier of TIERS) {
    for (const division of DIVISIONS) {
      yield collectDivision(riot, tier, division);
    }
  }
}

const collectDivision = async (
  riot: SeedClient,
  tier: (typeof TIERS)[number],
  division: (typeof DIVISIONS)[number]
) => {
  const seeds: SeedInput[] = [];
  for await (const entries of leaguePages(riot, tier, division)) {
    if (!entries.length) {
      break;
    }
    for (const { puuid } of entries) {
      seeds.push({ puuid, tier });
    }
  }
  return seeds;
};

function* leaguePages(
  riot: SeedClient,
  tier: (typeof TIERS)[number],
  division: (typeof DIVISIONS)[number]
) {
  for (let page = 1; page <= MAX_DIVISION_PAGES; page += 1) {
    yield riot.leagueExpEntries(SOLO_LEAGUE_QUEUE, tier, division, page);
  }
}

function* apexPages(riot: SeedClient) {
  for (const tier of APEX_TIERS) {
    yield riot
      .apexLeague(tier)
      .then(({ entries }) => ({ entries, tier: tier.toUpperCase() }));
  }
}

const collectSeeds = async (riot: SeedClient, sample: boolean) => {
  if (sample) {
    const entries = await riot.leagueExpEntries(
      SOLO_LEAGUE_QUEUE,
      "EMERALD",
      "I",
      1,
      QA_SEED_COUNT
    );
    return entries.map((entry) => ({ ...entry, tier: "EMERALD" }));
  }
  const seeds = new Map<string, SeedInput>();
  for await (const collected of divisions(riot)) {
    for (const seed of collected) {
      seeds.set(seed.puuid, seed);
    }
  }
  for await (const { tier, entries } of apexPages(riot)) {
    for (const { puuid } of entries) {
      seeds.set(puuid, { puuid, tier });
    }
  }
  return Array.from(seeds.values());
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function* seedWrites(tx: Transaction, seeds: readonly SeedInput[]) {
  for (let index = 0; index < seeds.length; index += UPSERT_BATCH_SIZE) {
    yield tx
      .insert(seedPlayers)
      .values(seeds.slice(index, index + UPSERT_BATCH_SIZE))
      .onConflictDoUpdate({
        target: seedPlayers.puuid,
        set: { tier: sql`excluded.tier` },
      });
  }
}

export const seedPlayersForKey = async (
  db: Database,
  riot: SeedClient,
  apiKey: string,
  { force = false, sample = false } = {}
): Promise<number> => {
  const fingerprint = createHash("sha256").update(apiKey).digest("hex");
  await db.transaction(async (tx) => {
    const [state] = await tx.select().from(collectorState).for("update");
    if (state?.apiKeyFingerprint !== fingerprint) {
      await tx.execute(sql`truncate ${seedPlayers} cascade`);
      await tx.update(collectorState).set({ apiKeyFingerprint: null });
    }
  });
  const [seed] = await db
    .select({ id: seedPlayers.id })
    .from(seedPlayers)
    .limit(1);
  if (seed && !force) {
    return 0;
  }
  const seeds = await collectSeeds(riot, sample);
  await db.transaction(async (tx) => {
    for await (const result of seedWrites(tx, seeds)) {
      // The transaction commits the fingerprint only after all batches succeed.
      if (result.command !== "INSERT") {
        throw new TypeError("Unexpected seed write result");
      }
    }
    await tx
      .update(collectorState)
      .set({ apiKeyFingerprint: fingerprint })
      .where(eq(collectorState.id, 1));
  });
  return seeds.length;
};
