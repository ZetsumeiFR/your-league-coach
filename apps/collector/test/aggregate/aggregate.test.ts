import { expect, test } from "bun:test";
import type { Database } from "@your-league-coach/db";
import {
  buildStats,
  championRoleStats,
  collectorState,
  itemVsEnemyStats,
  matchParticipants,
  matchupStats,
  patches,
  synergyStats,
} from "@your-league-coach/db/schema/lol";
import { and, eq, sql } from "drizzle-orm";
import { aggregateStats, type LoadChampions } from "../../src/aggregate";
import { aggregateTables } from "../../src/aggregate-sql";
import { ingestMatch } from "../../src/ingest";
import { exampleItems, recorded } from "../match-fixtures";
import { withTestDatabase } from "../test-database";

const CURRENT = "16.22";
const PREVIOUS = "16.5";
const ARCHIVED = "16.4";
const NOW = Date.UTC(2026, 10, 24);
const WINNER = 92;
const LOSER = 75;
const expectedSR = [
  [72, "JUNGLE", 1],
  [75, "TOP", 0],
  [91, "JUNGLE", 0],
  [92, "TOP", 1],
  [99, "UTILITY", 1],
  [112, "MIDDLE", 0],
  [157, "MIDDLE", 1],
  [161, "BOTTOM", 1],
  [164, "UTILITY", 0],
  [800, "BOTTOM", 0],
] as const;

const representativeChampions: LoadChampions = async () =>
  new Map(
    expectedSR.map(([id, , win]) => [
      id,
      {
        id: `Fixture${id}`,
        tags: [],
        info: { attack: win ? 0 : 10, magic: win ? 10 : 0, defense: 0 },
      },
    ])
  );

const seedRecorded = async (db: Database) => {
  await db.insert(patches).values([
    { patch: CURRENT, ddragonVersion: "16.22.1", isCurrent: true },
    { patch: PREVIOUS, ddragonVersion: "16.5.1" },
    { patch: ARCHIVED, ddragonVersion: "16.4.1" },
  ]);
  const [sr, aram] = await Promise.all([recorded("SR"), recorded("ARAM")]);
  const inserted = await Promise.all(
    [sr, aram].map((fixture) =>
      ingestMatch(db, { ...fixture, items: exampleItems, seedTier: null })
    )
  );
  expect(inserted).toEqual([true, true]);
  return sr.match.metadata.matchId;
};

const aggregateRows = (db: Database) =>
  Promise.all(
    aggregateTables.map(async (table) => {
      const { rows } = await db.execute<{ row: Record<string, unknown> }>(sql`
      select to_jsonb(t) - 'updated_at' as row from ${table} t order by 1
    `);
      return rows;
    })
  );

test.skipIf(!process.env.DATABASE_URL)(
  "aggregates recorded SR and ARAM fixtures with directed wins and canonical build keys",
  async () => {
    await withTestDatabase(async (db) => {
      const srId = await seedRecorded(db);
      // The real fixture demonstrates match parsing; pin representative build
      // inputs on one participant to cover all API key variants exactly.
      await db
        .update(matchParticipants)
        .set({
          itemBuildOrder: [3078, 3009, 6333, 3078, 3053],
          bootsId: 3009,
          starterItems: [2003, 1055, 2003],
          summonerSpells: [12, 4],
          skillOrder: [1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2],
          perkPrimaryStyle: 8000,
          perkSubStyle: 8400,
          perks: [8010, 9111, 9104, 8299, 8444, 8451],
          statPerks: [5008, 5008, 5001],
        })
        .where(
          and(
            eq(matchParticipants.matchId, srId),
            eq(matchParticipants.championId, WINNER)
          )
        );
      await aggregateStats(db, representativeChampions, undefined, () => NOW);

      const championRows = await db.select().from(championRoleStats);
      expect(
        championRows
          .filter((row) => row.statsGroup === "sr")
          .sort((a, b) => a.championId - b.championId)
      ).toMatchObject(
        expectedSR.map(([championId, role, wins]) => ({
          championId,
          role,
          games: 1,
          wins,
        }))
      );
      const aramRows = championRows.filter((row) => row.statsGroup === "aram");
      expect(aramRows).toHaveLength(10);
      expect(
        new Set(aramRows.map(({ role, games }) => `${role}:${games}`))
      ).toEqual(new Set(["ANY:1"]));
      const matchup = await db.select().from(matchupStats);
      expect(matchup).toHaveLength(50);
      expect(
        matchup.find(
          (row) => row.championId === WINNER && row.opponentChampionId === LOSER
        )
      ).toMatchObject({ games: 1, wins: 1, role: "TOP", opponentRole: "TOP" });
      expect(
        matchup.find(
          (row) => row.championId === LOSER && row.opponentChampionId === WINNER
        )
      ).toMatchObject({ games: 1, wins: 0, role: "TOP", opponentRole: "TOP" });
      const synergy = await db.select().from(synergyStats);
      expect(synergy.filter((row) => row.statsGroup === "sr")).toHaveLength(40);
      const aramSynergy = synergy.filter((row) => row.statsGroup === "aram");
      expect(aramSynergy).toHaveLength(40);
      expect(
        new Set(aramSynergy.map(({ role, allyRole }) => `${role}:${allyRole}`))
      ).toEqual(new Set(["ANY:ANY"]));

      const builds = await db
        .select()
        .from(buildStats)
        .where(
          and(eq(buildStats.patch, CURRENT), eq(buildStats.championId, WINNER))
        );
      expect(
        builds
          .map(
            ({ kind, key, games, wins }) => `${kind}:${key}:${games}:${wins}`
          )
          .sort()
      ).toEqual([
        "boots:3009:1:1",
        "core:3078-6333-3053:1:1",
        "item:3053:1:1",
        "item:3078:1:1",
        "item:6333:1:1",
        "rune_page:8000:8010-9111-9104-8299|8400:8444-8451|5008-5008-5001:1:1",
        "skill_order:QEW|Q>E>W:1:1",
        "spells:4-12:1:1",
        "starter:1055-2003-2003:1:1",
      ]);
      const enemyItems = await db
        .select()
        .from(itemVsEnemyStats)
        .where(
          and(
            eq(itemVsEnemyStats.patch, CURRENT),
            eq(itemVsEnemyStats.championId, WINNER)
          )
        )
        .orderBy(itemVsEnemyStats.itemId);
      expect(enemyItems).toMatchObject(
        [3053, 3078, 6333].map((itemId) => ({
          itemId,
          enemyProfile: "ad_heavy",
          games: 1,
          wins: 1,
        }))
      );
      expect(await db.select().from(collectorState)).toMatchObject([
        { lastAggregateAt: new Date(NOW) },
      ]);

      const first = await aggregateRows(db);
      await aggregateStats(
        db,
        representativeChampions,
        undefined,
        () => NOW + 1
      );
      expect(await aggregateRows(db)).toEqual(first);
    });
  }
);

