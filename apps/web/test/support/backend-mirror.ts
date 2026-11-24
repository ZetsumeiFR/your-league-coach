/**
 * TypeScript mirror of what the Rust connectors do to raw client payloads
 * (src-tauri/src/lcu/snapshot.rs, lcu/commands.rs, live/payload.rs). Only the
 * IPC mock uses it, to turn the fake Riot client fixtures into the events and
 * command results the real backend would send. The schemas keep exactly the
 * fields the Rust types keep, so names in a fixture cannot pass through.
 */
import { lcuPositionSchema } from "@your-league-coach/lol-data/roles";
import type { DraftState } from "@your-league-coach/lol-data/types";
import { z } from "zod";

import {
  GAMEFLOW_PHASES,
  type LiveGame,
  type RecentGames,
} from "../../src/lib/desktop/events";

const ARAM_QUEUE_ID = 450;
const LIVE_CHAMPION_PREFIX = "game_character_displayname_";

const cellId = z.number().int();
/** A negative champion id on the wire means "no champion". */
const championId = z
  .number()
  .int()
  .transform((id) => Math.max(id, 0));

const sessionSchema = z.object({
  localPlayerCellId: cellId,
  myTeam: z.array(
    z.object({
      cellId,
      championId,
      championPickIntent: championId,
      assignedPosition: lcuPositionSchema.catch(""),
    })
  ),
  theirTeam: z.array(z.object({ cellId, championId })),
  bans: z.object({
    myTeamBans: z.array(z.number().int()),
    theirTeamBans: z.array(z.number().int()),
  }),
  actions: z.array(
    z.array(
      z.object({
        actorCellId: cellId,
        championId,
        completed: z.boolean(),
        isInProgress: z.boolean(),
        type: z.enum(["ban", "pick", "none"]).catch("none"),
      })
    )
  ),
});

export const phaseSchema = z.enum(GAMEFLOW_PHASES).catch("Unknown");

export const flowQueueSchema = z
  .object({
    gameData: z
      .object({ queue: z.object({ id: z.number().int() }).optional() })
      .optional(),
  })
  .transform(({ gameData }) => gameData?.queue?.id || null);

export const wampFrameSchema = z.tuple([
  z.literal(8),
  z.string(),
  z.object({ data: z.unknown(), uri: z.string() }),
]);

const selectedBans = (ids: number[]) => ids.filter((id) => id > 0);

type Session = z.infer<typeof sessionSchema>;

const localPickOf = (
  session: Session,
  queueId: number
): DraftState["localPick"] => {
  const local = session.localPlayerCellId;
  const pickAction = session.actions
    .flat()
    .findLast(
      (action) => action.actorCellId === local && action.type === "pick"
    );
  if (pickAction) {
    return {
      championId: pickAction.championId,
      completed: pickAction.completed,
    };
  }
  if (queueId !== ARAM_QUEUE_ID) {
    return { championId: 0, completed: false };
  }
  const assigned =
    session.myTeam.find((ally) => ally.cellId === local)?.championId ?? 0;
  return { championId: assigned, completed: assigned !== 0 };
};

export const normalizeDraft = (
  rawSession: unknown,
  queueId: number,
  pickableChampionIds: number[]
): DraftState => {
  const session = sessionSchema.parse(rawSession);
  const local = session.localPlayerCellId;
  const actions = session.actions.flat();
  const [first, ...laterActive] = actions.filter(
    (action) =>
      action.isInProgress && !action.completed && action.type !== "none"
  );
  const isLocal = (action: { actorCellId: number }) =>
    action.actorCellId === local;
  const current =
    first && isLocal(first) ? first : (laterActive.find(isLocal) ?? first);
  return {
    queueId,
    localPlayerCellId: local,
    myTeam: session.myTeam,
    theirTeam: session.theirTeam,
    bans: {
      myTeamBans: selectedBans(session.bans.myTeamBans),
      theirTeamBans: selectedBans(session.bans.theirTeamBans),
    },
    currentAction: current?.type ?? "none",
    isLocalPlayersTurn: current !== undefined && isLocal(current),
    localPick: localPickOf(session, queueId),
    pickableChampionIds,
  };
};

const identitySchema = z.object({
  riotId: z.string().optional(),
  summonerName: z.string().optional(),
});

