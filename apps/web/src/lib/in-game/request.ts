import { QUEUES, queueToStatsGroup } from "@your-league-coach/lol-data/queues";
import type { Role } from "@your-league-coach/lol-data/roles";
import type {
  DraftState,
  NextItemsInput,
} from "@your-league-coach/lol-data/types";

import { buildRole, MAX_ENEMIES, teamChampionIds } from "../build/request";
import type { LiveGame } from "../desktop/events";

/** The most owned and enemy items the API accepts in one request. */
const MAX_OWNED_ITEMS = 10;
const MAX_ENEMY_ITEMS = 50;

/**
 * A queue whose statistics fit each game mode, for a game the app saw no
 * champion select of: the game itself only tells its mode.
 */
const QUEUE_OF_GAME_MODE: Partial<Record<LiveGame["gameMode"], number>> = {
  CLASSIC: QUEUES.RANKED_SOLO,
  ARAM: QUEUES.ARAM,
};

/** Null for a game the statistics do not cover. */
export const liveQueueId = (
  game: LiveGame,
  draft: DraftState | null
): number | null => {
  const queueId = draft?.queueId ?? QUEUE_OF_GAME_MODE[game.gameMode];
  return queueId !== undefined && queueToStatsGroup(queueId) !== null
    ? queueId
    : null;
};

const isId = (value: number): boolean => Number.isInteger(value) && value > 0;

const ascending = (ids: readonly number[]): number[] =>
  ids.filter(isId).toSorted((a, b) => a - b);

export interface LocalPlayer {
  championId: number;
  draft: DraftState | null;
  pickedRole: Role | null;
}

/**
 * The request for the local player's next items, or null for a game the
 * statistics do not cover. It holds what the answer depends on and nothing
 * else, in one spelling, so every snapshot of a game gives the same request
 * until the player's items or the enemy's change. An owned item counts once
 * however many the player holds, because the answer only leaves out what is
 * owned. Every enemy item counts, each one of a stack included.
 */
export const nextItemsInput = (
  game: LiveGame,
  { championId, draft, pickedRole }: LocalPlayer
): NextItemsInput | null => {
  const queueId = liveQueueId(game, draft);
  if (queueId === null) {
    return null;
  }
  const enemyChampions = game.enemies.map((enemy) => enemy.championId);
  return {
    queueId,
    role: draft ? buildRole(draft, pickedRole) : null,
    championId,
    ownedItems: ascending([...new Set(game.myItems)]).slice(0, MAX_OWNED_ITEMS),
    enemyChampions: teamChampionIds(enemyChampions.filter(isId), MAX_ENEMIES),
    enemyItems: ascending(game.enemies.flatMap((enemy) => enemy.items)).slice(
      0,
      MAX_ENEMY_ITEMS
    ),
  };
};
