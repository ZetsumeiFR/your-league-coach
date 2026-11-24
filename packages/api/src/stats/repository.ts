import {
  type BlendedPatchCounts,
  blendPatches,
  type PatchCounts,
} from "@your-league-coach/coach/stats/blend";
import type { Database } from "@your-league-coach/db";
import {
  buildStats,
  championRoleStats,
  collectorState,
  itemVsEnemyStats,
  matchupStats,
  patches,
  synergyStats,
} from "@your-league-coach/db/schema/lol";
import { previousPatch } from "@your-league-coach/lol-data/patch";
import type { StatsGroup } from "@your-league-coach/lol-data/queues";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

export interface PatchWindow {
  readonly ddragonVersion: string;
  readonly patch: string;
  readonly previous: string | null;
}

interface CountRow extends PatchCounts {
  readonly patch: string;
}

export type Blended<T extends CountRow> = Omit<T, "patch" | "games" | "wins"> &
  BlendedPatchCounts;

const NO_GAMES: PatchCounts = { games: 0, wins: 0 };

/** Each participant adds one champion-role row, so ten rows make one match. */
const PARTICIPANTS_PER_MATCH = 10;

export async function loadPatchWindow(
  db: Database
): Promise<PatchWindow | null> {
  const rows = await db
    .select({
      patch: patches.patch,
      ddragonVersion: patches.ddragonVersion,
      isCurrent: patches.isCurrent,
    })
    .from(patches);
  const current = rows.find(({ isCurrent }) => isCurrent);
  if (!current) {
    return null;
  }
  return {
    patch: current.patch,
    ddragonVersion: current.ddragonVersion,
    previous: previousPatch(
      current.patch,
      rows.map(({ patch }) => patch)
    ),
  };
}

const windowPatches = ({ patch, previous }: PatchWindow): string[] =>
  previous === null ? [patch] : [patch, previous];

/** Pairs each key's current and previous rows and blends them; a key seen on one patch only blends with zero counts. */
function blendRows<T extends CountRow>(
  rows: readonly T[],
  window: PatchWindow,
  keyOf: (row: T) => string
): Blended<T>[] {
  const pairs = new Map<string, { current?: T; previous?: T }>();
  for (const row of rows) {
    const key = keyOf(row);
    const pair = pairs.get(key) ?? {};
    if (row.patch === window.patch) {
      pair.current = row;
    } else {
      pair.previous = row;
    }
    pairs.set(key, pair);
  }
  return [...pairs.values()].flatMap(({ current, previous }) => {
    const sample = current ?? previous;
    if (!sample) {
      return [];
    }
    const { patch: _patch, games: _games, wins: _wins, ...rest } = sample;
    return [
      { ...rest, ...blendPatches(current ?? NO_GAMES, previous ?? NO_GAMES) },
    ];
  });
}

export async function loadChampionRoleStats(
  db: Database,
  window: PatchWindow,
  statsGroup: StatsGroup,
  championIds?: readonly number[]
) {
  const filters: SQL[] = [
    inArray(championRoleStats.patch, windowPatches(window)),
    eq(championRoleStats.statsGroup, statsGroup),
  ];
  if (championIds) {
    filters.push(inArray(championRoleStats.championId, [...championIds]));
  }
  const rows = await db
    .select({
      patch: championRoleStats.patch,
      championId: championRoleStats.championId,
      role: championRoleStats.role,
      games: championRoleStats.games,
      wins: championRoleStats.wins,
    })
    .from(championRoleStats)
    .where(and(...filters));
  return blendRows(rows, window, (row) => `${row.championId}:${row.role}`);
}

export interface MatchupFilter {
  readonly opponentChampionIds?: readonly number[];
  readonly opponentRole?: string;
  readonly role?: string;
}

