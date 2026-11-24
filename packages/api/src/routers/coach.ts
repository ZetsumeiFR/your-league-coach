import { baseBuild } from "@your-league-coach/coach/build/base";
import { isDefensive } from "@your-league-coach/coach/build/rule-items";
import { applyBuildRules } from "@your-league-coach/coach/build/rules";
import { computeEnemyProfile } from "@your-league-coach/coach/build/traits";
import { suggestBans } from "@your-league-coach/coach/draft/bans";
import {
  inferRevealedEnemyRoles,
  suggestPicks,
} from "@your-league-coach/coach/draft/picks";
import type { RoleDistribution } from "@your-league-coach/coach/stats/roles";
import {
  queueToStatsGroup,
  type StatsGroup,
} from "@your-league-coach/lol-data/queues";
import { ROLES, type Role } from "@your-league-coach/lol-data/roles";
import {
  type BlendSources,
  type BuildRecommendation,
  banSuggestionsSchema,
  buildInputSchema,
  buildRecommendationSchema,
  coachMetaSchema,
  draftInputSchema,
  type NextItem,
  nextItemsInputSchema,
  nextItemsSchema,
  pickSuggestionsSchema,
  type ReasonCode,
} from "@your-league-coach/lol-data/types";

import type { Context } from "../context";
import { coachProcedure } from "../index";
import {
  type CurrentRoleGames,
  loadBuildStats,
  loadChampionRoleStats,
  loadCollectorState,
  loadItemVsEnemyStats,
  loadMatchCounts,
  loadMatchupStats,
  loadPatchWindow,
  loadSynergyStats,
  type MatchupFilter,
  type PatchWindow,
} from "../stats/repository";

const ARAM_ROLE = "ANY";
const NEXT_ITEM_COUNT = 2;
const MAX_LAST_ERROR_LENGTH = 500;

const coach = coachProcedure.errors({
  ROLE_REQUIRED: {
    status: 400,
    message: "Pick suggestions need the local player's role",
  },
  UNSUPPORTED_QUEUE: { status: 400, message: "This queue is not supported" },
  NO_STATS: { status: 503, message: "No aggregated statistics yet" },
});

interface Scope {
  readonly statsGroup: StatsGroup;
  readonly window: PatchWindow;
}

async function resolveScope(
  db: Context["db"],
  queueId: number
): Promise<Scope | "UNSUPPORTED_QUEUE" | "NO_STATS"> {
  const statsGroup = queueToStatsGroup(queueId);
  if (statsGroup === null) {
    return "UNSUPPORTED_QUEUE";
  }
  const window = await loadPatchWindow(db);
  return window ? { statsGroup, window } : "NO_STATS";
}

const NO_SOURCES: BlendSources = { currentGames: 0, previousGames: 0 };

const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

const withRole = <T extends { readonly role: string }>(
  rows: readonly T[]
): (Omit<T, "role"> & { role: Role })[] =>
  rows.flatMap(({ role, ...row }) => (isRole(role) ? [{ ...row, role }] : []));

function roleDistribution(
  rows: readonly { championId: number; role: Role; games: number }[]
): RoleDistribution {
  const distribution: Record<number, Partial<Record<Role, number>>> = {};
  for (const { championId, role, games } of rows) {
    const counts = distribution[championId] ?? {};
    counts[role] = games;
    distribution[championId] = counts;
  }
  return distribution;
}

/** Provenance of the suggested champions' own champion-role samples. */
function sumSources(
  rows: readonly { championId: number; sources: BlendSources }[],
  championIds: ReadonlySet<number>
): BlendSources {
  let currentGames = 0;
  let previousGames = 0;
  for (const { championId, sources } of rows) {
    if (championIds.has(championId)) {
      currentGames += sources.currentGames;
      previousGames += sources.previousGames;
    }
  }
  return { currentGames, previousGames };
}

function banMatchupFilter(
  poolIds: readonly number[],
  role: Role | null
): MatchupFilter | null {
  const opponentRole = role ?? undefined;
  if (poolIds.length > 0) {
    return { opponentChampionIds: poolIds, opponentRole };
  }
  // Without a pool the engine targets the role's strongest champions.
  return role === null ? null : { opponentRole };
}

function mostPlayedRole(
  rows: readonly { role: string; games: number }[]
): Role | null {
  let best: { role: Role; games: number } | null = null;
  for (const row of withRole(rows)) {
    if (best === null || row.games > best.games) {
      best = row;
    }
  }
  return best?.role ?? null;
}

interface BuildRequest {
  readonly allies: readonly number[];
  readonly championId: number;
  readonly enemies: readonly number[];
  readonly enemyItems?: readonly number[];
  readonly role: Role | null;
}

