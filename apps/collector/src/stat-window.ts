import type { Database } from "@your-league-coach/db";
import { collectorState, patches } from "@your-league-coach/db/schema/lol";
import { comparePatch } from "@your-league-coach/lol-data/patch";
import { sql } from "drizzle-orm";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const RAW_PATCH_COUNT = 2;
export const AGGREGATE_PATCH_COUNT = 6;

export const readStatWindow = async (db: Database | Transaction) => {
  const rows = await db.select().from(patches);
  const current = rows.find((row) => row.isCurrent);
  return current
    ? rows
        .filter((row) => comparePatch(row.patch, current.patch) <= 0)
        .sort((a, b) => comparePatch(b.patch, a.patch))
    : [];
};

export const lockStatWindow = async (tx: Transaction) => {
  // Share the patch watcher's lock. Bound both lock waits and bulk statements.
  await tx.execute(sql`set local lock_timeout = '30s'`);
  await tx.execute(sql`set local statement_timeout = '2min'`);
  await tx.select({ id: collectorState.id }).from(collectorState).for("update");
};
