import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { call, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Database } from "@your-league-coach/db";
import {
  buildStats,
  championRoleStats,
  collectorState,
  matchupStats,
} from "@your-league-coach/db/schema/lol";
import {
  type DraftState,
  draftInputSchema,
  type PlayerPoolEntry,
} from "@your-league-coach/lol-data/types";
import { eq } from "drizzle-orm";

import {
  ARAM_LOCAL_CHAMPION_ID,
  QA_COUNTER_CHAMPION_ID,
  RANKED_ENEMY_MIDDLE_CHAMPION_ID,
  RANKED_LOCAL_CHAMPION_ID,
  RANKED_PICKABLE_MIDDLE_IDS,
} from "../../../scripts/fake-riot-client/fixtures/ids";
import type { Context } from "../src/context";
import { logProcedureErrors } from "../src/error-log";
import { appRouter } from "../src/routers/index";
import { rankedDrafts, revealOnly } from "./support/ranked-draft";
import {
  createScratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db";
import {
  QA_CURRENT_PATCH,
  QA_LOCAL_BUILD,
  QA_PREVIOUS_PATCH,
  resetStats,
  seedPatches,
  seedQaStats,
} from "./support/seed-qa-stats";
import { TEST_STATIC_DATA } from "./support/static-data";

const BASE_DATABASE_URL = process.env.DATABASE_URL;
const ACCESS_KEY = "t".repeat(40);
const NOW = new Date("2026-11-24T10:00:00.000Z");
const LOW_BASE_WIN_RATE = 0.52;
const POOL: PlayerPoolEntry[] = [
  {
    championId: RANKED_LOCAL_CHAMPION_ID,
    masteryPoints: 42_000,
    recentGames: 1,
    recentWins: 1,
  },
];

const SENTINEL_PUUID = "SENTINEL_PUUID_DO_NOT_LOG";
const SENTINEL_NAME = "SENTINEL_NAME_DO_NOT_LOG";
const MID_GAME_ITEMS = [1056, 2003, 3020, 6655];
const BUILD_INPUT = {
  queueId: 420,
  role: "MIDDLE" as const,
  championId: RANKED_LOCAL_CHAMPION_ID,
  allies: [],
  enemies: [],
};
const nextItemsInput = (enemyItems: number[], ownedItems: number[]) => ({
  queueId: 420,
  role: "MIDDLE" as const,
  championId: RANKED_LOCAL_CHAMPION_ID,
  ownedItems,
  enemyChampions: [RANKED_ENEMY_MIDDLE_CHAMPION_ID, 121, 1, 99],
  enemyItems,
});

const contextFor = (db: Database, accessKey: string | null = ACCESS_KEY) =>
  ({
    db,
    accessKey,
    expectedAccessKey: ACCESS_KEY,
    staticData: async () => TEST_STATIC_DATA,
  }) satisfies Context;

const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.catch((error: unknown) => error);

const unavailableIds = (draft: DraftState): Set<number> =>
  new Set([
    ...draft.bans.myTeamBans,
    ...draft.bans.theirTeamBans,
    ...draft.theirTeam.map(({ championId }) => championId),
    ...draft.myTeam
      .filter(({ cellId }) => cellId !== draft.localPlayerCellId)
      .flatMap(({ championId, championPickIntent }) => [
        championId,
        championPickIntent,
      ]),
  ]);

describe.skipIf(!BASE_DATABASE_URL)("coach router on the QA seed", () => {
  let scratch: ScratchDatabase;
  let hover: DraftState;
  let locked: DraftState;

  beforeAll(async () => {
    scratch = await createScratchDatabase(BASE_DATABASE_URL ?? "");
    await seedQaStats(scratch.db, NOW);
    const drafts = await rankedDrafts();
    expect(drafts).toHaveLength(2);
    [hover, locked] = drafts as [DraftState, DraftState];
  });

  afterAll(async () => {
    await scratch.drop();
  });

  const suggestPicks = (draft: DraftState, accessKey?: string | null) =>
    call(
      appRouter.coach.suggestPicks,
      { queueId: 420, role: "MIDDLE", draft, pool: POOL },
      { context: contextFor(scratch.db, accessKey) }
    );

  test("the ranked fixture leaves at least 12 seeded MIDDLE candidates pickable", () => {
    const unavailable = unavailableIds(locked);
    const eligible = RANKED_PICKABLE_MIDDLE_IDS.filter(
      (id) => locked.pickableChampionIds.includes(id) && !unavailable.has(id)
    );
    expect(eligible.length).toBeGreaterThanOrEqual(12);
    expect(locked.localPick).toEqual({
      championId: RANKED_LOCAL_CHAMPION_ID,
      completed: true,
    });
    expect(hover.localPick.completed).toBe(false);
  });

  test.each([
    ["hover, all enemies revealed", () => hover],
    ["lock, all enemies revealed", () => locked],
    [
      "lock, only the enemy lane pick revealed",
      () => revealOnly(locked, [RANKED_ENEMY_MIDDLE_CHAMPION_ID]),
    ],
  ])(
    "suggestPicks ranks counter A above weak candidates (%s)",
    async (_label, draftOf) => {
      const result = await suggestPicks(draftOf());
      expect(result.patch).toBe(QA_CURRENT_PATCH);
      expect(result.suggestions).toHaveLength(10);
      for (const { components, score } of result.suggestions) {
        for (const value of [
          components.strength,
          components.matchup,
          components.synergy,
          components.pool,
          score,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
      const ids = result.suggestions.map(({ championId }) => championId);
      const counterIndex = ids.indexOf(QA_COUNTER_CHAMPION_ID);
      expect(counterIndex).toBeGreaterThanOrEqual(0);
      const weaker = result.suggestions.filter(
        ({ winRate }) => winRate <= LOW_BASE_WIN_RATE
      );
      expect(weaker.length).toBeGreaterThan(0);
      for (const { championId } of weaker) {
        if (championId !== QA_COUNTER_CHAMPION_ID) {
          expect(ids.indexOf(championId)).toBeGreaterThan(counterIndex);
        }
      }
      expect(result.suggestions[counterIndex]?.reasons).toContain(
        `counters:${RANKED_ENEMY_MIDDLE_CHAMPION_ID}`
      );
      expect(result.sources).toEqual({
        currentGames: result.suggestions.reduce(
          (sum, { sampleGames }) => sum + sampleGames,
          0
        ),
        previousGames: 0,
      });
    }
  );

  test("suggestPicks never returns a banned, picked or hovered-by-ally champion", async () => {
    const draft: DraftState = {
      ...locked,
      bans: {
        ...locked.bans,
        theirTeamBans: [...locked.bans.theirTeamBans, QA_COUNTER_CHAMPION_ID],
      },
    };
    const result = await suggestPicks(draft);
    const unavailable = unavailableIds(draft);
    expect(result.suggestions).toHaveLength(10);
    for (const { championId } of result.suggestions) {
      expect(unavailable.has(championId)).toBe(false);
    }
    expect(
      result.suggestions.some(
        ({ championId }) => championId === QA_COUNTER_CHAMPION_ID
      )
    ).toBe(false);
  });

  test("suggestPicks without a role fails with ROLE_REQUIRED (400)", async () => {
    const error = await rejection(
      call(
        appRouter.coach.suggestPicks,
        { queueId: 420, role: null, draft: locked, pool: POOL },
        { context: contextFor(scratch.db) }
      )
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({ code: "ROLE_REQUIRED", status: 400 });
  });

  test("suggestBans returns 5 available threats, including the pool's counter", async () => {
    const result = await call(
      appRouter.coach.suggestBans,
      { queueId: 420, role: "MIDDLE", draft: locked, pool: POOL },
      { context: contextFor(scratch.db) }
    );
    expect(result.suggestions).toHaveLength(5);
    const unavailable = unavailableIds(locked);
    for (const { championId } of result.suggestions) {
      expect(unavailable.has(championId)).toBe(false);
    }
    expect(
      result.suggestions.find(({ championId }) => championId === 4)?.reasons
    ).toContain(`counters:${RANKED_LOCAL_CHAMPION_ID}`);
  });

  test("ARAM draft procedures return empty suggestions", async () => {
    const aram: DraftState = { ...locked, queueId: 450 };
    const input = { queueId: 450, role: null, draft: aram, pool: POOL };
    const context = { context: contextFor(scratch.db) };
    const picks = await call(appRouter.coach.suggestPicks, input, context);
    const bans = await call(appRouter.coach.suggestBans, input, context);
    for (const result of [picks, bans]) {
      expect(result).toEqual({
        patch: QA_CURRENT_PATCH,
        sources: { currentGames: 0, previousGames: 0 },
        suggestions: [],
      });
    }
  });

  test("an unsupported queue fails with UNSUPPORTED_QUEUE", async () => {
    const error = await rejection(
      call(
        appRouter.coach.build,
        {
          queueId: 1700,
          role: null,
          championId: RANKED_LOCAL_CHAMPION_ID,
          allies: [],
          enemies: [],
        },
        { context: contextFor(scratch.db) }
      )
    );
    expect(error).toMatchObject({ code: "UNSUPPORTED_QUEUE", status: 400 });
  });

  test("build returns runes, spells, skill order and core for the locked champion", async () => {
    const result = await call(
      appRouter.coach.build,
      {
        queueId: 420,
        role: "MIDDLE",
        championId: RANKED_LOCAL_CHAMPION_ID,
        allies: [86, 64, 222, 412],
        enemies: [122, 121, RANKED_ENEMY_MIDDLE_CHAMPION_ID, 51, 89],
      },
      { context: contextFor(scratch.db) }
    );
    expect(result).not.toBeNull();
    expect(result?.patch).toBe(QA_CURRENT_PATCH);
    expect(result?.role).toBe("MIDDLE");
    expect(result?.runes).toEqual({
      primaryStyleId: 8100,
      subStyleId: 8200,
      selectedPerkIds: [8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011],
    });
    expect(result?.spells).toEqual([...QA_LOCAL_BUILD.spells]);
    expect(result?.skillOrder).toHaveLength(18);
    expect(result?.skillOrder.slice(0, 3)).toEqual(["Q", "E", "W"]);
    expect(result?.core).toEqual([...QA_LOCAL_BUILD.core]);
    expect(result?.starter).toEqual([...QA_LOCAL_BUILD.starter]);
    expect(result?.sources).toEqual({ currentGames: 900, previousGames: 0 });
  });

  test("ARAM build uses the ARAM aggregates without a role", async () => {
    const result = await call(
      appRouter.coach.build,
      {
        queueId: 450,
        role: null,
        championId: ARAM_LOCAL_CHAMPION_ID,
        allies: [],
        enemies: [],
      },
      { context: contextFor(scratch.db) }
    );
    expect(result?.role).toBeNull();
    expect(result?.spells).toEqual([4, 32]);
    expect(result?.core).toEqual([6672, 3031, 3046]);
  });

  const nextItems = (enemyItems: number[], ownedItems = MID_GAME_ITEMS) =>
    call(appRouter.coach.nextItems, nextItemsInput(enemyItems, ownedItems), {
      context: contextFor(scratch.db),
    });

  test("nextItems starts with the recommended starters on an empty inventory", async () => {
    const result = await nextItems([], []);
    expect(result.items).toEqual(
      QA_LOCAL_BUILD.starter.map((itemId) => ({ itemId, reasons: [] }))
    );
  });

  test("nextItems mid-game skips consumed starters and owned items", async () => {
    const result = await nextItems([], [3020, 6655]);
    expect(result.items).toEqual([
      { itemId: 4645, reasons: [] },
      { itemId: 3089, reasons: [] },
    ]);
  });

  test("nextItems follows the base order minus owned items below 3 armor/MR items", async () => {
    const result = await nextItems([3075, 3143, 3089]);
    expect(result.items).toEqual([
      { itemId: 4645, reasons: [] },
      { itemId: 3089, reasons: [] },
    ]);
  });

  test("nextItems puts a penetration item first when enemies own 3 armor/MR items", async () => {
    const result = await nextItems([3075, 3143, 3110]);
    expect(result.patch).toBe(QA_CURRENT_PATCH);
    expect(result.items).toEqual([
      {
        itemId: QA_LOCAL_BUILD.penetrationItem,
        reasons: ["penetration_vs_tanks"],
      },
      { itemId: 4645, reasons: [] },
    ]);
  });

  test("previous-patch rows of a mature champion-role change nothing", async () => {
    const buildBefore = await call(appRouter.coach.build, BUILD_INPUT, {
      context: contextFor(scratch.db),
    });
    const picksBefore = await suggestPicks(locked);
    const previous = {
      patch: QA_PREVIOUS_PATCH,
      statsGroup: "sr",
      role: "MIDDLE",
    };
    await scratch.db.insert(buildStats).values({
      ...previous,
      championId: RANKED_LOCAL_CHAMPION_ID,
      kind: "spells",
      key: "4-7",
      games: 600,
      wins: 350,
    });
    await scratch.db.insert(matchupStats).values({
      ...previous,
      championId: 101,
      opponentChampionId: RANKED_ENEMY_MIDDLE_CHAMPION_ID,
      opponentRole: "MIDDLE",
      games: 400,
      wins: 320,
    });
    try {
      const buildAfter = await call(appRouter.coach.build, BUILD_INPUT, {
        context: contextFor(scratch.db),
      });
      expect(buildBefore?.spells).toEqual([4, 14]);
      expect(buildAfter).toEqual(buildBefore);
      expect(buildAfter?.sources).toEqual({
        currentGames: 900,
        previousGames: 0,
      });
      expect(await suggestPicks(locked)).toEqual(picksBefore);
    } finally {
      await scratch.db
        .delete(buildStats)
        .where(eq(buildStats.patch, QA_PREVIOUS_PATCH));
      await scratch.db
        .delete(matchupStats)
        .where(eq(matchupStats.patch, QA_PREVIOUS_PATCH));
    }
  });

  test("a handler exception is logged without request values or the error message", async () => {
    const lines: string[] = [];
    const handler = new RPCHandler(appRouter, {
      clientInterceptors: [logProcedureErrors((line) => lines.push(line))],
    });
    const { response } = await handler.handle(
      new Request("http://localhost/rpc/coach/suggestPicks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            queueId: 420,
            role: "MIDDLE",
            puuid: SENTINEL_PUUID,
            summonerName: SENTINEL_NAME,
            draft: locked,
            pool: POOL,
          },
        }),
      }),
      {
        prefix: "/rpc",
        context: {
          ...contextFor(scratch.db),
          staticData: () =>
            Promise.reject(
              new Error(`lookup failed for ${SENTINEL_NAME} ${SENTINEL_PUUID}`)
            ),
        },
      }
    );
    expect(response?.status).toBe(500);
    expect(lines).toEqual(["rpc coach.suggestPicks failed: Error"]);
    expect(lines.join("\n")).not.toContain(SENTINEL_PUUID);
    expect(lines.join("\n")).not.toContain(SENTINEL_NAME);
  });

  test("meta reports patch, match counts and the collector heartbeat", async () => {
    const meta = await call(appRouter.coach.meta, undefined, {
      context: contextFor(scratch.db),
    });
    expect(meta).toEqual({
      patch: QA_CURRENT_PATCH,
      ddragonVersion: "15.23.1",
      statsGroups: { sr: 2010, aram: 150 },
      collector: {
        lastCrawlAt: NOW,
        lastAggregateAt: NOW,
        lastError: null,
        lastErrorAt: null,
      },
    });
  });

  test("meta reflects a later collector error, capped in length", async () => {
    const erroredAt = new Date(NOW.getTime() + 60_000);
    const lastError = `Riot API 403 <script>alert(1)</script> ${"x".repeat(600)}`;
    await scratch.db
      .update(collectorState)
      .set({ lastError, lastErrorAt: erroredAt });
    const meta = await call(appRouter.coach.meta, undefined, {
      context: contextFor(scratch.db),
    });
    expect(meta.collector.lastErrorAt).toEqual(erroredAt);
    expect(meta.collector.lastError).toBe(lastError.slice(0, 500));
    await scratch.db
      .update(collectorState)
      .set({ lastError: null, lastErrorAt: null });
  });

  test.each([
    ["missing", null],
    ["wrong", "w".repeat(40)],
  ])(
    "a %s access key is UNAUTHORIZED for every coach procedure",
    async (_label, key) => {
      const context = { context: contextFor(scratch.db, key) };
      const draftInput = {
        queueId: 420,
        role: "MIDDLE" as const,
        draft: locked,
        pool: POOL,
      };
      const errors = await Promise.all([
        rejection(call(appRouter.coach.meta, undefined, context)),
        rejection(call(appRouter.coach.suggestBans, draftInput, context)),
        rejection(call(appRouter.coach.suggestPicks, draftInput, context)),
        rejection(call(appRouter.coach.build, BUILD_INPUT, context)),
        rejection(
          call(appRouter.coach.nextItems, nextItemsInput([], []), context)
        ),
      ]);
      expect(errors).toHaveLength(5);
      for (const error of errors) {
        expect(error).toBeInstanceOf(ORPCError);
        expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
      }
    }
  );

  test.each<[string, Record<string, unknown>]>([
    ["a string queue id", { queueId: "420" }],
    ["an unknown action", { currentAction: "trade" }],
    ["a negative champion id", { theirTeam: [{ cellId: 5, championId: -3 }] }],
  ])(
    "a DraftState with %s is rejected before the handler",
    async (_label, patch) => {
      const error = await rejection(
        call(
          appRouter.coach.suggestPicks,
          {
            queueId: 420,
            role: "MIDDLE",
            draft: { ...locked, ...patch },
            pool: POOL,
          },
          { context: contextFor(scratch.db) }
        )
      );
      expect(error).toMatchObject({ code: "BAD_REQUEST" });
    }
  );

  test("identity fields sent by a client are stripped, never reaching the handler", async () => {
    const sentinel = "SENTINEL_NAME_DO_NOT_SHOW";
    const [local, ...allies] = locked.myTeam;
    const raw = {
      queueId: 420,
      role: "MIDDLE",
      puuid: "synthetic-local-puuid",
      draft: {
        ...locked,
        summonerName: sentinel,
        myTeam: [
          { ...local, puuid: "synthetic-local-puuid", gameName: sentinel },
          ...allies,
        ],
        theirTeam: locked.theirTeam.map((enemy) => ({
          ...enemy,
          displayName: sentinel,
        })),
      },
      pool: POOL.map((entry) => ({ ...entry, summonerName: sentinel })),
    };
    const parsed = JSON.stringify(draftInputSchema.parse(raw));
    expect(parsed).not.toContain("puuid");
    expect(parsed).not.toContain(sentinel);
    const result = await call(
      appRouter.coach.suggestPicks,
      // @ts-expect-error extra identity keys are not part of the input type
      raw,
      { context: contextFor(scratch.db) }
    );
    expect(result.suggestions).toHaveLength(10);
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });
});

describe.skipIf(!BASE_DATABASE_URL)("fresh-install patch blend", () => {
  const CHAMPION_ID = 99;
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createScratchDatabase(BASE_DATABASE_URL ?? "");
    const { db } = scratch;
    await resetStats(db);
    await seedPatches(db, NOW);
    const slice = (patch: string, games: number, winRate: number) => ({
      patch,
      statsGroup: "sr",
      championId: CHAMPION_ID,
      role: "MIDDLE",
      games,
      wins: Math.round(games * winRate),
    });
    await db
      .insert(championRoleStats)
      .values([
        slice(QA_PREVIOUS_PATCH, 600, 0.52),
        slice(QA_CURRENT_PATCH, 40, 0.55),
      ]);
    const build = QA_LOCAL_BUILD;
    await db.insert(buildStats).values(
      [QA_PREVIOUS_PATCH, QA_CURRENT_PATCH].flatMap((patch) => {
        const games = patch === QA_CURRENT_PATCH ? 40 : 600;
        return [
          { kind: "rune_page" as const, key: build.runePage },
          { kind: "spells" as const, key: build.spells.join("-") },
          { kind: "skill_order" as const, key: build.skillOrder },
          { kind: "core" as const, key: build.core.join("-") },
          { kind: "boots" as const, key: String(build.boots) },
        ].map((row) => ({ ...slice(patch, games, 0.52), ...row }));
      })
    );
  });

  afterAll(async () => {
    await scratch.drop();
  });

  test("suggestPicks and build report current and previous patch games", async () => {
    const [, locked] = await rankedDrafts();
    const context = { context: contextFor(scratch.db) };
    const picks = await call(
      appRouter.coach.suggestPicks,
      { queueId: 420, role: "MIDDLE", draft: locked as DraftState, pool: [] },
      context
    );
    expect(picks.patch).toBe(QA_CURRENT_PATCH);
    expect(picks.suggestions.map(({ championId }) => championId)).toEqual([
      CHAMPION_ID,
    ]);
    expect(picks.sources).toEqual({ currentGames: 40, previousGames: 600 });

    const build = await call(
      appRouter.coach.build,
      {
        queueId: 420,
        role: "MIDDLE",
        championId: CHAMPION_ID,
        allies: [],
        enemies: [],
      },
      context
    );
    expect(build?.patch).toBe(QA_CURRENT_PATCH);
    expect(build?.sources).toEqual({ currentGames: 40, previousGames: 600 });
    expect(build?.sources.previousGames).toBeGreaterThan(0);
    expect(build?.sampleGames).toBe(Math.round(40 + 600 * (460 / 500)));
  });
});
