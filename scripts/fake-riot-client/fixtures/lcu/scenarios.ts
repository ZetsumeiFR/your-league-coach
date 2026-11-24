import {
  ARAM_LOCAL_CHAMPION_ID,
  ARENA_LOCAL_CHAMPION_ID,
  RANKED_ALLY_CHAMPION_IDS,
  RANKED_ENEMY_CHAMPION_IDS,
  RANKED_LOCAL_CHAMPION_ID,
  RANKED_MY_TEAM_BAN_IDS,
  RANKED_THEIR_TEAM_BAN_IDS,
} from "../ids";
import { summoner } from "./accounts";

export const phasePath = "/lol-gameflow/v1/gameflow-phase";
export const flowPath = "/lol-gameflow/v1/session";
export const draftPath = "/lol-champ-select/v1/session";

const draftScenarios = {
  "champ-select-aram": { championId: ARAM_LOCAL_CHAMPION_ID, queueId: 450 },
  "champ-select-arena": { championId: ARENA_LOCAL_CHAMPION_ID, queueId: 1700 },
};

export const rankedScenario = "champ-select-ranked";
const lineBreak = /\r?\n/u;
export const rankedChampionIds = [
  RANKED_LOCAL_CHAMPION_ID,
  ...RANKED_ALLY_CHAMPION_IDS,
  ...RANKED_ENEMY_CHAMPION_IDS,
  ...RANKED_MY_TEAM_BAN_IDS,
  ...RANKED_THEIR_TEAM_BAN_IDS,
];

const event = (uri: string, data: unknown) => ({
  data,
  eventType: "Update",
  uri,
});

const frame = (uri: string, data: unknown) =>
  JSON.stringify([
    8,
    `OnJsonApiEvent${uri.replaceAll("/", "_")}`,
    event(uri, data),
  ]);

export const liveScenario = "live-game";
export const liveArmorScenario = "live-game-armored";
const liveEndScenario = "live-game-ended";

export const loadScenario = async (name: string | null) => {
  if (name === liveScenario || name === liveArmorScenario) {
    return [
      frame(flowPath, { gameData: { queue: { id: 420 } } }),
      frame(phasePath, "InProgress"),
    ];
  }
  if (name === liveEndScenario) {
    return [frame(phasePath, "EndOfGame")];
  }
  if (name === rankedScenario) {
    const jsonl = await file(
      `${import.meta.dir}/${rankedScenario}.jsonl`
    ).text();
    return jsonl.trim().split(lineBreak);
  }
  if (name !== "champ-select-aram" && name !== "champ-select-arena") {
    return null;
  }
  const { championId, queueId } = draftScenarios[name];
  return [
    frame(phasePath, "ChampSelect"),
    frame(flowPath, { gameData: { queue: { id: queueId } } }),
    frame(draftPath, {
      actions: [],
      bans: { myTeamBans: [], theirTeamBans: [] },
      localPlayerCellId: 0,
      myTeam: [
        {
          ...summoner,
          assignedPosition: "",
          cellId: 0,
          championId,
          championPickIntent: 0,
        },
      ],
      theirTeam: [],
    }),
  ];
};

import { file } from "bun";
