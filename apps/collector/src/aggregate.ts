import {
  type CompositionChampion,
  computeEnemyProfile,
} from "@your-league-coach/coach/build/traits";
import type { Database } from "@your-league-coach/db";
import { collectorState } from "@your-league-coach/db/schema/lol";
import { inArray, sql } from "drizzle-orm";
import {
  aggregateTables,
  buildCounts,
  championCounts,
  itemEnemyCounts,
  matchupCounts,
  snapshotParticipants,
  synergyCounts,
} from "./aggregate-sql";
import {
  lockStatWindow,
  RAW_PATCH_COUNT,
  readStatWindow,
  type Transaction,
} from "./stat-window";

export type LoadChampions = (
  version: string
) => Promise<ReadonlyMap<number, CompositionChampion>>;

// Keep a bounded JS working set even when both patches contain many matches.
const MATCH_BATCH_SIZE = 1000;
interface MatchTeam {
  readonly champions: number[];
  readonly match_id: string;
  readonly patch: string;
  readonly team_id: number;
}

const snapshotProfiles = async (
  tx: Transaction,
  championsByPatch: ReadonlyMap<
    string,
    ReadonlyMap<number, CompositionChampion>
  >,
  signal?: AbortSignal
) => {
  await tx.execute(sql`
    create temporary table aggregate_enemy_profiles (
      match_id text, team_id integer, profile enemy_profile,
      primary key (match_id, team_id)
    ) on commit drop
  `);
  await tx.execute(sql`create index on aggregate_participants (match_id)`);
  await writeProfiles(tx, championsByPatch, signal);
};

const profileBatch = async (
  tx: Transaction,
  championsByPatch: ReadonlyMap<
    string,
    ReadonlyMap<number, CompositionChampion>
  >,
  cursor: string | null
) => {
  const { rows } = await tx.execute<MatchTeam>(sql`
      with batch as (
        select distinct match_id from aggregate_participants
        ${cursor === null ? sql`` : sql`where match_id > ${cursor}`}
        order by match_id limit ${MATCH_BATCH_SIZE}
      )
      select p.match_id, p.team_id, p.patch, array_agg(p.champion_id) as champions
      from aggregate_participants p join batch using (match_id)
      group by p.match_id, p.team_id, p.patch order by p.match_id
    `);
  const last = rows.at(-1);
  if (!last) {
    return null;
  }
  const byMatch = Map.groupBy(rows, (team) => team.match_id);
  const profiles = rows.map(({ match_id, team_id, patch }) => {
    const champions = championsByPatch.get(patch);
    const enemies = (byMatch.get(match_id) ?? []).flatMap((team) =>
      team.team_id === team_id
        ? []
        : team.champions.map((id) => champions?.get(id))
    );
    return { match_id, team_id, profile: computeEnemyProfile(enemies).label };
  });
  await tx.execute(sql`
      insert into aggregate_enemy_profiles
      select * from jsonb_to_recordset(${JSON.stringify(profiles)}::jsonb)
        as profile(match_id text, team_id integer, profile enemy_profile)
    `);
  return last.match_id;
};

async function writeProfiles(
  tx: Transaction,
  championsByPatch: ReadonlyMap<
    string,
    ReadonlyMap<number, CompositionChampion>
  >,
  signal?: AbortSignal,
  cursor: string | null = null
): Promise<void> {
  signal?.throwIfAborted();
  const next = await profileBatch(tx, championsByPatch, cursor);
  if (next !== null) {
    await writeProfiles(tx, championsByPatch, signal, next);
  }
}

function* aggregateWrites(
  tx: Transaction,
  patchIds: string[],
  signal?: AbortSignal
) {
  for (const table of aggregateTables) {
    signal?.throwIfAborted();
    yield tx.delete(table).where(inArray(table.patch, patchIds));
  }
  for (const query of [
    championCounts,
    matchupCounts,
    synergyCounts,
    buildCounts,
    itemEnemyCounts,
  ]) {
    signal?.throwIfAborted();
    yield tx.execute(query);
  }
}

export const aggregateStats = async (
  db: Database,
  loadChampions: LoadChampions,
  signal?: AbortSignal,
  now = Date.now
) => {
  signal?.throwIfAborted();
  const window = (await readStatWindow(db)).slice(0, RAW_PATCH_COUNT);
  if (window.length === 0) {
    return false;
  }
  // Resolve metadata outside the DB lock, including provisional fallbacks.
  const championsByPatch = new Map(
    await Promise.all(
      window.map(
        async ({ patch, ddragonVersion }) =>
          [patch, await loadChampions(ddragonVersion)] as const
      )
    )
  );
  return await db.transaction(async (tx) => {
    await lockStatWindow(tx);
    const locked = (await readStatWindow(tx)).slice(0, RAW_PATCH_COUNT);
    if (
      locked.length !== window.length ||
      locked.some(
        ({ patch, ddragonVersion }, i) =>
          patch !== window[i]?.patch ||
          ddragonVersion !== window[i]?.ddragonVersion
      )
    ) {
      return false;
    }
    signal?.throwIfAborted();
    const patchIds = locked.map(({ patch }) => patch);
    // Snapshot once so concurrent ingestion cannot skew one aggregate relative
    // to another. Delete first to remove keys no longer present in raw data.
    await tx.execute(snapshotParticipants(patchIds));
    await snapshotProfiles(tx, championsByPatch, signal);
    for await (const result of aggregateWrites(tx, patchIds, signal)) {
      if (
        !("command" in result) ||
        (result.command !== "INSERT" && result.command !== "DELETE")
      ) {
        throw new TypeError("Unexpected aggregate write result");
      }
    }
    await tx.update(collectorState).set({ lastAggregateAt: new Date(now()) });
    signal?.throwIfAborted();
    return true;
  });
};
