import { describe, expect, it } from "bun:test";
import { smoothedWinrate } from "../../src/stats/smoothing";

describe("smoothedWinrate", () => {
  it.each([50, 0])("returns the prior for 0/0 with strength %i", (k) => {
    expect(smoothedWinrate(0, 0, 0.5, k)).toBe(0.5);
  });

  it("combines fractional observations with prior games", () => {
    // (3.5 observed wins + 2.5 prior wins) / (5 observed + 5 prior games).
    expect(smoothedWinrate(3.5, 5, 0.5, 5)).toBe(0.6);
  });

  it.each([
    { wins: 0, games: -1, priorWr: 0.5, k: 50 },
    { wins: 11, games: 10, priorWr: 0.5, k: 50 },
    { wins: Number.NaN, games: 10, priorWr: 0.5, k: 50 },
    { wins: 0, games: Number.NaN, priorWr: 0.5, k: 50 },
    { wins: 0, games: 0, priorWr: Number.NaN, k: 50 },
    { wins: 0, games: 0, priorWr: 0.5, k: Number.NaN },
  ])("rejects invalid input %j", ({ wins, games, priorWr, k }) => {
    expect(() => smoothedWinrate(wins, games, priorWr, k)).toThrow(RangeError);
  });
});