async function recommendBuild(
  context: Context,
  { statsGroup, window }: Scope,
  request: BuildRequest
): Promise<BuildRecommendation | null> {
  const { db } = context;
  const championRows = await loadChampionRoleStats(db, window, statsGroup, [
    request.championId,
  ]);
  const role =
    statsGroup === "aram"
      ? null
      : (request.role ?? mostPlayedRole(championRows));
  const statRole = statsGroup === "aram" ? ARAM_ROLE : role;
  const counts = championRows.find((row) => row.role === statRole);
  if (statRole === null || !counts) {
    return null;
  }
  const { currentGames } = counts.sources;
  const [rows, itemVsEnemyStats, staticData] = await Promise.all([
    loadBuildStats(
      db,
      window,
      statsGroup,
      request.championId,
      statRole,
      currentGames
    ),
    loadItemVsEnemyStats(
      db,
      window,
      statsGroup,
      request.championId,
      statRole,
      currentGames
    ),
    context.staticData(window.ddragonVersion),
  ]);
  const base = baseBuild({
    championId: request.championId,
    patch: window.patch,
    role,
    rows,
    games: counts.games,
    wins: counts.wins,
    sources: counts.sources,
  });
  if (!base) {
    return null;
  }
  const champions = new Map(
    staticData.champions.map((champion) => [champion.key, champion])
  );
  const items = new Map(staticData.items.map((item) => [item.id, item]));
  const resistanceItems = (request.enemyItems ?? []).filter((id) => {
    const item = items.get(id);
    return item !== undefined && isDefensive(item);
  }).length;
  return applyBuildRules(base, {
    allies: request.allies.map((id) => champions.get(id)),
    buildStats: rows,
    championCounts: counts,
    items: staticData.items,
    itemVsEnemyStats,
    player: champions.get(request.championId),
    profile: {
      ...computeEnemyProfile(request.enemies.map((id) => champions.get(id))),
      resistanceItems,
    },
    statsGroup,
  });
}

/**
 * Purchase order of the rule-adjusted build minus owned items: starters while
 * the inventory holds nothing else (consumed potions leave the inventory, so
 * they are not re-suggested mid-game), then items added by the composition
 * rules (they react to the enemy's live state), then boots, core, situational.
 */
function pickNextItems(
  build: BuildRecommendation,
  owned: ReadonlySet<number>
): NextItem[] {
  const reasons = new Map<number, ReasonCode[]>();
  for (const { added, reasonCode } of build.adjustments) {
    reasons.set(added, [...(reasons.get(added) ?? []), reasonCode]);
  }
  const starter = new Set(build.starter);
  const inStarterPhase = [...owned].every((id) => starter.has(id));
  const afterStarter = [
    ...(build.boots === null ? [] : [build.boots]),
    ...build.core,
    ...build.situational,
  ];
  const ruleItems = [...reasons.keys()].filter((id) =>
    afterStarter.includes(id)
  );
  const order = new Set([
    ...(inStarterPhase ? build.starter : []),
    ...ruleItems,
    ...afterStarter,
  ]);
  return [...order]
    .filter((itemId) => !owned.has(itemId))
    .slice(0, NEXT_ITEM_COUNT)
    .map((itemId) => ({ itemId, reasons: reasons.get(itemId) ?? [] }));
}

function currentRoleGamesOf(
  championRole: readonly {
    championId: number;
    role: string;
    sources: BlendSources;
  }[]
): CurrentRoleGames {
  const games = new Map(
    championRole.map((row) => [
      `${row.championId}:${row.role}`,
      row.sources.currentGames,
    ])
  );
  return (championId, role) => games.get(`${championId}:${role}`) ?? 0;
}

