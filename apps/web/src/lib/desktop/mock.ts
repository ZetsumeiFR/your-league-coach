/**
 * Stand-in for the Tauri backend, loaded only by the dev server when VITE_YLC_MOCK_IPC is "1"
 * (browser QA: the macOS webview cannot be driven by a test runner). It replays
 * the fixtures of scripts/fake-riot-client through test/support/backend-mirror,
 * so the app receives what the real connectors would emit for the same client
 * payloads.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { draftStateSchema } from "@your-league-coach/lol-data/types";
import { z } from "zod";

import {
  championMastery,
  matchHistory,
  regionLocale,
  summoner,
} from "../../../../../scripts/fake-riot-client/fixtures/lcu/accounts";
import rankedJsonl from "../../../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl?raw";
import {
  runeInventory,
  runePages,
} from "../../../../../scripts/fake-riot-client/fixtures/lcu/loadouts";
import {
  draftPath,
  flowPath,
  liveArmorScenario,
  liveScenario,
  phasePath,
  rankedPickableChampionIds,
  scenarioFrames,
} from "../../../../../scripts/fake-riot-client/fixtures/lcu/scenarios";
import { liveGameData } from "../../../../../scripts/fake-riot-client/fixtures/live/scenarios";
import {
  aggregateRecentGames,
  flowQueueSchema,
  normalizeDraft,
  normalizeLiveGame,
  phaseSchema,
  wampFrameSchema,
} from "../../../test/support/backend-mirror";
import {
  type DesktopCommandName,
  type DesktopCommands,
  type DesktopEventName,
  type DesktopEvents,
  GAMEFLOW_PHASES,
  type GameflowPhase,
  type LcuState,
  NO_FREE_PAGE,
} from "./events";

/** The one command of Tauri's window plugin the app invokes. */
const SET_ALWAYS_ON_TOP = "plugin:window|set_always_on_top";
type RecordedCommandName = DesktopCommandName | typeof SET_ALWAYS_ON_TOP;

export interface YlcMock {
  /**
   * Desktop and window commands the app invoked, in order. Store traffic is
   * left out: it carries the access key.
   */
  calls: { args: unknown; command: string }[];
  /** Emits one backend event; the payload is checked against its contract. */
  emit: <Name extends DesktopEventName>(
    name: Name,
    payload: DesktopEvents[Name]
  ) => Promise<void>;
  /**
   * Commands named here fail with the given text, as the backend does when the
   * client refuses a request.
   */
  failures: Partial<Record<RecordedCommandName, string>>;
  /**
   * Replays a fake Riot client scenario ("champ-select-ranked",
   * "champ-select-aram", "champ-select-arena", "live-game",
   * "live-game-armored", "live-game-ended"), connecting the client first.
   * The stages of a draft are sent `DRAFT_STAGE_MS` apart; the promise settles
   * once the last one is sent.
   */
  replay: (scenario: string) => Promise<void>;
  /**
   * Rune page slots of the fake client. The fixture holds two player pages in
   * three slots; with 2, a rune import finds no free page.
   */
  runePageSlots: number;
}

declare global {
  interface Window {
    __ylcMock?: YlcMock;
  }
}

const STORAGE_PREFIX = "ylc-mock-store:";
const CHAMPION_SLUG = /^[a-z0-9]{1,64}$/i;
/**
 * Time between two stages of a replayed draft: what the screen is given to
 * follow a client event. Sent in one burst, only the last stage would be drawn,
 * because the screen asks for suggestions once the draft has stopped changing.
 */
const DRAFT_STAGE_MS = 2000;

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const teamPlayerSchema = z.object({
  championId: z.number(),
  items: z.array(z.number()),
});

const eventSchemas = {
  "lcu://status": z.object({
    state: z.enum(["searching", "connected", "disconnected"]),
  }),
  "lcu://gameflow": z.object({ phase: z.enum(GAMEFLOW_PHASES) }),
  "lcu://champ-select": draftStateSchema,
  "live://status": z.object({
    state: z.enum(["waiting_for_game", "waiting_for_catalog", "active"]),
  }),
  "live://game": z.object({
    gameMode: z.enum([
      "CLASSIC",
      "ARAM",
      "CHERRY",
      "SWIFTPLAY",
      "URF",
      "UNKNOWN",
    ]),
    gameTime: z.number(),
    activePlayer: z.object({
      championName: z.string(),
      level: z.number(),
      currentGold: z.number(),
    }),
    myItems: z.array(z.number()),
    allies: z.array(teamPlayerSchema),
    enemies: z.array(teamPlayerSchema),
  }),
} satisfies { [Name in DesktopEventName]: z.ZodType<DesktopEvents[Name]> };

