export const RANKED_LOCAL_CHAMPION_ID = 103;
export const RANKED_ENEMY_MIDDLE_CHAMPION_ID = 238;
export const RANKED_ALLY_CHAMPION_IDS = [86, 64, 222, 412] as const;
export const RANKED_ENEMY_CHAMPION_IDS = [
  122,
  121,
  RANKED_ENEMY_MIDDLE_CHAMPION_ID,
  51,
  89,
] as const;
export const RANKED_MY_TEAM_BAN_IDS = [157, 91] as const;
export const RANKED_THEIR_TEAM_BAN_IDS = [55, 7] as const;
/** Champion "A" of the QA seed: counters the enemy MIDDLE champion despite an even base win rate. */
export const QA_COUNTER_CHAMPION_ID = 90;
/** MIDDLE candidates the fake LCU reports as pickable; none is picked or banned in the ranked scenario. */
export const RANKED_PICKABLE_MIDDLE_IDS = [
  QA_COUNTER_CHAMPION_ID,
  1,
  4,
  13,
  34,
  45,
  61,
  69,
  99,
  101,
  112,
  127,
  134,
  163,
  245,
  268,
] as const;
export const ARAM_LOCAL_CHAMPION_ID = 22;
export const ARENA_LOCAL_CHAMPION_ID = 24;
