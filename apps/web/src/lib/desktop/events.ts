import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DraftState } from "@your-league-coach/lol-data/types";

export type LcuState = "searching" | "connected" | "disconnected";

export const GAMEFLOW_PHASES = [
  "None",
  "Lobby",
  "Matchmaking",
  "CheckedIntoTournament",
  "ReadyCheck",
  "ChampSelect",
  "GameStart",
  "FailedToLaunch",
  "InProgress",
  "Reconnect",
  "WaitingForStats",
  "PreEndOfGame",
  "EndOfGame",
  "TerminatedInError",
  "Unknown",
] as const;
export type GameflowPhase = (typeof GAMEFLOW_PHASES)[number];

export type LiveState = "waiting_for_game" | "waiting_for_catalog" | "active";

export interface LiveTeamPlayer {
  championId: number;
  items: number[];
}

export interface LiveGame {
  /** `championName` is the Data Dragon id (asset slug), not a display name. */
  activePlayer: { championName: string; currentGold: number; level: number };
  allies: LiveTeamPlayer[];
  enemies: LiveTeamPlayer[];
  gameMode: "CLASSIC" | "ARAM" | "CHERRY" | "SWIFTPLAY" | "URF" | "UNKNOWN";
  gameTime: number;
  myItems: number[];
}

/** Payload of each event the Tauri backend emits (src-tauri/src/lcu, src-tauri/src/live). */
export interface DesktopEvents {
  "lcu://champ-select": DraftState;
  "lcu://gameflow": { phase: GameflowPhase };
  "lcu://status": { state: LcuState };
  "live://game": LiveGame;
  "live://status": { state: LiveState };
}
export type DesktopEventName = keyof DesktopEvents;

export const DESKTOP_EVENT_NAMES = [
  "lcu://status",
  "lcu://gameflow",
  "lcu://champ-select",
  "live://status",
  "live://game",
] as const satisfies readonly DesktopEventName[];

export const onDesktopEvent = <Name extends DesktopEventName>(
  name: Name,
  handler: (payload: DesktopEvents[Name]) => void
): Promise<UnlistenFn> =>
  listen<DesktopEvents[Name]>(name, (event) => handler(event.payload));

export type LcuLocale = "fr_FR" | "en_US";

export interface CurrentSummoner {
  locale: LcuLocale;
  puuid: string;
  summonerId: number;
}

export interface ChampionMastery {
  championId: number;
  masteryPoints: number;
}

export interface RecentGames {
  championId: number;
  games: number;
  wins: number;
}

/** What `lcu_import_runes` fails with when every rune page slot holds a page the app did not create. */
export const NO_FREE_PAGE = "NO_FREE_PAGE";

export interface DesktopCommands {
  lcu_champion_mastery: { args: undefined; result: ChampionMastery[] };
  lcu_current_summoner: { args: undefined; result: CurrentSummoner };
  lcu_import_item_set: {
    args: {
      /** Groups of the in-game shop; `type` is the title a group shows. */
      blocks: { items: { count: number; id: number }[]; type: string }[];
      championId: number;
      title: string;
    };
    result: null;
  };
  lcu_import_runes: {
    args: {
      /** Shown in the client's rune page list. */
      name: string;
      primaryStyleId: number;
      selectedPerkIds: number[];
      subStyleId: number;
    };
    result: null;
  };
  lcu_recent_games: { args: undefined; result: RecentGames[] };
  lcu_set_lockfile_path: {
    args: { lockfilePath: string | null };
    result: null;
  };
  lcu_set_spells: {
    args: { spell1Id: number; spell2Id: number };
    result: null;
  };
  lcu_status: { args: undefined; result: { state: LcuState } };
  live_set_champion_ids: {
    args: { championIds: Record<string, number> };
    result: null;
  };
}
export type DesktopCommandName = keyof DesktopCommands;
export type RunePageImport = DesktopCommands["lcu_import_runes"]["args"];
export type ItemSetImport = DesktopCommands["lcu_import_item_set"]["args"];
export type ItemSetBlock = ItemSetImport["blocks"][number];

const call = <Name extends DesktopCommandName>(
  name: Name,
  args?: DesktopCommands[Name]["args"]
): Promise<DesktopCommands[Name]["result"]> => invoke(name, args);

export const desktop = {
  lcuStatus: () => call("lcu_status"),
  currentSummoner: () => call("lcu_current_summoner"),
  championMastery: () => call("lcu_champion_mastery"),
  recentGames: () => call("lcu_recent_games"),
  /**
   * The three writes to the League client. Each one rejects with the
   * backend's text when it fails. They replace only what the app created
   * itself (src-tauri/src/lcu/write.rs).
   */
  importRunes: (page: RunePageImport) => call("lcu_import_runes", page),
  setSpells: (spell1Id: number, spell2Id: number) =>
    call("lcu_set_spells", { spell1Id, spell2Id }),
  importItemSet: (set: ItemSetImport) => call("lcu_import_item_set", set),
  /** Applies a lockfile path now; null goes back to automatic discovery. */
  setLockfilePath: (lockfilePath: string | null) =>
    call("lcu_set_lockfile_path", { lockfilePath }),
  /** Data Dragon champion id (e.g. "Ahri") to numeric key, for the live connector. */
  setChampionIds: (championIds: Record<string, number>) =>
    call("live_set_champion_ids", { championIds }),
};
