import { describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  type DraftState,
  type NextItems,
  type NextItemsInput,
  nextItemsInputSchema,
} from "@your-league-coach/lol-data/types";

import { liveGameData } from "../../../scripts/fake-riot-client/fixtures/live/scenarios";
import type { NextItemsAsk } from "../src/components/in-game/use-next-items";
import type { LiveGame } from "../src/lib/desktop/events";
import {
  type LocalPlayer,
  liveQueueId,
  nextItemsInput,
} from "../src/lib/in-game/request";
import { normalizeLiveGame } from "./support/backend-mirror";
import { locked, withLocal } from "./support/ranked-drafts";

/*
 * The settings store reads the build's environment as it loads. The board's
 * query reads the settings only to send a request, and here every request is
 * answered by the test.
 */
mock.module("../src/lib/settings-store", () => ({
  getSettings: () => null,
  useSettings: () => null,
}));
const { nextAsk, nextItemsQuery } = await import(
  "../src/components/in-game/use-next-items"
);
const { classifyServerError } = await import("../src/utils/orpc");

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
const onePotionLeft: LiveGame = { ...game, myItems: [1056, 2003] };
/** Twelve entries, more than the 10 owned entries the API accepts. */
const stocked: LiveGame = {
  ...game,
  myItems: [
    1056, 2003, 2003, 2003, 2003, 2003, 2055, 2055, 3020, 3157, 3340, 6655,
  ],
};
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
  it("names the champion and every owned and enemy item, each one of a stack", () => {
    expect(game.myItems).toEqual([1056, 2003, 2003]);
    const request = nextItemsInput(game, unseenDraft);
    expect(request).toEqual({
      queueId: 420,
      role: null,
      championId: AHRI,
      ownedItems: [1056, 2003, 2003],
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

  it("changes when the player buys an item or uses one of a stack", () => {
    const bought: LiveGame = { ...game, myItems: [...game.myItems, 3020] };
    expect(nextItemsInput(bought, unseenDraft)?.ownedItems).toEqual([
      1056, 2003, 2003, 3020,
    ]);
    const request = nextItemsInput(onePotionLeft, unseenDraft);
    expect(request?.ownedItems).toEqual([1056, 2003]);
    expect(request).not.toEqual(nextItemsInput(game, unseenDraft));
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

    const kept = nextItemsInput(stocked, unseenDraft)?.ownedItems ?? [];
    expect(kept).toHaveLength(10);
    expect([...new Set(kept)]).toEqual([...new Set(stocked.myItems)]);

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

/** The same game a poll later: time and gold moved on, the items did not. */
const polledLater = (snapshot: LiveGame): LiveGame => ({
  ...snapshot,
  gameTime: snapshot.gameTime + 5,
  activePlayer: {
    ...snapshot.activePlayer,
    currentGold: snapshot.activePlayer.currentGold + 100,
  },
});

/**
 * The board's query across the snapshots of one game, run as the hook runs
 * it: one observer whose options follow the asks. The test answers every
 * request, or fails it the way an unreachable server does.
 */
const board = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const observer = new QueryObserver<NextItems>(client, {
    queryKey: ["board"],
    enabled: false,
  });
  observer.subscribe(() => undefined);
  const asked: (NextItemsInput | null)[] = [];
  const answers: NextItems[] = [];
  let isServerUp = true;
  let ask: NextItemsAsk | null = null;

  const answer = (input: NextItemsInput | null): Promise<NextItems> => {
    asked.push(input);
    if (!isServerUp) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const next: NextItems = {
      patch: "15.23",
      sources: { currentGames: asked.length, previousGames: 0 },
      items: [],
    };
    answers.push(next);
    return Promise.resolve(next);
  };

  /** Settles once no request is in flight: at once when none was sent. */
  const settled = () =>
    new Promise<void>((resolve) => {
      const unsubscribe = client.getQueryCache().subscribe(() => {
        if (client.isFetching() === 0) {
          unsubscribe();
          resolve();
        }
      });
      if (client.isFetching() === 0) {
        unsubscribe();
        resolve();
      }
    });

  return {
    answers,
    asked,
    retry: () => observer.refetch(),
    setServerUp: (isUp: boolean) => {
      isServerUp = isUp;
    },
    show: async (snapshot: LiveGame) => {
      ask = nextAsk(ask, nextItemsInput(snapshot, unseenDraft), snapshot);
      const { input } = ask;
      observer.setOptions({
        ...nextItemsQuery(ask, true),
        queryFn: () => answer(input),
      });
      await settled();
      return observer.getCurrentResult();
    },
  };
};

describe("next items requests", () => {
  it("go out once per change of items, a return to earlier items included, never at a tick", async () => {
    const view = board();
    await view.show(game);
    await view.show(polledLater(game));
    await view.show(armored);
    await view.show(polledLater(armored));
    const back = await view.show(game);
    await view.show(onePotionLeft);
    expect(view.asked).toEqual(
      [game, armored, game, onePotionLeft].map((snapshot) =>
        nextItemsInput(snapshot, unseenDraft)
      )
    );
    expect(back.data).toBe(view.answers[2]);
  });

  it("go out again for earlier items while the server is down, and fail instead of showing an earlier answer", async () => {
    const view = board();
    await view.show(game);
    await view.show(armored);
    view.setServerUp(false);
    const down = await view.show(game);
    expect(view.asked).toHaveLength(4);
    expect(down.data).toBeUndefined();
    expect(classifyServerError(down.error)).toBe("unreachable");

    view.setServerUp(true);
    const recovered = await view.retry();
    expect(view.asked).toHaveLength(5);
    expect(recovered.data).toBe(view.answers[2]);
  });

  it("go out for a change of items the request cuts away, and fail visibly while the server is down", async () => {
    const onePotionUsed: LiveGame = {
      ...stocked,
      myItems: [
        1056, 2003, 2003, 2003, 2003, 2055, 2055, 3020, 3157, 3340, 6655,
      ],
    };
    expect(nextItemsInput(onePotionUsed, unseenDraft)).toEqual(
      nextItemsInput(stocked, unseenDraft)
    );

    const online = board();
    await online.show(stocked);
    const changed = await online.show(onePotionUsed);
    expect(online.asked).toHaveLength(2);
    expect(changed.data).toBe(online.answers[1]);

    const offline = board();
    await offline.show(stocked);
    offline.setServerUp(false);
    const down = await offline.show(onePotionUsed);
    expect(offline.asked).toHaveLength(3);
    expect(down.data).toBeUndefined();
    expect(classifyServerError(down.error)).toBe("unreachable");
  });
});
