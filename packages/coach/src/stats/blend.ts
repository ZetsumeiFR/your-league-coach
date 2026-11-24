import { MIN_GAMES_CURRENT_PATCH } from "../constants";

export interface PatchCounts {
  readonly games: number;
  readonly wins: number;
}

export interface BlendedPatchCounts extends PatchCounts {
  readonly sources: {
    readonly currentGames: number;
    readonly previousGames: number;
  };
}

function validateCounts({ wins, games }: PatchCounts, patch: string): void {
  if (!(Number.isFinite(games) && wins >= 0 && wins <= games)) {
    throw new RangeError(
      `Expected finite ${patch} counts with 0 <= wins <= games`
    );
  }
}

/**
 * Adds a declining share of previous counts to the full current sample.
 * Sources report unweighted games from included patches, or zero when omitted.
 * Supply zero counts for a missing patch. Invalid counts throw a RangeError.
 */
export function blendPatches(
  current: PatchCounts,
  previous: PatchCounts
): BlendedPatchCounts {
  validateCounts(current, "current");
  validateCounts(previous, "previous");

  if (current.games >= MIN_GAMES_CURRENT_PATCH) {
    return {
      wins: current.wins,
      games: current.games,
      sources: { currentGames: current.games, previousGames: 0 },
    };
  }

  const previousWeight =
    (MIN_GAMES_CURRENT_PATCH - current.games) / MIN_GAMES_CURRENT_PATCH;
  return {
    wins: current.wins + previous.wins * previousWeight,
    games: current.games + previous.games * previousWeight,
    sources: { currentGames: current.games, previousGames: previous.games },
  };
}
