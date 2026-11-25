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

const byValue = (a: number, b: number): number => a - b;

const ascending = (ids: readonly number[]): number[] =>
  ids.filter(isId).toSorted(byValue);

/**
 * The owned items as the game counts them, each one of a stack. Past what the
 * API accepts the repeats go first: the answer leaves out the items owned,
 * whatever their count, so none of them may be dropped.
 */
const ownedItemsOf = (ids: readonly number[]): number[] => {
  const owned = ascending(ids);
  const repeats = owned.filter((id, index) => id === owned[index - 1]);
  return ascending([...new Set(owned), ...repeats].slice(0, MAX_OWNED_ITEMS));
};

/** Every item of a game, owned and enemy, as the game counts them. */
export interface GameItems {
  enemy: number[];
  owned: number[];
}

/**
 * The items a change of items is judged on: all of them, as the game counts
 * them, before the request is cut to what the API accepts, so a change the
 * cut hides is still a change. Sorted, so moving an item to another slot is
 * not one.
 */
export const gameItems = (game: LiveGame): GameItems => ({
  enemy: game.enemies.flatMap((enemy) => enemy.items).toSorted(byValue),
  owned: game.myItems.toSorted(byValue),
});

export interface LocalPlayer {
  championId: number;
  draft: DraftState | null;
  pickedRole: Role | null;
}

/**
 * The request for the local player's next items, or null for a game the
 * statistics do not cover. It holds what the answer depends on and nothing
 * else, in one spelling: items count as the game counts them, each one of a
 * stack included, sorted so their slots do not matter. Past what the API
 * accepts the request is cut, so two snapshots with different items can give
 * the same request: gameItems tells them apart.
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
    ownedItems: ownedItemsOf(game.myItems),
    enemyChampions: teamChampionIds(enemyChampions.filter(isId), MAX_ENEMIES),
    enemyItems: ascending(game.enemies.flatMap((enemy) => enemy.items)).slice(
      0,
      MAX_ENEMY_ITEMS
    ),
  };
};
