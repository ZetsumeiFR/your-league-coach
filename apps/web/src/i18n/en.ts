import type { Role } from "@your-league-coach/lol-data/roles";
import type {
  ParamReasonKind,
  PlainReasonCode,
} from "@your-league-coach/lol-data/types";

import type { ItemSetBlockName } from "../lib/build/items";
import type { ShardName } from "../lib/build/runes";
import type { GameflowPhase } from "../lib/desktop/events";
import type { ImportPart } from "../lib/desktop/import";

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
  server: {
    error: {
      unreachable: "No answer from the coach server.",
      failed: "The coach server answered with an error.",
      unauthorized: "The coach server refused the access key.",
      retry: "Retry",
      openSettings: "Open settings",
    },
  },
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
    unsupported: {
      title: "Game mode not supported",
      description: "Suggestions cover ranked, normal draft and ARAM games.",
    },
    aram: {
      title: "ARAM - build only",
      description:
        "ARAM has no bans and no pick order, so there is nothing to suggest here.",
    },
    teams: {
      allies: "Your team",
      enemies: "Enemy team",
      you: "You",
      ally: "Ally {number}",
      enemy: "Enemy {number}",
      notPicked: "Not picked",
      notRevealed: "Not revealed",
      hovering: "Hovering",
      likelyRole: "~{role}",
      likelyRoleHint: "Likely role: {role}",
      bans: "Bans",
      noBans: "No ban yet",
      unknownChampion: "Champion {id}",
    },
    roles: {
      TOP: "Top",
      JUNGLE: "Jungle",
      MIDDLE: "Mid",
      BOTTOM: "Bot",
      UTILITY: "Support",
    } satisfies Record<Role, string>,
    rolePicker: "Your role",
    suggestions: {
      picks: "Pick suggestions",
      bans: "Ban suggestions",
      info: {
        label: "How the score is built",
        picks:
          "Patch strength, matchups, synergy and your pool, in win-rate points. The bar is full at +{full}.",
        bans: "Patch strength plus the threat to your best champions, in win-rate points. The bar is full at +{full}.",
      },
      score: "Score",
      points: "{points} pts",
      winRate: "Win rate",
      games: { one: "{count} game", other: "{count} games" },
      components: {
        strength: "Patch strength",
        matchup: "Matchups",
        synergy: "Synergy",
        pool: "Your pool",
      },
      moreReasons: "+{count}",
      blended: "Patch {patch} + {previous}, {games} games",
      blendedUnnamed: "Patch {patch} + previous patch, {games} games",
      needRole: {
        title: "Which role are you playing?",
        description: "Pick suggestions depend on your role. Choose it above.",
      },
      empty: {
        title: "No suggestion for this draft",
        description:
          "Too few games have been analysed for this role on the current patch.",
      },
      error: { title: "Suggestions unavailable" },
      unconfigured: {
        title: "Coach server not set up",
        description:
          "Enter the server address and the access key to get suggestions.",
        action: "Open settings",
      },
    },
  },
  build: {
    idle: {
      title: "No champion selected",
      description:
        "The recommended build appears here once you hover or lock a champion.",
    },
    title: "Recommended build",
    sample: {
      games: {
        one: "Patch {patch} · {count} game",
        other: "Patch {patch} · {count} games",
      },
      blended: "Patch {patch} + previous patch · {games} games",
    },
    unconfigured: {
      title: "Coach server not set up",
      description:
        "Enter the server address and the access key to get the build.",
      action: "Open settings",
    },
    empty: {
      title: "No build for this champion yet",
      description:
        "Too few games have been analysed for this champion on the current patch.",
    },
    error: { title: "Build unavailable" },
    runes: {
      title: "Runes",
      shards: "Shards",
      shard: {
        healthScaling: "Scaling health",
        attackSpeed: "Attack speed",
        abilityHaste: "Ability haste",
        adaptiveForce: "Adaptive force",
        moveSpeed: "Move speed",
        health: "Health",
        tenacity: "Tenacity and slow resist",
      } satisfies Record<ShardName, string>,
    },
    spells: { title: "Summoner spells" },
    skills: {
      title: "Skills",
      opening: "Levels 1 to 3",
      maxOrder: "Max order",
      grid: "Skill to level up at each level",
    },
    items: {
      title: "Items",
      order: "Purchase order",
      slots: {
        starter: "Start",
        boots: "Boots",
        core: "Core",
        situational: "Situational",
      } satisfies Record<ItemSetBlockName, string>,
      coreStep: "Core {rank}",
      stack: "{item} ×{count}",
      adjustments: "Adjusted for this draft",
      noAdjustments: "No adjustment for the champions revealed so far.",
      replaces: "Replaces {item}",
      added: "Added to the build",
    },
    unknown: {
      item: "Item {id}",
      rune: "Rune {id}",
      shard: "Shard {id}",
      spell: "Spell {id}",
    },
    import: {
      action: "Import into the client",
      done: {
        runes: "Runes imported",
        spells: "Summoner spells set",
        items: "Item set imported",
      } satisfies Record<ImportPart, string>,
      failed: {
        runes: "Runes not imported",
        spells: "Summoner spells not set",
        items: "Item set not imported",
      } satisfies Record<ImportPart, string>,
      noFreePage: {
        title: "No free rune page",
        description:
          "Every rune page slot holds one of your own pages. Delete one in the League client, then import again. The app only replaces pages it created.",
      },
    },
  },
  inGame: {
    idle: {
      title: "No game in progress",
      description: "Your next items appear here during a game.",
    },
    reading: {
      title: "Game found",
      description:
        "The game data is still being read. Your next items appear as soon as it is.",
    },
    title: "Game in progress",
    alwaysOnTop: {
      label: "Always on top",
      on: "On",
      off: "Off",
      failed: "Always on top could not be changed",
    },
    unconfigured: {
      title: "Coach server not set up",
      description:
        "Enter the server address and the access key to get your next items.",
      action: "Open settings",
    },
    next: {
      title: "Next items",
      unknownChampion: {
        title: "Champion not recognised",
        description:
          "The app cannot find this champion in Data Dragon, so it has nothing to suggest.",
      },
      complete: {
        title: "Nothing left to buy",
        description: "You own every item of the recommended build.",
      },
      error: { title: "Next items unavailable" },
      outdated: {
        title: "Next items not refreshed",
        note: "What follows is the last answer received.",
      },
    },
    owned: { title: "Your items" },
    enemies: { none: "No enemy in this game." },
    noItems: "No item yet",
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
