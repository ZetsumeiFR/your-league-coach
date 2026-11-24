import { describe, expect, it } from "bun:test";
import {
  type BuildRecommendation,
  buildInputSchema,
  type DraftState,
  type SkillKey,
} from "@your-league-coach/lol-data/types";

import {
  adjustmentFor,
  itemSetBlocks,
  purchaseOrder,
} from "../src/lib/build/items";
import { buildChampionId, buildInput } from "../src/lib/build/request";
import { runePageParts, shardName } from "../src/lib/build/runes";
import { maxOrder, openingSkills } from "../src/lib/build/skills";
import {
  banTurn,
  hovering,
  locked,
  rankedDrafts,
  withLocal,
} from "./support/ranked-drafts";

const aram: DraftState = {
  ...locked,
  queueId: 450,
  theirTeam: [],
  localPick: { championId: 22, completed: true },
  myTeam: locked.myTeam.map((member) => ({
    ...member,
    assignedPosition: "",
    championId: member.cellId === locked.localPlayerCellId ? 22 : 0,
    championPickIntent: 0,
  })),
};

describe("build champion", () => {
  it("is the champion the local player hovers, then the one they lock", () => {
    expect(rankedDrafts.map(buildChampionId)).toEqual([0, 0, 0, 103, 103]);
  });

  it("is a declared champion until the pick turn names another", () => {
    const declared = withLocal(banTurn, { championPickIntent: 99 });
    expect(buildChampionId(declared)).toBe(99);
    expect(
      buildChampionId({
        ...declared,
        localPick: { championId: 103, completed: false },
      })
    ).toBe(103);
  });

  it("is the assigned champion in ARAM", () => {
    expect(buildChampionId(aram)).toBe(22);
  });
});

describe("build request", () => {
  it("asks nothing while the local player has no champion", () => {
    expect(buildInput(banTurn, "MIDDLE")).toBeNull();
  });

  it("names the champion, the role and both teams, in one spelling", () => {
    const request = buildInput(hovering, null);
    expect(request).toEqual({
      queueId: 420,
      role: "MIDDLE",
      championId: 103,
      allies: [64, 86, 222, 412],
      enemies: [51, 89, 121, 122, 238],
    });
    expect(buildInputSchema.safeParse(request).success).toBe(true);
    const shuffled: DraftState = {
      ...hovering,
      myTeam: [...hovering.myTeam].reverse(),
      theirTeam: [...hovering.theirTeam].reverse(),
    };
    expect(buildInput(shuffled, null)).toEqual(request);
  });

  it("is the same request on the hover and on the lock", () => {
    expect(buildInput(locked, null)).toEqual(buildInput(hovering, null));
  });

  it("changes when an enemy is revealed, not when an ally declares a champion", () => {
    const hidden: DraftState = {
      ...hovering,
      theirTeam: hovering.theirTeam.map((member, index) =>
        index === 0 ? { ...member, championId: 0 } : member
      ),
    };
    expect(buildInput(hidden, null)?.enemies).toEqual([51, 89, 121, 238]);
    const [ally] = hovering.myTeam.filter(
      ({ cellId }) => cellId !== hovering.localPlayerCellId
    );
    const declared: DraftState = {
      ...hovering,
      myTeam: hovering.myTeam.map((member) =>
        member === ally
          ? { ...member, championId: 0, championPickIntent: 1 }
          : member
      ),
    };
    expect(buildInput(declared, null)?.allies).toEqual(
      buildInput(hovering, null)?.allies.filter((id) => id !== ally?.championId)
    );
  });

  it("uses the role the player picked when the client assigned none", () => {
    const unassigned = withLocal(hovering, { assignedPosition: "" });
    expect(buildInput(unassigned, "TOP")?.role).toBe("TOP");
    expect(buildInput(unassigned, null)?.role).toBeNull();
    expect(buildInput(hovering, "TOP")?.role).toBe("MIDDLE");
  });

  it("has no role and no enemy in ARAM", () => {
    expect(buildInput(aram, "TOP")).toEqual({
      queueId: 450,
      role: null,
      championId: 22,
      allies: [],
      enemies: [],
    });
  });
});

