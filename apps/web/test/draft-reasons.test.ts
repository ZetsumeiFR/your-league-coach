import { describe, expect, it } from "bun:test";

import {
  orderReasons,
  reasonKey,
  reasonVariant,
} from "../src/lib/draft/reasons";
import { scoreBarValue } from "../src/lib/draft/score";

const LANE_OPPONENT = 238;

describe("reason chips", () => {
  it("colors each draft reason as the design assigns it", () => {
    expect(
      (
        [
          "strong_on_patch",
          "counters",
          "countered_by",
          "synergy",
          "in_your_pool",
          "balances_damage",
        ] as const
      ).map(reasonVariant)
    ).toEqual([
      "success-light",
      "success-light",
      "destructive-light",
      "info-light",
      "primary-light",
      "warning-light",
    ]);
    expect(reasonVariant("anti_heal")).toBe("outline");
  });

  it("puts the lane matchup first, then the pool, then the rest", () => {
    const ordered = orderReasons(
      [
        "strong_on_patch",
        "counters:122",
        "countered_by:121",
        "counters:238",
        "synergy:86",
        "in_your_pool",
        "balances_damage",
      ],
      LANE_OPPONENT
    );
    expect(ordered.map(reasonKey)).toEqual([
      "counters:238",
      "in_your_pool",
      "strong_on_patch",
      "counters:122",
      "countered_by:121",
      "synergy:86",
      "balances_damage",
    ]);
  });

  it("ranks a lost lane matchup first too, and keeps the server's order within a rank", () => {
    const codes = ["counters:51", "counters:122", "countered_by:238"];
    expect(orderReasons(codes, LANE_OPPONENT).map(reasonKey)).toEqual([
      "countered_by:238",
      "counters:51",
      "counters:122",
    ]);
    expect(orderReasons(codes, null).map(reasonKey)).toEqual([
      "counters:51",
      "counters:122",
      "countered_by:238",
    ]);
  });

  it("drops whatever is not a reason code", () => {
    expect(
      orderReasons(
        ["nonsense", "counters:0", "<b>counters:1</b>", "", "in_your_pool"],
        null
      ).map(reasonKey)
    ).toEqual(["in_your_pool"]);
  });
});

describe("score bar", () => {
  it("fills in proportion to the score, between empty and full", () => {
    expect([-0.02, 0, 0.0056, 0.056, 0.1, 0.4].map(scoreBarValue)).toEqual([
      0, 0, 6, 56, 100, 100,
    ]);
  });
});
