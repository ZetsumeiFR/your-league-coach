import {
  lcuPositionToRole,
  ROLES,
  type Role,
} from "@your-league-coach/lol-data/roles";
import {
  type ChampionId,
  type PickSuggestion,
  type PlayerPoolEntry,
  type ReasonCode,
  reasonCode,
} from "@your-league-coach/lol-data/types";
import {
  DRAFT_LIMITS,
  DRAFT_POOL,
  LANE_OPPONENT_WEIGHT,
  MIN_GAMES_TO_SUGGEST,
  NEUTRAL_WIN_RATE,
  POOL_BONUS_CAP,
  PRIOR_STRENGTH,
  WEIGHTS,
} from "../constants";
import { inferEnemyRoles, type RoleDistribution } from "../stats/roles";
import { smoothedWinrate } from "../stats/smoothing";
import { type ChampionDamageInfo, compositionScorer } from "./composition";
import {
  baseWinRate,
  type ChampionRoleStats,
  candidateKey,
  compareScores,
  type DraftScoringInput,
  groupByCandidate,
  isChampionId,
  type MatchupStats,
  type SynergyStats,
  unavailableChampions,
} from "./scoring";

export type { ChampionDamageInfo } from "./composition";
export type { ChampionRoleStats, MatchupStats, SynergyStats } from "./scoring";

export interface SuggestPicksInput extends DraftScoringInput {
  readonly championInfo?: readonly ChampionDamageInfo[];
  readonly stats: {
    readonly championRole: readonly ChampionRoleStats[];
    readonly matchups: readonly MatchupStats[];
    readonly synergies: readonly SynergyStats[];
    readonly roleDistribution: RoleDistribution;
  };
}

interface DraftPeer {
  readonly championId: ChampionId;
  readonly role: Role | null;
  readonly weight: number;
}

interface PairCounts {
  readonly championId: ChampionId;
  readonly games: number;
  readonly role: Role;
  readonly wins: number;
}

function poolBonus(entry: PlayerPoolEntry | undefined): number {
  if (!entry) {
    return 0;
  }
  const { masteryPoints, recentGames, recentWins } = entry;
  const recentWinRate =
    recentGames > 0 ? recentWins / recentGames : NEUTRAL_WIN_RATE;
  const mastery =
    DRAFT_POOL.scale * Math.log10(1 + masteryPoints / DRAFT_POOL.masteryUnit);
  const form =
    DRAFT_POOL.scale *
    (Math.min(recentGames, DRAFT_POOL.saturationGames) /
      DRAFT_POOL.saturationGames) *
    (recentWinRate - NEUTRAL_WIN_RATE) *
    2;
  return Math.min(POOL_BONUS_CAP, Math.max(-POOL_BONUS_CAP, mastery + form));
}

function evaluatePairs({
  peers,
  rows,
  winRate,
  kind,
}: {
  peers: readonly DraftPeer[];
  rows: readonly PairCounts[];
  winRate: number;
  kind: "matchup" | "synergy";
}): { mean: number; reasons: ReasonCode[] } {
  let total = 0;
  let weightSum = 0;
  const reasons: ReasonCode[] = [];
  for (const { championId, role, weight } of peers) {
    let wins = 0;
    let games = 0;
    for (const row of rows) {
      if (
        row.championId === championId &&
        (role === null || row.role === role)
      ) {
        wins += row.wins;
        games += row.games;
      }
    }
    const pairWinRate =
      games === 0 || kind === "matchup"
        ? smoothedWinrate(wins, games, winRate, PRIOR_STRENGTH)
        : wins / games;
    const delta = pairWinRate - winRate;
    total += weight * delta;
    weightSum += weight;
    if (delta > 0) {
      reasons.push(
        reasonCode(kind === "matchup" ? "counters" : "synergy", championId)
      );
    } else if (kind === "matchup" && delta < 0) {
      reasons.push(reasonCode("countered_by", championId));
    }
  }
  return { mean: weightSum > 0 ? total / weightSum : 0, reasons };
}