export const coachRouter = {
  meta: coach.output(coachMetaSchema).handler(async ({ context }) => {
    const [window, collector] = await Promise.all([
      loadPatchWindow(context.db),
      loadCollectorState(context.db),
    ]);
    const statsGroups = window
      ? await loadMatchCounts(context.db, window.patch)
      : { sr: 0, aram: 0 };
    return {
      patch: window?.patch ?? null,
      ddragonVersion: window?.ddragonVersion ?? null,
      statsGroups,
      collector: {
        lastCrawlAt: collector?.lastCrawlAt ?? null,
        lastAggregateAt: collector?.lastAggregateAt ?? null,
        lastError:
          collector?.lastError?.slice(0, MAX_LAST_ERROR_LENGTH) ?? null,
        lastErrorAt: collector?.lastErrorAt ?? null,
      },
    };
  }),

  suggestBans: coach
    .input(draftInputSchema)
    .output(banSuggestionsSchema)
    .handler(async ({ input, context, errors }) => {
      const scope = await resolveScope(context.db, input.queueId);
      if (typeof scope === "string") {
        throw errors[scope]();
      }
      const { statsGroup, window } = scope;
      if (statsGroup === "aram") {
        return { patch: window.patch, sources: NO_SOURCES, suggestions: [] };
      }
      const filter = banMatchupFilter(
        input.pool.map(({ championId }) => championId),
        input.role
      );
      const championRole = await loadChampionRoleStats(
        context.db,
        window,
        statsGroup
      );
      const matchups = filter
        ? await loadMatchupStats(
            context.db,
            window,
            statsGroup,
            filter,
            currentRoleGamesOf(championRole)
          )
        : [];
      const suggestions = suggestBans({
        draft: input.draft,
        pool: input.pool,
        role: input.role,
        stats: {
          championRole: withRole(championRole),
          matchups: withRole(matchups).flatMap(({ opponentRole, ...row }) =>
            isRole(opponentRole) ? [{ ...row, opponentRole }] : []
          ),
        },
      });
      return {
        patch: window.patch,
        previousPatch: window.previous,
        sources: sumSources(
          championRole,
          new Set(suggestions.map(({ championId }) => championId))
        ),
        suggestions,
      };
    }),

  suggestPicks: coach
    .input(draftInputSchema)
    .output(pickSuggestionsSchema)
    .handler(async ({ input, context, errors }) => {
      const scope = await resolveScope(context.db, input.queueId);
      if (typeof scope === "string") {
        throw errors[scope]();
      }
      const { statsGroup, window } = scope;
      if (statsGroup === "aram") {
        return { patch: window.patch, sources: NO_SOURCES, suggestions: [] };
      }
      const { role, draft } = input;
      if (role === null) {
        throw errors.ROLE_REQUIRED();
      }
      const allyIds = draft.myTeam
        .filter(({ cellId }) => cellId !== draft.localPlayerCellId)
        .map(({ championId }) => championId)
        .filter((id) => id > 0);
      const enemyIds = draft.theirTeam
        .map(({ championId }) => championId)
        .filter((id) => id > 0);
      const championRole = await loadChampionRoleStats(
        context.db,
        window,
        statsGroup
      );
      const currentRoleGames = currentRoleGamesOf(championRole);
      const [matchups, synergies, staticData] = await Promise.all([
        loadMatchupStats(
          context.db,
          window,
          statsGroup,
          { role, opponentChampionIds: enemyIds },
          currentRoleGames
        ),
        loadSynergyStats(
          context.db,
          window,
          statsGroup,
          role,
          allyIds,
          currentRoleGames
        ),
        context.staticData(window.ddragonVersion),
      ]);
      const roleRows = withRole(championRole);
      const picksInput = {
        draft,
        pool: input.pool,
        role,
        championInfo: staticData.champions,
        stats: {
          championRole: roleRows,
          matchups: withRole(matchups).flatMap(({ opponentRole, ...row }) =>
            isRole(opponentRole) ? [{ ...row, opponentRole }] : []
          ),
          synergies: withRole(synergies).flatMap(({ allyRole, ...row }) =>
            isRole(allyRole) ? [{ ...row, allyRole }] : []
          ),
          roleDistribution: roleDistribution(roleRows),
        },
      };
      const suggestions = suggestPicks(picksInput);
      return {
        patch: window.patch,
        previousPatch: window.previous,
        sources: sumSources(
          roleRows.filter((row) => row.role === role),
          new Set(suggestions.map(({ championId }) => championId))
        ),
        enemyRoles: inferRevealedEnemyRoles(picksInput),
        suggestions,
      };
    }),

  build: coach
    .input(buildInputSchema)
    .output(buildRecommendationSchema.nullable())
    .handler(async ({ input, context, errors }) => {
      const scope = await resolveScope(context.db, input.queueId);
      if (typeof scope === "string") {
        throw errors[scope]();
      }
      return await recommendBuild(context, scope, input);
    }),

  nextItems: coach
    .input(nextItemsInputSchema)
    .output(nextItemsSchema)
    .handler(async ({ input, context, errors }) => {
      const scope = await resolveScope(context.db, input.queueId);
      if (typeof scope === "string") {
        throw errors[scope]();
      }
      const build = await recommendBuild(context, scope, {
        allies: [],
        championId: input.championId,
        enemies: input.enemyChampions,
        enemyItems: input.enemyItems,
        role: input.role,
      });
      if (!build) {
        return { patch: scope.window.patch, sources: NO_SOURCES, items: [] };
      }
      return {
        patch: build.patch,
        sources: build.sources,
        items: pickNextItems(build, new Set(input.ownedItems)),
      };
    }),
};
