import { queueToStatsGroup } from "@your-league-coach/lol-data/queues";
import {
  lcuPositionToRole,
  type Role,
} from "@your-league-coach/lol-data/roles";
import type {
  DraftState,
  PlayerPoolEntry,
} from "@your-league-coach/lol-data/types";

import type { ChampionMastery, RecentGames } from "../desktop/events";

export type DraftMode = "rift" | "aram" | "unsupported";

export const draftMode = (queueId: number): DraftMode => {
  const statsGroup = queueToStatsGroup(queueId);
  if (statsGroup === null) {
    return "unsupported";
  }
  return statsGroup === "sr" ? "rift" : "aram";
};

export type SuggestionKind = "ban" | "pick";

export const suggestionKind = (draft: DraftState): SuggestionKind =>
  draft.currentAction === "ban" && draft.isLocalPlayersTurn ? "ban" : "pick";

export const assignedRole = (draft: DraftState): Role | null => {
  const local = draft.myTeam.find(
    ({ cellId }) => cellId === draft.localPlayerCellId
  );
  return local ? lcuPositionToRole(local.assignedPosition) : null;
};

const sortedUnique = (ids: readonly number[]): number[] =>
  [...new Set(ids)].toSorted((a, b) => a - b);

/**
 * The draft reduced to what the scoring reads, in one spelling, so that two
 * snapshots that score the same share one request. The local hover, an
 * unlocked local pick and whose turn it is change no score: they are written
 * as constants here. Bans and pickable champions are sets: they are sorted.
 * Every object is rebuilt field by field, so nothing else a snapshot might
 * carry is sent.
 */
export const scoringDraft = (draft: DraftState): DraftState => ({
  queueId: draft.queueId,
  localPlayerCellId: draft.localPlayerCellId,
  myTeam: draft.myTeam.map((member) => ({
    cellId: member.cellId,
    championId: member.championId,
    championPickIntent:
      member.cellId === draft.localPlayerCellId ? 0 : member.championPickIntent,
    assignedPosition: member.assignedPosition,
  })),
  theirTeam: draft.theirTeam.map(({ cellId, championId }) => ({
    cellId,
    championId,
  })),
  bans: {
    myTeamBans: sortedUnique(draft.bans.myTeamBans),
    theirTeamBans: sortedUnique(draft.bans.theirTeamBans),
  },
  currentAction: "none",
  isLocalPlayersTurn: false,
  pickableChampionIds: sortedUnique(draft.pickableChampionIds),
  localPick: draft.localPick.completed
    ? { championId: draft.localPick.championId, completed: true }
    : { championId: 0, completed: false },
});

export interface SuggestionRequest {
  draft: DraftState;
  kind: SuggestionKind;
}

export const suggestionRequestKey = (draft: DraftState): string => {
  const request: SuggestionRequest = {
    kind: suggestionKind(draft),
    draft: scoringDraft(draft),
  };
  return JSON.stringify(request);
};

export const parseSuggestionRequest = (key: string): SuggestionRequest =>
  JSON.parse(key);

/** The most pool entries the API accepts in one request. */
const MAX_POOL_ENTRIES = 200;

/**
 * Most played recently first, in one fixed order: the cap of a request then
 * drops the least played champions, and the same pool always gives the same
 * request.
 */
export const playerPool = (
  mastery: readonly ChampionMastery[],
  recent: readonly RecentGames[]
): PlayerPoolEntry[] => {
  const entries = new Map<number, PlayerPoolEntry>();
  for (const { championId, masteryPoints } of mastery) {
    entries.set(championId, {
      championId,
      masteryPoints,
      recentGames: 0,
      recentWins: 0,
    });
  }
  for (const { championId, games, wins } of recent) {
    entries.set(championId, {
      championId,
      masteryPoints: entries.get(championId)?.masteryPoints ?? 0,
      recentGames: games,
      recentWins: wins,
    });
  }
  return [...entries.values()]
    .toSorted(
      (a, b) =>
        b.recentGames - a.recentGames ||
        b.masteryPoints - a.masteryPoints ||
        a.championId - b.championId
    )
    .slice(0, MAX_POOL_ENTRIES);
};