const liveSchema = z.object({
  activePlayer: identitySchema.extend({
    level: z.number(),
    currentGold: z.number(),
  }),
  allPlayers: z.array(
    identitySchema.extend({
      rawChampionName: z.string(),
      team: z.string(),
      items: z.array(
        z.object({ itemID: z.number(), slot: z.number(), count: z.number() })
      ),
    })
  ),
  gameData: z.object({
    gameMode: z
      .enum(["CLASSIC", "ARAM", "CHERRY", "SWIFTPLAY", "URF", "UNKNOWN"])
      .catch("UNKNOWN"),
    gameTime: z.number(),
  }),
});

type Identity = z.infer<typeof identitySchema>;

/** Riot id when both sides have one, summoner name otherwise; never emitted. */
const isSamePlayer = (local: Identity, candidate: Identity): boolean => {
  if (local.riotId && candidate.riotId) {
    return local.riotId === candidate.riotId;
  }
  return (
    Boolean(local.summonerName) && candidate.summonerName === local.summonerName
  );
};

const inventory = (
  items: { count: number; itemID: number; slot: number }[]
): number[] =>
  items
    .toSorted((a, b) => a.slot - b.slot || a.itemID - b.itemID)
    .flatMap((item) => new Array<number>(item.count).fill(item.itemID));

/**
 * Null when the local player or any champion cannot be resolved, which the
 * real connector reports as "waiting for game".
 */
export const normalizeLiveGame = (
  rawGame: unknown,
  championIds: Record<string, number>
): LiveGame | null => {
  const game = liveSchema.parse(rawGame);
  const catalog = new Map(
    Object.entries(championIds).map(([slug, id]) => [
      slug.toLowerCase(),
      { id, slug },
    ])
  );
  const resolve = (rawChampionName: string) =>
    rawChampionName.startsWith(LIVE_CHAMPION_PREFIX)
      ? catalog.get(
          rawChampionName.slice(LIVE_CHAMPION_PREFIX.length).toLowerCase()
        )
      : undefined;
  const locals = game.allPlayers.filter((player) =>
    isSamePlayer(game.activePlayer, player)
  );
  const [local] = locals;
  const localChampion = local ? resolve(local.rawChampionName) : undefined;
  if (!(local && localChampion) || locals.length > 1 || local.team === "") {
    return null;
  }
  const allies: LiveGame["allies"] = [];
  const enemies: LiveGame["enemies"] = [];
  for (const player of game.allPlayers) {
    if (player === local) {
      continue;
    }
    const champion = resolve(player.rawChampionName);
    if (!champion) {
      return null;
    }
    const roster = player.team === local.team ? allies : enemies;
    roster.push({ championId: champion.id, items: inventory(player.items) });
  }
  return {
    gameMode: game.gameData.gameMode,
    gameTime: game.gameData.gameTime,
    activePlayer: {
      championName: localChampion.slug,
      level: game.activePlayer.level,
      currentGold: game.activePlayer.currentGold,
    },
    myItems: inventory(local.items),
    allies,
    enemies,
  };
};

const historySchema = z.object({
  games: z.object({
    games: z.array(
      z.object({
        participantIdentities: z.array(
          z.object({
            participantId: z.number(),
            player: z.object({
              puuid: z.string().optional(),
              summonerId: z.number().optional(),
            }),
          })
        ),
        participants: z.array(
          z.object({
            championId: z.number(),
            participantId: z.number(),
            stats: z.object({ win: z.boolean() }),
          })
        ),
      })
    ),
  }),
});

export const aggregateRecentGames = (
  rawHistory: unknown,
  identity: { puuid: string; summonerId: number }
): RecentGames[] => {
  const byChampion = new Map<number, RecentGames>();
  for (const game of historySchema.parse(rawHistory).games.games) {
    const local = game.participantIdentities.find(
      ({ player }) =>
        player.summonerId === identity.summonerId ||
        player.puuid === identity.puuid
    );
    const played = game.participants.find(
      (participant) => participant.participantId === local?.participantId
    );
    if (played) {
      const entry = byChampion.get(played.championId) ?? {
        championId: played.championId,
        games: 0,
        wins: 0,
      };
      entry.games += 1;
      entry.wins += Number(played.stats.win);
      byChampion.set(played.championId, entry);
    }
  }
  return [...byChampion.values()].toSorted(
    (a, b) => a.championId - b.championId
  );
};
