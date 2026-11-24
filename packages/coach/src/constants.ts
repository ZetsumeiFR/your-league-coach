/** Number of prior games used to shrink sparse win rates toward the baseline. */
export const PRIOR_STRENGTH = 50;

/** Current games per champion-role needed to stop blending previous data. */
export const MIN_GAMES_CURRENT_PATCH = 500;

/** Minimum champion-role sample for suggestions without a player-pool exception. */
export const MIN_GAMES_TO_SUGGEST = 150;

/** Relative weight of the lane opponent's matchup in draft scoring. */
export const LANE_OPPONENT_WEIGHT = 2;

/** Contribution of each component to the draft recommendation score. */
export const WEIGHTS = {
  strength: 1,
  matchup: 1,
  synergy: 0.5,
  pool: 1,
} as const;

/** Maximum absolute score adjustment from the player's champion pool. */
export const POOL_BONUS_CAP = 0.03;
