import { describe, expect, it } from "bun:test";
import { lcuPositionSchema, lcuPositionToRole } from "../src/roles";
import {
  banSuggestionsSchema,
  buildAdjustmentSchema,
  draftStateSchema,
  parseReasonCode,
  pickSuggestionsSchema,
  reasonCode,
  reasonCodeSchema,
} from "../src/types";

const pickRow = {
  championId: 1,
  score: 0.02,
  components: { strength: 0.02, matchup: 0, synergy: 0, pool: 0 },
  winRate: 0.52,
  sampleGames: 640,
};
const sources = { currentGames: 40, previousGames: 600 };

describe("reason codes", () => {
  it("accepts plain and parameterized codes", () => {
    for (const code of [
      "strong_on_patch",
      "in_your_pool",
      "balances_damage",
      "counters:122",
      "countered_by:1",
      "synergy:266",
      "anti_heal",
      "frontline_missing",
      "penetration_vs_tanks",
    ]) {
      expect(reasonCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("rejects garbage, unknown kinds and malformed ids", () => {
    for (const code of [
      "",
      "nonsense",
      "counters",
      "counters:",
      "counters:0",
      "counters:-1",
      "counters:01",
      "counters:12.5",
      "balances_damage:3",
      "nonsense:122",
      "counters:122:1",
    ]) {
      expect(reasonCodeSchema.safeParse(code).success).toBe(false);
    }
    expect(reasonCodeSchema.safeParse(122).success).toBe(false);
  });

  it("builds and parses codes round-trip", () => {
    expect(reasonCode("counters", 122)).toBe("counters:122");
    expect(parseReasonCode("counters:122")).toEqual({
      kind: "counters",
      championId: 122,
    });
    expect(parseReasonCode("balances_damage")).toEqual({
      kind: "balances_damage",
    });
    expect(parseReasonCode("counters:0")).toBeNull();
  });
});

describe("suggestion responses", () => {
  it("keeps patch, sources and string reasons for picks", () => {
    const parsed = pickSuggestionsSchema.parse({
      patch: "15.23",
      sources,
      suggestions: [
        { ...pickRow, reasons: ["counters:122", "balances_damage"] },
      ],
    });
    expect(parsed.patch).toBe("15.23");
    expect(parsed.sources).toEqual(sources);
    expect(parsed.suggestions[0]?.reasons).toEqual([
      "counters:122",
      "balances_damage",
    ]);
  });

  it("keeps patch and sources for bans", () => {
    const parsed = banSuggestionsSchema.parse({
      patch: "15.23",
      sources,
      suggestions: [
        {
          championId: 5,
          score: 0.03,
          winRate: 0.54,
          sampleGames: 900,
          reasons: ["strong_on_patch"],
        },
      ],
    });
    expect(parsed.sources.previousGames).toBe(600);
  });

  it("rejects a response without provenance", () => {
    expect(pickSuggestionsSchema.safeParse({ suggestions: [] }).success).toBe(
      false
    );
  });
});

describe("build adjustment", () => {
  it("round-trips a replacement and a plain addition", () => {
    const replacement = {
      ruleId: "anti_heal",
      reasonCode: "anti_heal",
      replaced: 3001,
      added: 3165,
    };
    expect(buildAdjustmentSchema.parse(replacement)).toEqual(replacement);
    const addition = {
      ruleId: "frontline_missing",
      reasonCode: "frontline_missing",
      added: 3075,
    };
    expect(buildAdjustmentSchema.parse(addition)).toEqual(addition);
  });

  it("rejects unknown rule ids and missing added item", () => {
    expect(
      buildAdjustmentSchema.safeParse({
        ruleId: "nope",
        reasonCode: "anti_heal",
        added: 1,
      }).success
    ).toBe(false);
    expect(
      buildAdjustmentSchema.safeParse({
        ruleId: "anti_heal",
        reasonCode: "anti_heal",
      }).success
    ).toBe(false);
  });
});

describe("draft state wire contract", () => {
  const draft = {
    queueId: 420,
    localPlayerCellId: 0,
    myTeam: [
      {
        cellId: 0,
        championId: 0,
        championPickIntent: 0,
        assignedPosition: "bottom",
      },
      { cellId: 1, championId: 0, championPickIntent: 0, assignedPosition: "" },
    ],
    theirTeam: [{ cellId: 5, championId: 0 }],
    bans: { myTeamBans: [1], theirTeamBans: [] },
    currentAction: "ban",
    isLocalPlayersTurn: true,
    pickableChampionIds: [],
    localPick: { championId: 0, completed: false },
  };

  it("accepts raw LCU position strings including empty", () => {
    const parsed = draftStateSchema.parse(draft);
    expect(
      parsed.myTeam.map((m) => lcuPositionToRole(m.assignedPosition))
    ).toEqual(["BOTTOM", null]);
  });

  it("rejects normalized roles in assignedPosition", () => {
    expect(lcuPositionSchema.safeParse("BOTTOM").success).toBe(false);
    expect(
      draftStateSchema.safeParse({
        ...draft,
        myTeam: [{ ...draft.myTeam[0], assignedPosition: "BOTTOM" }],
      }).success
    ).toBe(false);
  });
});