/** Same rules as `ChampionCatalog::new` in src-tauri/src/live/payload.rs. */
const catalogSchema = z
  .object({
    championIds: z.record(
      z.string().regex(CHAMPION_SLUG),
      z.number().int().positive()
    ),
  })
  .refine(({ championIds }) => {
    const slugs = Object.keys(championIds).map((slug) => slug.toLowerCase());
    return new Set(slugs).size === slugs.length;
  });

const runePageSchema = z.object({
  name: z.string(),
  primaryStyleId: z.number(),
  subStyleId: z.number(),
  selectedPerkIds: z.array(z.number()),
}) satisfies z.ZodType<DesktopCommands["lcu_import_runes"]["args"]>;

const spellsSchema = z.object({
  spell1Id: z.number(),
  spell2Id: z.number(),
}) satisfies z.ZodType<DesktopCommands["lcu_set_spells"]["args"]>;

const itemSetSchema = z.object({
  championId: z.number(),
  title: z.string(),
  blocks: z.array(
    z.object({
      type: z.string(),
      items: z.array(z.object({ id: z.number(), count: z.number() })),
    })
  ),
}) satisfies z.ZodType<DesktopCommands["lcu_import_item_set"]["args"]>;

const alwaysOnTopSchema = z.object({
  label: z.literal("main"),
  value: z.boolean(),
});

const storeLoadSchema = z.object({ path: z.string() });
const storeKeySchema = z.object({ key: z.string(), rid: z.number() });
const storeSetSchema = storeKeySchema.extend({ value: z.unknown() });
const storeRidSchema = z.object({ rid: z.number() });
const storedSchema = z.record(z.string(), z.unknown());