test.skipIf(!process.env.DATABASE_URL)(
  "replaces stale active keys, skips malformed builds and null SR roles, and preserves archived rows",
  async () => {
    await withTestDatabase(async (db) => {
      const srId = await seedRecorded(db);
      const stale = {
        statsGroup: "sr",
        role: "TOP",
        championId: 999,
        games: 5,
        wins: 4,
      };
      await db
        .insert(championRoleStats)
        .values(
          [CURRENT, PREVIOUS, ARCHIVED].map((patch) => ({ patch, ...stale }))
        );
      await db
        .update(matchParticipants)
        .set({ role: null })
        .where(
          and(
            eq(matchParticipants.matchId, srId),
            eq(matchParticipants.championId, LOSER)
          )
        );
      await db
        .update(matchParticipants)
        .set({
          itemBuildOrder: [],
          starterItems: [],
          bootsId: null,
          summonerSpells: [],
          skillOrder: [1, 1, 4],
          perks: [],
          statPerks: [],
        })
        .where(
          and(
            eq(matchParticipants.matchId, srId),
            eq(matchParticipants.championId, WINNER)
          )
        );

      await aggregateStats(db, representativeChampions);
      expect(
        await db
          .select()
          .from(championRoleStats)
          .where(eq(championRoleStats.championId, 999))
      ).toMatchObject([{ patch: ARCHIVED, games: 5, wins: 4 }]);
      expect(
        await db
          .select()
          .from(championRoleStats)
          .where(eq(championRoleStats.championId, LOSER))
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(championRoleStats)
          .where(
            and(
              eq(championRoleStats.patch, CURRENT),
              eq(championRoleStats.championId, WINNER)
            )
          )
      ).toMatchObject([{ games: 1, wins: 1 }]);
      expect(
        await db
          .select()
          .from(buildStats)
          .where(
            and(
              eq(buildStats.patch, CURRENT),
              eq(buildStats.championId, WINNER)
            )
          )
      ).toEqual([]);
      expect(await db.select().from(matchupStats)).toHaveLength(40);
    });
  }
);

test.skipIf(!process.env.DATABASE_URL)(
  "aborting at the end of a rebuild rolls back all rows and heartbeat",
  async () => {
    await withTestDatabase(async (db) => {
      const srId = await seedRecorded(db);
      await aggregateStats(db, representativeChampions, undefined, () => NOW);
      const first = await aggregateRows(db);
      await db
        .delete(matchParticipants)
        .where(eq(matchParticipants.matchId, srId));
      const stop = new AbortController();
      await expect(
        aggregateStats(db, representativeChampions, stop.signal, () => {
          stop.abort();
          return NOW + 1;
        })
      ).rejects.toThrow();
      expect(await aggregateRows(db)).toEqual(first);
      expect(await db.select().from(collectorState)).toMatchObject([
        { lastAggregateAt: new Date(NOW) },
      ]);
      await aggregateStats(db, representativeChampions);
      expect(await db.select().from(matchupStats)).toEqual([]);
    });
  }
);
