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

// --- Draft scoring ---
/** Neutral win rate and prior for champion-role strength. */
export const NEUTRAL_WIN_RATE = 0.5;

/** Recent-game eligibility threshold, saturation point, and bonus coefficients. */
export const DRAFT_POOL = {
  minimumGames: 10,
  saturationGames: 20,
  masteryUnit: 10_000,
  scale: 0.01,
} as const;

/** Data Dragon attack share bounds and penalty for a skewed composition. */
export const DRAFT_DAMAGE = {
  minimumAllies: 3,
  minimumShare: 0.2,
  maximumShare: 0.8,
  penalty: 0.01,
} as const;

/** Maximum picks, bans, and pool targets used for bans. */
export const DRAFT_LIMITS = { picks: 10, bans: 5, banTargets: 3 } as const;

// --- Build ---
/** Minimum share of champion-role games for the win-rate shortlist. */
export const MIN_BUILD_PICK_RATE = 0.05;
/** Maximum number of situational items in a recommendation. */
export const MAX_SITUATIONAL_ITEMS = 4;
/** Minimum profile-specific item games before preferring its result. */
export const MIN_ITEM_PROFILE_GAMES = 200;
/** Fallback win rate for build rankings without a valid sample; matches a neutral prior. */
export const BUILD_NEUTRAL_WIN_RATE = 0.5;
/** Recent win-rate deviation multiplier in the player-pool form bonus; keeps its tuned impact. */
export const RECENT_FORM_MULTIPLIER = 2;
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
