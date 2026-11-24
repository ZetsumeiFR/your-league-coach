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

// --- Build ---
/** Minimum share of champion-role games for the win-rate shortlist. */
export const MIN_BUILD_PICK_RATE = 0.05;
/** Maximum number of situational items in a recommendation. */
export const MAX_SITUATIONAL_ITEMS = 4;
/** Minimum profile-specific item games before preferring its result. */
export const MIN_ITEM_PROFILE_GAMES = 200;
/** Dominant-damage share and trait counts required to trigger composition rules. */
export const ENEMY_BUILD_THRESHOLDS = {
  damageShare: 0.65,
  healers: 2,
  tanks: 2,
  hardCc: 3,
  resistanceItems: 3,
} as const;
/** High Data Dragon defense rating, corroborated by the Fighter class. */
export const FRONTLINE_DEFENSE_RATING = 8;
// --- End Build ---
