import { expect, test } from "bun:test";
import { collectorState, patches } from "@your-league-coach/db/schema/lol";
import { createCrawlQueueRotation, historyStartTime } from "../src/crawl";
import { checkPatches, recognizePatch } from "../src/patch";
import { withTestDatabase } from "./test-database";

test.skipIf(!process.env.DATABASE_URL)(
  "recognizes a Riot-ahead patch before filtering and confirms it after publication",
  async () => {
    await withTestDatabase(async (db) => {
      const now = () => Date.UTC(2026, 10, 24);
      expect(
        await checkPatches(
          db,
          async () => ["15.23.1", "15.22.1", "lolpatch_7.20"],
          now
        )
      ).toEqual({ current: "15.23", previous: "15.22" });
      expect(await recognizePatch(db, "15.24.1.1")).toMatchObject({
        patch: "15.24",
        isCurrent: true,
        provisional: true,
        ddragonVersion: "15.23.1",
      });
      expect(
        await checkPatches(db, async () => ["15.23.1", "15.22.1"], now)
      ).toEqual({ current: "15.24", previous: "15.23" });
      expect(await recognizePatch(db, "15.23.1.1")).toMatchObject({
        isCurrent: false,
      });
      expect(await recognizePatch(db, "15.21.3.4")).toBeNull();
      await checkPatches(db, async () => ["15.24.1", "15.23.1"], now);
      expect(
        (await db.select().from(patches)).filter((row) => row.isCurrent)
      ).toMatchObject([
        { patch: "15.24", provisional: false, ddragonVersion: "15.24.1" },
      ]);
      expect(await db.select().from(collectorState)).toMatchObject([
        { lastPatchCheckAt: new Date(now()) },
      ]);
    });
  }
);

test("uses a 28-day backfill only when the selected queue has no watermark", () => {
  expect(historyStartTime(3_000_000)).toBe(580_800);
  expect(historyStartTime(3_000_000, new Date(1_000_000))).toBe(1000);
});

test("smoothly rotates all four queues and preserves 60/20/10/10 shares", () => {
  const next = createCrawlQueueRotation();
  const windows = Array.from({ length: 1000 }, () => next());
  expect(windows.slice(0, 10)).toEqual([
    420, 450, 420, 420, 440, 420, 400, 420, 450, 420,
  ]);
  expect(
    [420, 450, 440, 400].map(
      (queue) => windows.filter((id) => id === queue).length
    )
  ).toEqual([600, 200, 100, 100]);
});
