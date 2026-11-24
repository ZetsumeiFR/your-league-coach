import { describe, expect, it } from "bun:test";
import { inferEnemyRoles } from "../../src/stats/roles";

const FIVE_CHAMPIONS = [266, 64, 103, 22, 89] as const;

describe("inferEnemyRoles", () => {
  it("assigns a five-champion draft with confidence equal to each role's play share", () => {
    const assignments = inferEnemyRoles(FIVE_CHAMPIONS, {
      266: { TOP: 90, MIDDLE: 10 },
      64: { JUNGLE: 95, TOP: 5 },
      103: { MIDDLE: 80, TOP: 20 },
      22: { BOTTOM: 85, UTILITY: 15 },
      89: { UTILITY: 100 },
    });

    expect([...assignments]).toEqual([
      [266, { role: "TOP", confidence: 0.9 }],
      [64, { role: "JUNGLE", confidence: 0.95 }],
      [103, { role: "MIDDLE", confidence: 0.8 }],
      [22, { role: "BOTTOM", confidence: 0.85 }],
      [89, { role: "UTILITY", confidence: 1 }],
    ]);
  });

  it("maximizes joint likelihood rather than assigning the first champion its favorite role", () => {
    // Ashe utility + Leona bottom is 0.4 * 0.8 = 0.32, vs. 0.6 * 0.2 = 0.12.
    const assignments = inferEnemyRoles([22, 89], {
      22: { BOTTOM: 60, UTILITY: 40 },
      89: { BOTTOM: 80, UTILITY: 20 },
    });

    expect([...assignments]).toEqual([
      [22, { role: "UTILITY", confidence: 0.4 }],
      [89, { role: "BOTTOM", confidence: 0.8 }],
    ]);
  });

  it("selects the higher-likelihood rotation even when both log scores round to the same value", () => {
    // Both likelihoods have denominator 10668^5. The rotation's numerator
    // is 4317808507419997590, greater than the diagonal's 4317808507419992550.
    const assignments = inferEnemyRoles(FIVE_CHAMPIONS, {
      266: { TOP: 5341, JUNGLE: 5327 },
      64: { JUNGLE: 5342, MIDDLE: 5326 },
      103: { MIDDLE: 5333, BOTTOM: 5335 },
      22: { BOTTOM: 5329, UTILITY: 5339 },
      89: { UTILITY: 5325, TOP: 5343 },
    });

    expect(FIVE_CHAMPIONS.map((id) => assignments.get(id)?.role)).toEqual([
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
      "TOP",
    ]);
  });

  it.each([1, 0.5, Number.MIN_VALUE])(
    "breaks exact ties by input and role order at count scale %s",
    (scale) => {
      // TOP/JUNGLE and JUNGLE/TOP tie: 1 * 10 = 5 * 2. Multiplying
      // the rounded confidences instead would favor JUNGLE/TOP.
      const assignments = inferEnemyRoles([266, 64], {
        266: { TOP: scale, JUNGLE: 5 * scale },
        64: { TOP: 2 * scale, JUNGLE: 10 * scale, MIDDLE: scale },
      });

      expect(assignments.get(266)?.role).toBe("TOP");
      expect(assignments.get(64)?.role).toBe("JUNGLE");
    }
  );

  it.each([{}, { 266: { TOP: 0 } }])(
    "uses uniform probabilities for zero-data champions: %j",
    (roleDistribution) => {
      const assignments = inferEnemyRoles([266, 64], {
        ...roleDistribution,
        64: { TOP: 1 },
      });

      expect([...assignments]).toEqual([
        [266, { role: "JUNGLE", confidence: 0.2 }],
        [64, { role: "TOP", confidence: 1 }],
      ]);
    }
  );

  it("returns an empty map before any enemies are revealed", () => {
    expect(inferEnemyRoles([], {}).size).toBe(0);
  });

  it("rejects six champions with a descriptive error", () => {
    expect(() => inferEnemyRoles([...FIVE_CHAMPIONS, 86], {})).toThrow(
      "more than 5 champions"
    );
  });

  it.each([Number.NaN, -1])("rejects invalid role games: %i", (games) => {
    expect(() => inferEnemyRoles([64], { 64: { JUNGLE: games } })).toThrow(
      "champion 64 in JUNGLE"
    );
  });

  it.each([
    { ids: [Number.NaN], reason: "positive integer champion ID" },
    { ids: [64, 64], reason: "duplicate champion IDs" },
  ])("rejects malformed champion lists: %j", ({ ids, reason }) => {
    expect(() => inferEnemyRoles(ids, {})).toThrow(reason);
  });
});