export async function loadMatchupStats(
  db: Database,
  window: PatchWindow,
  statsGroup: StatsGroup,
  { role, opponentRole, opponentChampionIds }: MatchupFilter
) {
  const filters: SQL[] = [
    inArray(matchupStats.patch, windowPatches(window)),
    eq(matchupStats.statsGroup, statsGroup),
  ];
  if (role !== undefined) {
    filters.push(eq(matchupStats.role, role));
  }
  if (opponentRole !== undefined) {
    filters.push(eq(matchupStats.opponentRole, opponentRole));
  }
  if (opponentChampionIds) {
    filters.push(
      inArray(matchupStats.opponentChampionId, [...opponentChampionIds])
    );
  }
  const rows = await db
    .select({
      patch: matchupStats.patch,
      championId: matchupStats.championId,
      role: matchupStats.role,
      opponentChampionId: matchupStats.opponentChampionId,
      opponentRole: matchupStats.opponentRole,
      games: matchupStats.games,
      wins: matchupStats.wins,
    })
    .from(matchupStats)
    .where(and(...filters));
  return blendRows(
    rows,
    window,
    (row) =>
      `${row.championId}:${row.role}:${row.opponentChampionId}:${row.opponentRole}`
  );
}

export async function loadSynergyStats(
  db: Database,
  window: PatchWindow,
  statsGroup: StatsGroup,
  role: string,
  allyChampionIds: readonly number[]
) {
  const rows = await db
    .select({
      patch: synergyStats.patch,
      championId: synergyStats.championId,
      role: synergyStats.role,
      allyChampionId: synergyStats.allyChampionId,
      allyRole: synergyStats.allyRole,
      games: synergyStats.games,
      wins: synergyStats.wins,
    })
    .from(synergyStats)
    .where(
      and(
        inArray(synergyStats.patch, windowPatches(window)),
        eq(synergyStats.statsGroup, statsGroup),
        eq(synergyStats.role, role),
        inArray(synergyStats.allyChampionId, [...allyChampionIds])
      )
    );
  return blendRows(
    rows,
    window,
    (row) =>
      `${row.championId}:${row.role}:${row.allyChampionId}:${row.allyRole}`
  );
}

export async function loadBuildStats(
  db: Database,
  window: PatchWindow,
  statsGroup: StatsGroup,
  championId: number,
  role: string
) {
  const rows = await db
    .select({
      patch: buildStats.patch,
      kind: buildStats.kind,
      key: buildStats.key,
      games: buildStats.games,
      wins: buildStats.wins,
    })
    .from(buildStats)
    .where(
      and(
        inArray(buildStats.patch, windowPatches(window)),
        eq(buildStats.statsGroup, statsGroup),
        eq(buildStats.championId, championId),
        eq(buildStats.role, role)
      )
    );
  return blendRows(rows, window, (row) => `${row.kind}:${row.key}`);
}

export async function loadItemVsEnemyStats(
  db: Database,
  window: PatchWindow,
  statsGroup: StatsGroup,
  championId: number,
  role: string
) {
  const rows = await db
    .select({
      patch: itemVsEnemyStats.patch,
      itemId: itemVsEnemyStats.itemId,
      enemyProfile: itemVsEnemyStats.enemyProfile,
      games: itemVsEnemyStats.games,
      wins: itemVsEnemyStats.wins,
    })
    .from(itemVsEnemyStats)
    .where(
      and(
        inArray(itemVsEnemyStats.patch, windowPatches(window)),
        eq(itemVsEnemyStats.statsGroup, statsGroup),
        eq(itemVsEnemyStats.championId, championId),
        eq(itemVsEnemyStats.role, role)
      )
    );
  return blendRows(rows, window, (row) => `${row.itemId}:${row.enemyProfile}`);
}

export async function loadMatchCounts(
  db: Database,
  patch: string
): Promise<Record<StatsGroup, number>> {
  const rows = await db
    .select({
      statsGroup: championRoleStats.statsGroup,
      games: sql<number>`coalesce(sum(${championRoleStats.games}), 0)`.mapWith(
        Number
      ),
    })
    .from(championRoleStats)
    .where(eq(championRoleStats.patch, patch))
    .groupBy(championRoleStats.statsGroup);
  const matchesOf = (group: StatsGroup): number =>
    Math.floor(
      (rows.find(({ statsGroup }) => statsGroup === group)?.games ?? 0) /
        PARTICIPANTS_PER_MATCH
    );
  return { sr: matchesOf("sr"), aram: matchesOf("aram") };
}

export async function loadCollectorState(db: Database) {
  const [state] = await db
    .select({
      lastCrawlAt: collectorState.lastCrawlAt,
      lastAggregateAt: collectorState.lastAggregateAt,
      lastError: collectorState.lastError,
      lastErrorAt: collectorState.lastErrorAt,
    })
    .from(collectorState)
    .where(eq(collectorState.id, 1));
  return state ?? null;
}
