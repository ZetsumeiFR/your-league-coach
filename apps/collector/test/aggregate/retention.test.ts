import { expect, test } from "bun:test";
import {
  buildStats,
  championRoleStats,
  itemVsEnemyStats,
  matches,
  matchParticipants,
  matchupStats,
  patches,
  synergyStats,
} from "@your-league-coach/db/schema/lol";
import { aggregateTables } from "../../src/aggregate-sql";
import { retainStats } from "../../src/retention";
import { withTestDatabase } from "../test-database";

test.skipIf(!process.env.DATABASE_URL)(
  "keeps two raw patches and six aggregate patches in numeric patch order",
  async () => {
    await withTestDatabase(async (db) => {
      const versions = [
        "16.11",
        "16.10",
        "16.9",
        "16.8",
        "16.7",
        "16.6",
        "16.5",
      ];
      await db.insert(patches).values(
        versions.map((patch, i) => ({
          patch,
          ddragonVersion: `${patch}.1`,
          isCurrent: i === 0,
        }))
      );
      const raw = versions.map((patch) => ({
        patch,
        matchId: `match-${patch}`,
        statsGroup: "sr",
        queueId: 420,
        durationS: 420,
        gameCreation: new Date(0),
      }));
      await db.insert(matches).values(raw);
      await db.insert(matchParticipants).values(
        raw.map(({ matchId }) => ({
          matchId,
          teamId: 100,
          championId: 92,
          win: true,
          itemsFinal: [],
          itemBuildOrder: [],
          starterItems: [],
          skillOrder: [],
          summonerSpells: [],
          perkPrimaryStyle: 0,
          perkSubStyle: 0,
          perks: [],
          statPerks: [],
        }))
      );
      const stats = versions.map((patch) => ({
        patch,
        statsGroup: "sr",
        championId: 92,
        role: "TOP",
        games: 1,
        wins: 1,
      }));
      await db.insert(championRoleStats).values(stats);
      await db.insert(matchupStats).values(
        stats.map((row) => ({
          ...row,
          opponentChampionId: 75,
          opponentRole: "TOP",
        }))
      );
      await db.insert(synergyStats).values(
        stats.map((row) => ({
          ...row,
          allyChampionId: 72,
          allyRole: "JUNGLE",
        }))
      );
      await db
        .insert(buildStats)
        .values(
          stats.map((row) => ({ ...row, kind: "boots" as const, key: "3009" }))
        );
      await db.insert(itemVsEnemyStats).values(
        stats.map((row) => ({
          ...row,
          itemId: 3078,
          enemyProfile: "balanced" as const,
        }))
      );

      expect(await retainStats(db)).toEqual({ matches: 5, aggregates: 5 });
      expect(
        new Set((await db.select().from(matches)).map(({ patch }) => patch))
      ).toEqual(new Set(versions.slice(0, 2)));
      expect(
        new Set(
          (await db.select().from(matchParticipants)).map(
            ({ matchId }) => matchId
          )
        )
      ).toEqual(new Set(raw.slice(0, 2).map(({ matchId }) => matchId)));
      const retained = await Promise.all(
        aggregateTables.map((table) =>
          db.select({ patch: table.patch }).from(table)
        )
      );
      for (const rows of retained) {
        expect(new Set(rows.map(({ patch }) => patch))).toEqual(
          new Set(versions.slice(0, 6))
        );
      }
      expect(await db.select().from(patches)).toHaveLength(7);
      expect(await retainStats(db)).toEqual({ matches: 0, aggregates: 0 });
    });
  }
);
