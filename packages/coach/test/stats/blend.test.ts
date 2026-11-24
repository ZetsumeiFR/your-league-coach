import { describe, expect, it } from "bun:test";
import { MIN_GAMES_CURRENT_PATCH } from "../../src/constants";
import { blendPatches } from "../../src/stats/blend";

const previous = { wins: 330, games: 600 } as const;

describe("blendPatches", () => {
  it("uses the full previous patch when there are no current games", () => {
    expect(blendPatches({ wins: 0, games: 0 }, previous)).toEqual({
      wins: 330,
      games: 600,
      sources: { currentGames: 0, previousGames: 600 },
    });
  });

  it.each([MIN_GAMES_CURRENT_PATCH, MIN_GAMES_CURRENT_PATCH + 1])(
    "uses only the current patch with %i current games",
    (games) => {
      expect(blendPatches({ wins: 270, games }, previous)).toEqual({
        wins: 270,
        games,
        sources: { currentGames: games, previousGames: 0 },
      });
    }
  );

  it("adds weighted previous counts but reports the raw source counts", () => {
    // (500 - 40) / 500 = 0.92; wins = 22 + 303.6, games = 40 + 552.
    const blend = blendPatches({ wins: 22, games: 40 }, previous);
    expect(blend.wins).toBeCloseTo(325.6, 10);
    expect(blend.games).toBe(592);
    expect(blend.sources).toEqual({ currentGames: 40, previousGames: 600 });
  });

  it.each([
    { wins: 0, games: -1 },
    { wins: 4, games: 3 },
    { wins: Number.NaN, games: 5 },
  ])("rejects invalid counts from either patch: %j", (invalid) => {
    expect(() => blendPatches(invalid, previous)).toThrow("current counts");
    expect(() => blendPatches(previous, invalid)).toThrow("previous counts");
  });
});
