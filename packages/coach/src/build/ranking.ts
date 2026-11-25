import type { ItemId } from "@your-league-coach/lol-data/types";
import {
  BUILD_NEUTRAL_WIN_RATE,
  MIN_BUILD_PICK_RATE,
  PRIOR_STRENGTH,
} from "../constants";
import type { PatchCounts } from "../stats/blend";
import { smoothedWinrate } from "../stats/smoothing";

const ITEM_KEY_PATTERN = /^[1-9]\d*(?:-[1-9]\d*)*$/;
export interface Ranked<T> {
  readonly games: number;
  readonly key: string;
  readonly value: T;
  readonly winRate: number;
}

export function parseIds(key: string): ItemId[] | null {
  if (!ITEM_KEY_PATTERN.test(key)) {
    return null;
  }
  const ids = key.split("-").map(Number);
  return ids.every(Number.isSafeInteger) ? ids : null;
}

export function hasGames({ games, wins }: PatchCounts): boolean {
  return Number.isFinite(games) && games > 0 && wins >= 0 && wins <= games;
}

export function buildPrior(counts: PatchCounts): number {
  return hasGames(counts) ? counts.wins / counts.games : BUILD_NEUTRAL_WIN_RATE;
}

export function rankRow<T>(
  value: T,
  key: string,
  { games, wins }: PatchCounts,
  prior: number
): Ranked<T> {
  return {
    value,
    key,
    games,
    winRate: smoothedWinrate(wins, games, prior, PRIOR_STRENGTH),
  };
}

function compareGames<T>(a: Ranked<T>, b: Ranked<T>): number {
  return b.games - a.games || a.key.localeCompare(b.key, "en");
}

export function compareWinRate<T>(a: Ranked<T>, b: Ranked<T>): number {
  return b.winRate - a.winRate || compareGames(a, b);
}

export function rankByPickRate<T>(
  rows: readonly Ranked<T>[],
  sampleGames: number
): Ranked<T>[] {
  const qualified = rows.filter(
    ({ games }) => games >= sampleGames * MIN_BUILD_PICK_RATE
  );
  return qualified.length > 0
    ? qualified.sort(compareWinRate)
    : rows.toSorted(compareGames);
}
