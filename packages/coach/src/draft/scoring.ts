import type { Role } from "@your-league-coach/lol-data/roles";
import type {
  ChampionId,
  DraftState,
  PlayerPoolEntry,
} from "@your-league-coach/lol-data/types";
import { NEUTRAL_WIN_RATE, PRIOR_STRENGTH } from "../constants";
import type { PatchCounts } from "../stats/blend";
import { smoothedWinrate } from "../stats/smoothing";

export interface ChampionRoleStats extends PatchCounts {
  readonly championId: ChampionId;
  readonly role: Role;
}

export interface MatchupStats extends ChampionRoleStats {
  readonly opponentChampionId: ChampionId;
  readonly opponentRole: Role;
}

export interface SynergyStats extends ChampionRoleStats {
  readonly allyChampionId: ChampionId;
  readonly allyRole: Role;
}

export interface DraftScoringInput {
  readonly draft: DraftState;
  readonly pool: readonly PlayerPoolEntry[];
  readonly role: Role | null;
}

export function isChampionId(id: ChampionId): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

export function unavailableChampions(draft: DraftState): Set<ChampionId> {
  const unavailable = new Set([
    ...draft.bans.myTeamBans,
    ...draft.bans.theirTeamBans,
    ...draft.theirTeam.map(({ championId }) => championId),
  ]);
  if (draft.localPick.completed) {
    unavailable.add(draft.localPick.championId);
  }
  for (const member of draft.myTeam) {
    unavailable.add(member.championId);
    if (member.cellId !== draft.localPlayerCellId) {
      unavailable.add(member.championPickIntent);
    }
  }
  return unavailable;
}

export const baseWinRate = (counts: PatchCounts): number =>
  smoothedWinrate(counts.wins, counts.games, NEUTRAL_WIN_RATE, PRIOR_STRENGTH);

export function compareScores(
  a: { readonly score: number; readonly championId: ChampionId },
  b: { readonly score: number; readonly championId: ChampionId }
): number {
  return b.score - a.score || a.championId - b.championId;
}

export function groupByCandidate<T extends ChampionRoleStats>(
  rows: readonly T[]
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = candidateKey(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return groups;
}

export const candidateKey = ({
  championId,
  role,
}: Pick<ChampionRoleStats, "championId" | "role">): string =>
  `${championId}:${role}`;
