import { describe, expect, it } from "bun:test";
import {
  type DraftState,
  nextItemsInputSchema,
} from "@your-league-coach/lol-data/types";

import { liveGameData } from "../../../scripts/fake-riot-client/fixtures/live/scenarios";
import type { LiveGame } from "../src/lib/desktop/events";
import {
  type LocalPlayer,
  liveQueueId,
  nextItemsInput,
} from "../src/lib/in-game/request";
import { normalizeLiveGame } from "./support/backend-mirror";
import { locked, withLocal } from "./support/ranked-drafts";

const AHRI = 103;
const ZED = 238;
const CLOTH_ARMOR = 1029;

const fixtureGame = (isArmored: boolean): LiveGame => {
  const fixture = normalizeLiveGame(liveGameData(isArmored), {
    Ahri: AHRI,
    Garen: 86,
    Zed: ZED,
  });
  if (fixture === null) {
    throw new Error("The live fixture must resolve against the test catalog");
  }
  return fixture;
};

const game = fixtureGame(false);
const armored = fixtureGame(true);
const unseenDraft: LocalPlayer = {
  championId: AHRI,
  draft: null,
  pickedRole: null,
};
const seenDraft = (draft: DraftState): LocalPlayer => ({
  championId: AHRI,
  draft,
  pickedRole: null,
});

describe("next items request", () => {
  it("names the champion, each owned item once and every enemy item", () => {
    expect(game.myItems).toEqual([1056, 2003, 2003]);
    const request = nextItemsInput(game, unseenDraft);
    expect(request).toEqual({
      queueId: 420,
      role: null,
      championId: AHRI,
      ownedItems: [1056, 2003],
      enemyChampions: [ZED],
      enemyItems: [1058],
    });
    expect(nextItemsInputSchema.safeParse(request).success).toBe(true);
  });

  it("is the same request at a later tick of a game whose items did not change", () => {
    const laterTick: LiveGame = {
      ...game,
      gameTime: game.gameTime + 5,
      activePlayer: { ...game.activePlayer, currentGold: 1200, level: 10 },
      myItems: [...game.myItems].reverse(),
      allies: [],
      enemies: armored.enemies
        .map((enemy) => ({ ...enemy, items: [...enemy.items].reverse() }))
        .reverse(),
    };
    expect(nextItemsInput(laterTick, unseenDraft)).toEqual(
      nextItemsInput(armored, unseenDraft)
    );
  });

  it("changes when the enemy's items change", () => {
    const request = nextItemsInput(armored, unseenDraft);
    expect(request?.enemyItems).toEqual([3047, 3075, 3110]);
    expect(request).not.toEqual(nextItemsInput(game, unseenDraft));
  });

  it("changes when the player buys an item, not when a stack they hold shrinks", () => {
    const bought: LiveGame = { ...game, myItems: [...game.myItems, 3020] };
    expect(nextItemsInput(bought, unseenDraft)?.ownedItems).toEqual([
      1056, 2003, 3020,
    ]);
    const onePotionLeft: LiveGame = { ...game, myItems: [1056, 2003] };
    expect(nextItemsInput(onePotionLeft, unseenDraft)).toEqual(
      nextItemsInput(game, unseenDraft)
    );
  });

  it("counts every enemy item, each one of a stack", () => {
    const stacked: LiveGame = {
      ...game,
      enemies: [
        { championId: ZED, items: [CLOTH_ARMOR, CLOTH_ARMOR] },
        { championId: 122, items: [CLOTH_ARMOR] },
      ],
    };
    expect(nextItemsInput(stacked, unseenDraft)).toMatchObject({
      enemyChampions: [122, ZED],
      enemyItems: [CLOTH_ARMOR, CLOTH_ARMOR, CLOTH_ARMOR],
    });
  });

  it("stays within what the API accepts whatever the game reports", () => {
    const crowded: LiveGame = {
      ...game,
      myItems: [0, -1, 2.5, ...Array.from({ length: 14 }, (_, n) => 3000 + n)],
      enemies: Array.from({ length: 7 }, (_enemy, seat) => ({
        championId: seat,
        items: Array.from({ length: 12 }, (_item, slot) => 1000 + slot),
      })),
    };
    const request = nextItemsInput(crowded, unseenDraft);
    expect(nextItemsInputSchema.safeParse(request).success).toBe(true);
    expect(request?.ownedItems).toHaveLength(10);
    expect(request?.enemyChampions).toEqual([1, 2, 3, 4, 5]);
    expect(request?.enemyItems).toHaveLength(50);

    const bare: LiveGame = { ...game, myItems: [], enemies: [] };
    expect(nextItemsInput(bare, unseenDraft)).toMatchObject({
      ownedItems: [],
      enemyChampions: [],
      enemyItems: [],
    });
  });

  it("takes the queue and the role from the champion select the app saw", () => {
    expect(nextItemsInput(game, seenDraft(locked))).toMatchObject({
      queueId: 420,
      role: "MIDDLE",
    });
    expect(liveQueueId(game, { ...locked, queueId: 440 })).toBe(440);

    const unassigned = withLocal(locked, { assignedPosition: "" });
    const picked = { ...seenDraft(unassigned), pickedRole: "TOP" as const };
    expect(nextItemsInput(game, picked)?.role).toBe("TOP");
    expect(
      nextItemsInput(game, { ...unseenDraft, pickedRole: "TOP" })?.role
    ).toBeNull();
  });

  it("stands a queue in for the game mode when it saw no champion select", () => {
    expect(liveQueueId(game, null)).toBe(420);
    expect(liveQueueId({ ...game, gameMode: "ARAM" }, null)).toBe(450);
  });

  it("asks nothing for a game the statistics do not cover", () => {
    for (const gameMode of ["CHERRY", "SWIFTPLAY", "URF", "UNKNOWN"] as const) {
      expect(nextItemsInput({ ...game, gameMode }, unseenDraft)).toBeNull();
    }
    const arena: DraftState = { ...locked, queueId: 1700 };
    expect(nextItemsInput(game, seenDraft(arena))).toBeNull();
  });
});
