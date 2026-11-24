import type { Database } from "@your-league-coach/db";
import { matches } from "@your-league-coach/db/schema/lol";
import { notInArray } from "drizzle-orm";
import { aggregateTables } from "./aggregate-sql";
import {
  AGGREGATE_PATCH_COUNT,
  lockStatWindow,
  RAW_PATCH_COUNT,
  readStatWindow,
  type Transaction,
} from "./stat-window";

function* deleteArchived(
  tx: Transaction,
  keep: string[],
  signal?: AbortSignal
) {
  for (const table of aggregateTables) {
    signal?.throwIfAborted();
    yield tx.delete(table).where(notInArray(table.patch, keep));
  }
}

export const retainStats = async (db: Database, signal?: AbortSignal) =>
  await db.transaction(async (tx) => {
    signal?.throwIfAborted();
    await lockStatWindow(tx);
    const known = (await readStatWindow(tx)).map(({ patch }) => patch);
    if (known.length === 0) {
      return { matches: 0, aggregates: 0 };
    }
    const raw = await tx
      .delete(matches)
      .where(notInArray(matches.patch, known.slice(0, RAW_PATCH_COUNT)));
    let aggregates = 0;
    for await (const result of deleteArchived(
      tx,
      known.slice(0, AGGREGATE_PATCH_COUNT),
      signal
    )) {
      aggregates += result.rowCount ?? 0;
    }
    signal?.throwIfAborted();
    return { matches: raw.rowCount ?? 0, aggregates };
  });