/** The store plugin, kept in localStorage so a page reload finds what was saved. */
const createStoreCommands = () => {
  const stores: { data: Record<string, unknown>; path: string }[] = [];
  const open = (rid: number) => {
    const store = stores[rid - 1];
    if (!store) {
      throw new Error(`Mock store: unknown resource ${rid}`);
    }
    return store;
  };
  return {
    "plugin:store|load": (args: unknown) => {
      const { path } = storeLoadSchema.parse(args);
      const existing = stores.findIndex((store) => store.path === path);
      if (existing >= 0) {
        return existing + 1;
      }
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${path}`);
      const data = saved ? storedSchema.parse(JSON.parse(saved)) : {};
      stores.push({ data, path });
      return stores.length;
    },
    "plugin:store|get": (args: unknown) => {
      const { key, rid } = storeKeySchema.parse(args);
      const { data } = open(rid);
      return [data[key] ?? null, key in data];
    },
    "plugin:store|set": (args: unknown) => {
      const { key, rid, value } = storeSetSchema.parse(args);
      open(rid).data[key] = value;
      return null;
    },
    "plugin:store|save": (args: unknown) => {
      const { data, path } = open(storeRidSchema.parse(args).rid);
      localStorage.setItem(`${STORAGE_PREFIX}${path}`, JSON.stringify(data));
      return null;
    },
  };
};

export const installDesktopMock = () => {
  const identity = { puuid: summoner.puuid, summonerId: summoner.summonerId };
  const calls: YlcMock["calls"] = [];
  let status: LcuState = "searching";
  let phase: GameflowPhase = "None";
  /** Queue of the latest gameflow session, and the one the current draft uses. */
  let flowQueue: number | null = null;
  let draftQueue: number | null = null;
  let championIds: Record<string, number> = {};
  let liveGame: unknown = null;

  const send: YlcMock["emit"] = async (
    name: DesktopEventName,
    payload: unknown
  ) => {
    switch (name) {
      case "lcu://status": {
        const event = eventSchemas[name].parse(payload);
        ({ state: status } = event);
        await emit(name, event);
        break;
      }
      case "lcu://gameflow": {
        const event = eventSchemas[name].parse(payload);
        ({ phase } = event);
        await emit(name, event);
        break;
      }
      default:
        await emit(name, eventSchemas[name].parse(payload));
    }
  };

  const sendLiveGame = async () => {
    if (liveGame === null) {
      return;
    }
    if (Object.keys(championIds).length === 0) {
      await send("live://status", { state: "waiting_for_catalog" });
      return;
    }
    const game = normalizeLiveGame(liveGame, championIds);
    await send("live://status", {
      state: game ? "active" : "waiting_for_game",
    });
    if (game) {
      await send("live://game", game);
    }
  };

  const applyPhase = async (next: GameflowPhase) => {
    if (next === phase) {
      return;
    }
    const wasInGame = phase === "InProgress";
    draftQueue = next === "ChampSelect" ? flowQueue : null;
    await send("lcu://gameflow", { phase: next });
    if (wasInGame) {
      liveGame = null;
      await send("live://status", { state: "waiting_for_game" });
    }
  };

  const applyEvent = async (uri: string, data: unknown) => {
    if (uri === phasePath) {
      await applyPhase(phaseSchema.parse(data));
    } else if (uri === flowPath) {
      flowQueue = flowQueueSchema.parse(data);
      draftQueue = flowQueue;
    } else if (
      uri === draftPath &&
      phase === "ChampSelect" &&
      draftQueue !== null
    ) {
      await send(
        "lcu://champ-select",
        normalizeDraft(data, draftQueue, [...rankedPickableChampionIds])
      );
    }
  };

  const applyFrames = async (
    [frame, ...later]: string[],
    followsDraft = false
  ): Promise<void> => {
    if (frame === undefined) {
      return;
    }
    const [, , { data, uri }] = wampFrameSchema.parse(JSON.parse(frame));
    const isDraft = uri === draftPath;
    if (isDraft && followsDraft) {
      await pause(DRAFT_STAGE_MS);
    }
    await applyEvent(uri, data);
    await applyFrames(later, followsDraft || isDraft);
  };

  const replay: YlcMock["replay"] = async (scenario) => {
    const frames = scenarioFrames(scenario, rankedJsonl);
    if (frames === null) {
      throw new Error(`Mock IPC: unknown scenario "${scenario}"`);
    }
    if (status !== "connected") {
      await send("lcu://status", { state: "connected" });
    }
    if (scenario === liveScenario || scenario === liveArmorScenario) {
      liveGame = liveGameData(scenario === liveArmorScenario);
    }
    await applyFrames(frames);
    await sendLiveGame();
  };

  const requireClient = () => {
    if (status !== "connected") {
      throw new Error("LCU disconnected");
    }
  };

  const mock: YlcMock = {
    calls,
    emit: send,
    failures: {},
    replay,
    runePageSlots: runeInventory.ownedPageCount,
  };

  const desktopCommands: {
    [Name in DesktopCommandName]: (
      args: unknown
    ) =>
      | DesktopCommands[Name]["result"]
      | Promise<DesktopCommands[Name]["result"]>;
  } = {
    lcu_status: () => ({ state: status }),
    lcu_current_summoner: () => {
      requireClient();
      const locale = regionLocale.locale === "fr_FR" ? "fr_FR" : "en_US";
      return { ...identity, locale };
    },
    lcu_champion_mastery: () => {
      requireClient();
      return championMastery.map(({ championId, championPoints }) => ({
        championId,
        masteryPoints: championPoints,
      }));
    },
    lcu_recent_games: () => {
      requireClient();
      return aggregateRecentGames(matchHistory, identity);
    },
    lcu_set_lockfile_path: () => null,
    lcu_import_runes: (args) => {
      requireClient();
      runePageSchema.parse(args);
      // The app replaces its own page, so only the player's pages fill the slots.
      if (runePages.length >= mock.runePageSlots) {
        throw new Error(NO_FREE_PAGE);
      }
      return null;
    },
    lcu_set_spells: (args) => {
      requireClient();
      spellsSchema.parse(args);
      if (phase !== "ChampSelect") {
        throw new Error("LCU HTTP status 404 Not Found");
      }
      return null;
    },
    lcu_import_item_set: (args) => {
      requireClient();
      itemSetSchema.parse(args);
      return null;
    },
    live_set_champion_ids: async (args) => {
      ({ championIds } = catalogSchema.parse(args));
      if (phase === "InProgress") {
        await sendLiveGame();
      }
      return null;
    },
  };
  const recordedCommands: Record<
    RecordedCommandName,
    (args: unknown) => unknown
  > = {
    ...desktopCommands,
    [SET_ALWAYS_ON_TOP]: (args) => {
      alwaysOnTopSchema.parse(args);
      return null;
    },
  };
  const storeCommands = createStoreCommands();

  const isRecordedCommand = (command: string): command is RecordedCommandName =>
    Object.hasOwn(recordedCommands, command);
  const isStoreCommand = (
    command: string
  ): command is keyof typeof storeCommands =>
    Object.hasOwn(storeCommands, command);

  mockWindows("main");
  mockIPC(
    (command, args) => {
      if (isStoreCommand(command)) {
        return storeCommands[command](args);
      }
      if (isRecordedCommand(command)) {
        calls.push({ args, command });
        const failure = mock.failures[command];
        if (failure !== undefined) {
          throw new Error(failure);
        }
        return recordedCommands[command](args);
      }
      throw new Error(`Mock IPC: unknown command "${command}"`);
    },
    { shouldMockEvents: true }
  );
  window.__ylcMock = mock;
};
