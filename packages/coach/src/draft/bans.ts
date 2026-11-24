import {
  type BanSuggestion,
  type ChampionId,
  type ReasonCode,
  reasonCode,
} from "@your-league-coach/lol-data/types";
import { DRAFT_LIMITS, NEUTRAL_WIN_RATE } from "../constants";
import {
  baseWinRate,
  type ChampionRoleStats,
  candidateKey,
  compareScores,
  type DraftScoringInput,
  groupByCandidate,
  isChampionId,
  type MatchupStats,
  unavailableChampions,
} from "./scoring";

export type { ChampionRoleStats, MatchupStats } from "./scoring";

export interface SuggestBansInput extends DraftScoringInput {
  readonly stats: {
    readonly championRole: readonly ChampionRoleStats[];
    readonly matchups: readonly MatchupStats[];
  };
}

function targetIds(input: SuggestBansInput): ChampionId[] {
  const pool = input.pool.filter(({ championId }) => isChampionId(championId));
  if (pool.length > 0) {
    const ranked = pool.toSorted(
      (a, b) =>
        b.masteryPoints - a.masteryPoints ||
        b.recentGames - a.recentGames ||
        a.championId - b.championId
    );
    return [...new Set(ranked.map(({ championId }) => championId))].slice(
      0,
      DRAFT_LIMITS.banTargets
    );
  }
  const ranked = input.stats.championRole
    .filter(
      (row) =>
        row.role === input.role && row.games > 0 && isChampionId(row.championId)
    )
    .map((row) => ({ championId: row.championId, score: baseWinRate(row) }))
    .sort(compareScores);
  return ranked
    .slice(0, DRAFT_LIMITS.banTargets)
    .map(({ championId }) => championId);
}

function againstTargets(
  rows: readonly MatchupStats[],
  targets: readonly ChampionId[],
  role: SuggestBansInput["role"]
): { mean: number; reasons: ReasonCode[] } {
  let total = 0;
  const reasons: ReasonCode[] = [];
  for (const target of targets) {
    let wins = 0;
    let games = 0;
    for (const row of rows) {
      if (
        row.opponentChampionId === target &&
        (role === null || row.opponentRole === role)
      ) {
        wins += row.wins;
        games += row.games;
      }
    }
    if (games > 0) {
      const delta = wins / games - NEUTRAL_WIN_RATE;
      total += delta;
      if (delta > 0) {
        reasons.push(reasonCode("counters", target));
      }
    }
  }
  return { mean: targets.length > 0 ? total / targets.length : 0, reasons };
}

/** Ranks enemy threats across roles; without a role or pool, ranks on patch strength alone. */
export function suggestBans(input: SuggestBansInput): BanSuggestion[] {
  const unavailable = unavailableChampions(input.draft);
  const targets = targetIds(input);
  const matchups = groupByCandidate(input.stats.matchups);
  const bestByChampion = new Map<ChampionId, BanSuggestion>();
  for (const row of input.stats.championRole) {
    const { championId, games } = row;
    if (
      !(isChampionId(championId) && games > 0) ||
      unavailable.has(championId)
    ) {
      continue;
    }
    const winRate = baseWinRate(row);
    const strength = winRate - NEUTRAL_WIN_RATE;
    const matchup = againstTargets(
      matchups.get(candidateKey(row)) ?? [],
      targets,
      input.role
    );
    const suggestion: BanSuggestion = {
      championId,
      winRate,
      sampleGames: Math.round(games),
      score: strength + matchup.mean,
      reasons:
        strength > 0
          ? ["strong_on_patch", ...matchup.reasons]
          : matchup.reasons,
    };
    const current = bestByChampion.get(championId);
    if (!current || suggestion.score > current.score) {
      bestByChampion.set(championId, suggestion);
    }
  }
  return [...bestByChampion.values()]
    .sort(compareScores)
    .slice(0, DRAFT_LIMITS.bans);
}