describe("skill order", () => {
  // What the coach answers for "QEW|Q>W>E".
  const order: SkillKey[] = [
    "Q",
    "E",
    "W",
    "Q",
    "Q",
    "R",
    "Q",
    "W",
    "Q",
    "W",
    "R",
    "W",
    "W",
    "E",
    "E",
    "R",
    "E",
    "E",
  ];

  it("reads the first three levels and the order skills are maxed in", () => {
    expect(openingSkills(order)).toEqual(["Q", "E", "W"]);
    expect(maxOrder(order)).toEqual(["Q", "W", "E"]);
  });

  it("ranks skills an order never maxes by their points, then by who came first", () => {
    expect(maxOrder(["E", "W", "Q", "W", "W", "R"])).toEqual(["W", "E", "Q"]);
    expect(maxOrder([])).toEqual(["Q", "W", "E"]);
  });
});

describe("rune page", () => {
  it("splits a page into primary runes, secondary runes and shards", () => {
    expect(
      runePageParts([8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011])
    ).toEqual({
      primary: [8112, 8139, 8140, 8135],
      secondary: [8226, 8210],
      shards: [5008, 5008, 5011],
    });
  });

  it("names the shards the game has and no other id", () => {
    expect(shardName(5008)).toBe("adaptiveForce");
    expect(shardName(8112)).toBeNull();
  });
});

describe("items", () => {
  const build: Pick<
    BuildRecommendation,
    "adjustments" | "boots" | "core" | "situational" | "starter"
  > = {
    starter: [1056, 2003, 2003],
    boots: 3020,
    core: [6655, 4645, 3089],
    situational: [3157, 3165],
    adjustments: [
      {
        ruleId: "anti_heal",
        reasonCode: "anti_heal",
        replaced: 3116,
        added: 3165,
      },
    ],
  };
  const titles = {
    starter: "Start",
    boots: "Boots",
    core: "Core",
    situational: "Situational",
  };

  it("orders purchases: start, boots, then each core item", () => {
    expect(
      purchaseOrder(build).map(({ coreRank, items, slot }) => ({
        slot,
        coreRank,
        items,
      }))
    ).toEqual([
      {
        slot: "starter",
        coreRank: 0,
        items: [
          { itemId: 1056, count: 1 },
          { itemId: 2003, count: 2 },
        ],
      },
      { slot: "boots", coreRank: 0, items: [{ itemId: 3020, count: 1 }] },
      { slot: "core", coreRank: 1, items: [{ itemId: 6655, count: 1 }] },
      { slot: "core", coreRank: 2, items: [{ itemId: 4645, count: 1 }] },
      { slot: "core", coreRank: 3, items: [{ itemId: 3089, count: 1 }] },
    ]);
    const bootless = purchaseOrder({ ...build, starter: [], boots: null });
    expect(bootless.map(({ slot }) => slot)).toEqual(["core", "core", "core"]);
    expect(new Set(purchaseOrder(build).map(({ id }) => id)).size).toBe(5);
  });

  it("groups the build for the in-game shop and leaves empty groups out", () => {
    expect(itemSetBlocks(build, titles)).toEqual([
      {
        type: "Start",
        items: [
          { id: 1056, count: 1 },
          { id: 2003, count: 2 },
        ],
      },
      { type: "Boots", items: [{ id: 3020, count: 1 }] },
      {
        type: "Core",
        items: [
          { id: 6655, count: 1 },
          { id: 4645, count: 1 },
          { id: 3089, count: 1 },
        ],
      },
      {
        type: "Situational",
        items: [
          { id: 3157, count: 1 },
          { id: 3165, count: 1 },
        ],
      },
    ]);
    expect(
      itemSetBlocks({ ...build, boots: null, situational: [] }, titles).map(
        ({ type }) => type
      )
    ).toEqual(["Start", "Core"]);
  });

  it("finds the adjustment that put an item in the build", () => {
    expect(adjustmentFor(build.adjustments, 3165)?.ruleId).toBe("anti_heal");
    expect(adjustmentFor(build.adjustments, 3157)).toBeNull();
    expect(adjustmentFor(build.adjustments, 3116)).toBeNull();
  });
});
