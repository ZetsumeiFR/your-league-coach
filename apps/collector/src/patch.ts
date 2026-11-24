import type { Database } from "@your-league-coach/db";
import { collectorState, patches } from "@your-league-coach/db/schema/lol";
import { fetchVersions } from "@your-league-coach/lol-data/ddragon";
import { comparePatch, toPatch } from "@your-league-coach/lol-data/patch";
import { and, eq, ne, sql } from "drizzle-orm";

type PatchRow = typeof patches.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const RECENT_PATCH_COUNT = 2;
const VERSION = /^\d+(?:\.\d+)+$/;

const newestFirst = <T extends { readonly patch: string }>(rows: T[]) =>
  rows.sort((a, b) => comparePatch(b.patch, a.patch));

const lockState = (tx: Transaction) =>
  tx.select({ id: collectorState.id }).from(collectorState).for("update");

const setCurrent = async (tx: Transaction, patch: string) => {
  await tx
    .update(patches)
    .set({ isCurrent: false })
    .where(and(ne(patches.patch, patch), eq(patches.isCurrent, true)));
  await tx
    .update(patches)
    .set({ isCurrent: true })
    .where(eq(patches.patch, patch));
};

export const checkPatches = async (
  db: Database,
  getVersions: () => Promise<readonly string[]> = fetchVersions,
  now: () => number = Date.now
) => {
  const versions = await getVersions();
  const versionsByPatch = new Map<string, string>();
  for (const version of versions) {
    // The live feed also contains historical lolpatch_* aliases.
    if (!VERSION.test(version)) {
      continue;
    }
    const patch = toPatch(version);
    if (!versionsByPatch.has(patch)) {
      versionsByPatch.set(patch, version);
    }
  }
  if (!versionsByPatch.size) {
    throw new TypeError("No numeric Data Dragon versions");
  }
  const published = newestFirst(
    Array.from(versionsByPatch, ([patch, ddragonVersion]) => ({
      patch,
      ddragonVersion,
    }))
  );
  return await db.transaction(async (tx) => {
    await lockState(tx);
    const known = await tx.select().from(patches);
    const provisional = new Set(
      known.filter((row) => row.provisional).map((row) => row.patch)
    );
    await tx
      .insert(patches)
      .values(
        published.filter(
          (row, index) =>
            index < RECENT_PATCH_COUNT || provisional.has(row.patch)
        )
      )
      .onConflictDoUpdate({
        target: patches.patch,
        set: {
          ddragonVersion: sql`excluded.ddragon_version`,
          provisional: false,
        },
      });
    const [current, previous] = newestFirst(await tx.select().from(patches));
    if (current) {
      await setCurrent(tx, current.patch);
    }
    await tx.update(collectorState).set({ lastPatchCheckAt: new Date(now()) });
    return {
      current: current?.patch ?? null,
      previous: previous?.patch ?? null,
    };
  });
};

/** Recognize a Riot-ahead patch before applying the current/previous gate. */
export const recognizePatch = async (
  db: Database,
  gameVersion: string
): Promise<PatchRow | null> =>
  await db.transaction(async (tx) => {
    await lockState(tx);
    const known = newestFirst(await tx.select().from(patches));
    const [current, previous] = known;
    const patch = toPatch(gameVersion);
    if (!current) {
      throw new TypeError("Run the patch job before crawling");
    }
    if (comparePatch(patch, current.patch) > 0) {
      const fallback = known.find((row) => !row.provisional) ?? current;
      const [inserted] = await tx
        .insert(patches)
        .values({
          patch,
          provisional: true,
          ddragonVersion: fallback.ddragonVersion,
          isCurrent: true,
        })
        .returning();
      await setCurrent(tx, patch);
      return inserted ?? null;
    }
    return [current, previous].find((row) => row?.patch === patch) ?? null;
  });
