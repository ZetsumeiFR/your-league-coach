/**
 * Shrinks the observed win rate toward priorWr as though the prior supplied k
 * games. Fractional counts from patch blending are valid. An empty sample
 * returns the prior even when k is zero. Invalid inputs throw a RangeError.
 */
export function smoothedWinrate(
  wins: number,
  games: number,
  priorWr: number,
  k: number
): number {
  if (!(Number.isFinite(games) && wins >= 0 && wins <= games)) {
    throw new RangeError("Expected finite counts with 0 <= wins <= games");
  }
  if (!(priorWr >= 0 && priorWr <= 1)) {
    throw new RangeError("Expected a prior win rate between 0 and 1");
  }
  if (!(Number.isFinite(k) && k >= 0)) {
    throw new RangeError("Expected a finite non-negative prior strength");
  }
  if (games === 0) {
    return priorWr;
  }
  const totalGames = games + k;
  if (!Number.isFinite(totalGames)) {
    throw new RangeError("Combined observed and prior games must be finite");
  }
  return (wins + priorWr * k) / totalGames;
}
