import type {
  ParamReasonKind,
  PlainReasonCode,
} from "@your-league-coach/lol-data/types";

import type { GameflowPhase } from "../lib/desktop/events";

/** English texts. This object is also the shape every other language must match. */
export const en = {
  app: { name: "Your League Coach" },
  nav: {
    group: "Coach",
    home: "Home",
    draft: "Draft",
    build: "Build",
    inGame: "In game",
    settings: "Settings",
    collapse: "Collapse menu",
    expand: "Expand menu",
    open: "Open menu",
  },
  theme: {
    toggle: "Change theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },
  client: {
    state: {
      connected: "Connected",
      searching: "Searching",
      disconnected: "Offline",
    },
    badge: {
      connected: "Client connected",
      searching: "Looking for client",
      disconnected: "Client offline",
    },
  },
  phase: {
    None: "Idle",
    Lobby: "Lobby",
    Matchmaking: "In queue",
    CheckedIntoTournament: "Tournament",
    ReadyCheck: "Match found",
    ChampSelect: "Champion select",
    GameStart: "Game starting",
    FailedToLaunch: "Launch failed",
    InProgress: "In game",
    Reconnect: "Reconnecting",
    WaitingForStats: "Game over",
    PreEndOfGame: "Game over",
    EndOfGame: "Game over",
    TerminatedInError: "Game interrupted",
    Unknown: "Unknown state",
  } satisfies Record<GameflowPhase, string>,
  patch: { badge: "Patch {patch}" },
  home: {
    client: {
      title: "League client",
      detail: {
        connected: "The draft opens by itself when champion select starts.",
        auto: "Lockfile: automatic detection",
        custom: "Lockfile: custom path",
      },
    },
    server: {
      title: "Coach server",
      value: {
        online: "Online",
        unreachable: "Unreachable",
        unauthorized: "Key refused",
        unconfigured: "Not set up",
        failed: "Error",
      },
      badge: {
        online: "Key accepted",
        unreachable: "No answer",
        unauthorized: "Unauthorized",
        unconfigured: "Setup needed",
        failed: "Server error",
      },
      openSettings: "Open settings",
      fixKey: "Fix the access key",
      retry: "Retry",
    },
    patch: {
      title: "Patch",
      none: "None yet",
      games: "Games analysed: Rift {sr} / ARAM {aram}",
      waitingCollector: "The collector has not detected a patch yet.",
      needsServer: "Shown once the server answers.",
      fresh: "Up to date",
      stale: "Out of date",
    },
    collector: {
      title: "Statistics may be out of date",
      stale: "Last aggregation: {when}.",
      never: "The collector has not aggregated any game yet.",
      error: "Last collector error ({when}):",
      errorUndated: "Last collector error:",
    },
    empty: {
      title: "League client not found",
      description: "Start League of Legends. The app connects by itself.",
      action: "Set the lockfile path",
    },
  },
  settings: {
    connection: {
      title: "Connection",
      description:
        "Shared server and access key, given by whoever runs the server.",
    },
    serverUrl: {
      title: "Server URL",
      description: "Address of the shared coach server.",
      placeholder: "coach.example.com",
      errors: {
        invalid: "Enter a valid server address.",
        insecure:
          "HTTPS is required. HTTP is accepted only for localhost and 127.0.0.1.",
        credentials: "Do not put a user name or password in the address.",
      },
    },
    accessKey: {
      title: "Access key",
      description: "Shared key, sent with every request.",
      errors: {
        length: "The key is too long.",
        characters: "The key contains characters that cannot be sent.",
      },
    },
    test: {
      title: "Connection test",
      description: "Checks the address and key above without saving them.",
      action: "Test connection",
      success: "Server reachable, key accepted (patch {patch}).",
      successNoPatch: "Server reachable, key accepted.",
      unauthorized: "The server refused this access key (unauthorized).",
      unreachable: "No answer from {host}.",
      failed: "The server answered with an error.",
      missing: "Enter the server URL and the access key first.",
    },
    save: "Save",
    reset: "Reset",
    saved: "Settings saved.",
    saveFailed: "Settings could not be saved.",
    preferences: {
      title: "Preferences",
      description: "They apply as soon as you change them.",
      general: "General",
    },
    language: {
      title: "Language",
      description: "Auto follows the language of your League client.",
      auto: "Auto",
      fr: "Français",
      en: "English",
      descriptionDetected:
        "Detected: {language}. Auto follows the language of your League client.",
    },
    autoImport: {
      title: "Automatic import",
      description:
        "Send runes, spells and items to the client when you lock in.",
    },
    lockfile: {
      title: "Lockfile path",
      description: "Leave empty to find the League client automatically.",
      placeholder: "Automatic",
      saved: "Lockfile path updated.",
    },
    loadFailed: {
      title: "Settings could not be loaded",
      description: "The app cannot read its settings file.",
      retry: "Retry",
    },
  },
  draft: {
    idle: {
      title: "No draft in progress",
      description:
        "Ban and pick suggestions appear here during champion select.",
    },
  },
  build: {
    idle: {
      title: "No champion selected",
      description:
        "The recommended build appears here once you hover or lock a champion.",
    },
  },
  inGame: {
    idle: {
      title: "No game in progress",
      description: "Your next items appear here during a game.",
    },
  },
  reasons: {
    strong_on_patch: "Strong on this patch",
    in_your_pool: "In your pool",
    balances_damage: "Balances team damage",
    anti_heal: "Anti-heal",
    armor_vs_ad: "Armor against physical damage",
    mr_vs_ap: "Magic resist against magic damage",
    tenacity_vs_cc: "Tenacity against crowd control",
    frontline_missing: "Team lacks a frontline",
    penetration_vs_tanks: "Penetration against tanks",
    counters: "Counters {champion}",
    countered_by: "Countered by {champion}",
    synergy: "Synergy with {champion}",
  } satisfies Record<PlainReasonCode | ParamReasonKind, string>,
  legal: {
    title: "Legal notice",
    notice:
      "Your League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
    official: "Official wording (English):",
  },
};

export type Dictionary = typeof en;
