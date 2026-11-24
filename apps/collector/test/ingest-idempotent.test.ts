import { expect, test } from "bun:test";
import {
  matches,
  matchParticipants,
  patches,
} from "@your-league-coach/db/schema/lol";
import { toPatch } from "@your-league-coach/lol-data/patch";
import { ingestMatch } from "../src/ingest";
import { exampleItems, recorded } from "./match-fixtures";
import { withTestDatabase } from "./test-database";

test.skipIf(!process.env.DATABASE_URL)(
  "inserting identical recorded matches twice keeps exactly twenty participant rows",
  async () => {
    await withTestDatabase(async (db) => {
      const fixtures = await Promise.all([recorded("SR"), recorded("ARAM")]);
      await db.insert(patches).values(
        fixtures.map(({ match }) => ({
          patch: toPatch(match.info.gameVersion),
          ddragonVersion: match.info.gameVersion,
        }))
      );
      const inputs = fixtures.map((fixture) => ({
        ...fixture,
        items: exampleItems,
        seedTier: "EMERALD",
      }));
      const counts = async () => [
        await db.$count(matches),
        await db.$count(matchParticipants),
      ];
      expect(
        await Promise.all(inputs.map((input) => ingestMatch(db, input)))
      ).toEqual([true, true]);
      expect(await counts()).toEqual([2, 20]);
      expect(
        await Promise.all(inputs.map((input) => ingestMatch(db, input)))
      ).toEqual([false, false]);
      expect(await counts()).toEqual([2, 20]);
    });
  }
);
