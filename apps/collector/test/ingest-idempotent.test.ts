import { expect, test } from "bun:test";
import {
  collectorState,
  matches,
  matchParticipants,
  patches,
} from "@your-league-coach/db/schema/lol";
import { toPatch } from "@your-league-coach/lol-data/patch";
import { ingestMatch } from "../src/ingest";
import { matchSchema } from "../src/riot/schemas";
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

test.skipIf(!process.env.DATABASE_URL)(
  "records a permanent skip for missing rune styles, selections or shards without writing raw rows",
  async () => {
    await withTestDatabase(async (db) => {
      const fixture = await recorded("SR");
      const [first, ...others] = fixture.match.info.participants;
      if (!first?.perks) {
        throw new TypeError("Expected valid fixture perks");
      }
      const { styles, statPerks } = first.perks;
      const now = () => Date.UTC(2026, 10, 24);
      const malformed = [
        { styles: [], statPerks },
        {
          styles: [
            { ...styles[0], selections: styles[0].selections.slice(0, 3) },
            styles[1],
          ],
          statPerks,
        },
        {
          styles,
          statPerks: { offense: statPerks.offense, flex: statPerks.flex },
        },
      ];
      await db.insert(patches).values({
        patch: toPatch(fixture.match.info.gameVersion),
        ddragonVersion: "16.22.1",
      });
      const inputs = malformed.map((perks) => ({
        ...fixture,
        match: matchSchema.parse({
          ...fixture.match,
          info: {
            ...fixture.match.info,
            participants: [{ ...first, perks }, ...others],
          },
        }),
        seedTier: "EMERALD",
        items: exampleItems,
      }));
      expect(
        await Promise.all(
          inputs.map((input) => ingestMatch(db, input, { now }))
        )
      ).toEqual([false, false, false]);
      expect(await db.$count(matches)).toBe(0);
      expect(await db.$count(matchParticipants)).toBe(0);
      expect(
        await db
          .select({
            reason: collectorState.lastError,
            at: collectorState.lastErrorAt,
          })
          .from(collectorState)
      ).toEqual([
        { reason: "Skipped match: malformed rune page", at: new Date(now()) },
      ]);
    });
  }
);
