/** Win-rate points that fill a row's bar; the list's hint quotes this value. */
export const FULL_SCORE_POINTS = 10;

const POINTS_PER_UNIT = 100;
const FULL_BAR = 100;

/** `score` is a difference of win rates, such as 0.056 for 5.6 points. */
export const scoreBarValue = (score: number): number => {
  const filled = (score * POINTS_PER_UNIT) / FULL_SCORE_POINTS;
  return Math.round(Math.min(Math.max(filled, 0), 1) * FULL_BAR);
};