function revealedEnemies(input: SuggestPicksInput, role: Role): DraftPeer[] {
  const ids = [
    ...new Set(
      input.draft.theirTeam
        .map((member) => member.championId)
        .filter(isChampionId)
    ),
  ];
  const assignments =
    ids.length <= ROLES.length
      ? inferEnemyRoles(ids, input.stats.roleDistribution)
      : undefined;
  return ids.map((championId) => {
    const inferred = assignments?.get(championId)?.role ?? null;
    return {
      championId,
      role: inferred,
      weight: inferred === role ? LANE_OPPONENT_WEIGHT : 1,
    };
  });
}

function candidateRows(
  input: SuggestPicksInput,
  role: Role
): ChampionRoleStats[] {
  const unavailable = unavailableChampions(input.draft);
  const pickable = new Set(input.draft.pickableChampionIds);
  const rows = new Map(
    input.stats.championRole
      .filter((row) => row.role === role)
      .map((row) => [row.championId, row])
  );
  for (const entry of input.pool) {
    if (
      entry.recentGames >= DRAFT_POOL.minimumGames &&
      !rows.has(entry.championId)
    ) {
      rows.set(entry.championId, {
        championId: entry.championId,
        role,
        games: 0,
        wins: 0,
      });
    }
  }
  const experienced = new Set(
    input.pool
      .filter(({ recentGames }) => recentGames >= DRAFT_POOL.minimumGames)
      .map(({ championId }) => championId)
  );
  return [...rows.values()].filter(
    ({ championId, games }) =>
      isChampionId(championId) &&
      (games >= MIN_GAMES_TO_SUGGEST || experienced.has(championId)) &&
      !unavailable.has(championId) &&
      (pickable.size === 0 || pickable.has(championId))
  );
}

/** Uses neutral pair deltas for missing rows and omits composition scoring without full damage info. */
export function suggestPicks(input: SuggestPicksInput): PickSuggestion[] {
  const { role, draft, pool, stats, championInfo = [] } = input;
  const hasScoringStats =
    stats.championRole.length > 0 ||
    stats.matchups.length > 0 ||
    stats.synergies.length > 0;
  if (role === null || !hasScoringStats) {
    return [];
  }
  const allies = draft.myTeam
    .filter(
      ({ cellId, championId }) =>
        cellId !== draft.localPlayerCellId && isChampionId(championId)
    )
    .map(({ championId, assignedPosition }) => ({
      championId,
      role: lcuPositionToRole(assignedPosition),
      weight: 1,
    }));
  const enemies = revealedEnemies(input, role);
  const matchups = groupByCandidate(stats.matchups);
  const synergies = groupByCandidate(stats.synergies);
  const poolById = new Map(pool.map((entry) => [entry.championId, entry]));
  const composition = compositionScorer(
    allies.map(({ championId }) => championId),
    championInfo
  );

  return candidateRows(input, role)
    .map((row): PickSuggestion => {
      const { championId } = row;
      const key = candidateKey(row);
      const winRate = baseWinRate(row);
      const matchup = evaluatePairs({
        peers: enemies,
        rows: (matchups.get(key) ?? []).map((pair) => ({
          ...pair,
          championId: pair.opponentChampionId,
          role: pair.opponentRole,
        })),
        winRate,
        kind: "matchup",
      });
      const synergy = evaluatePairs({
        peers: allies,
        rows: (synergies.get(key) ?? []).map((pair) => ({
          ...pair,
          championId: pair.allyChampionId,
          role: pair.allyRole,
        })),
        winRate,
        kind: "synergy",
      });
      const entry = poolById.get(championId);
      const damage = composition(championId);
      const components = {
        strength: winRate - NEUTRAL_WIN_RATE,
        matchup: matchup.mean,
        synergy: synergy.mean,
        pool: poolBonus(entry),
      };
      const reasons: ReasonCode[] = [];
      if (components.strength > 0) {
        reasons.push("strong_on_patch");
      }
      reasons.push(...matchup.reasons, ...synergy.reasons);
      if (entry) {
        reasons.push("in_your_pool");
      }
      if (damage.balances) {
        reasons.push("balances_damage");
      }
      return {
        championId,
        components,
        reasons,
        sampleGames: Math.round(row.games),
        score:
          WEIGHTS.strength * components.strength +
          WEIGHTS.matchup * components.matchup +
          WEIGHTS.synergy * components.synergy +
          WEIGHTS.pool * components.pool +
          damage.penalty,
        winRate,
      };
    })
    .sort(compareScores)
    .slice(0, DRAFT_LIMITS.picks);
}
