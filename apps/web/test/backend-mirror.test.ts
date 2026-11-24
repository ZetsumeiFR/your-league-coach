import { describe, expect, it } from "bun:test";
import { file } from "bun";

import {
  matchHistory,
  sentinel,
  summoner,
} from "../../../scripts/fake-riot-client/fixtures/lcu/accounts";
import {
  draftPath,
  rankedPickableChampionIds,
  rankedScenario,
  scenarioFrames,
} from "../../../scripts/fake-riot-client/fixtures/lcu/scenarios";
import { liveGameData } from "../../../scripts/fake-riot-client/fixtures/live/scenarios";
import {
  aggregateRecentGames,
  normalizeDraft,
  normalizeLiveGame,
  wampFrameSchema,
} from "./support/backend-mirror";

const rankedJsonl = await file(
  new URL(
    "../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl",
    import.meta.url
  )
).text();

const RANKED_QUEUE = 420;
const CATALOG = { Ahri: 103, Garen: 86, Zed: 238 };

const rankedDraftSessions = () =>
  (scenarioFrames(rankedScenario, rankedJsonl) ?? [])
    .map((text) => wampFrameSchema.parse(JSON.parse(text))[2])
    .filter(({ uri }) => uri === draftPath)
    .map(({ data }) => data);

describe("mocked champ select snapshot", () => {
  const drafts = rankedDraftSessions().map((session) =>
    normalizeDraft(session, RANKED_QUEUE, [...rankedPickableChampionIds])
  );
  const [banTurn, midPick, lanePick, hovering, locked] = drafts;
  const revealedEnemies = (draft: (typeof drafts)[number] | undefined) =>
    draft?.theirTeam
      .map(({ championId }) => championId)
      .filter((championId) => championId !== 0);

  it("carries none of the names the client fixture holds", () => {
    for (const session of rankedDraftSessions()) {
      expect(JSON.stringify(session)).toContain(sentinel);
    }
    expect(JSON.stringify(drafts)).not.toContain(sentinel);
  });

  it("walks one draft from the local ban turn to the lock", () => {
    expect(
      drafts.map(({ currentAction, isLocalPlayersTurn }) => [
        currentAction,
        isLocalPlayersTurn,
      ])
    ).toEqual([
      ["ban", true],
      ["pick", false],
      ["pick", false],
      ["pick", true],
      ["none", false],
    ]);
    expect(banTurn?.bans).toEqual({ myTeamBans: [157], theirTeamBans: [] });
    expect(revealedEnemies(banTurn)).toEqual([]);
    expect(revealedEnemies(midPick)).toEqual([122, 121]);
    expect(revealedEnemies(lanePick)).toEqual([122, 121, 238]);
  });

  it("keeps only the fields of the backend snapshot", () => {
    expect(Object.keys(hovering?.myTeam[0] ?? {}).sort()).toEqual([
      "assignedPosition",
      "cellId",
      "championId",
      "championPickIntent",
    ]);
    expect(Object.keys(hovering?.theirTeam[0] ?? {}).sort()).toEqual([
      "cellId",
      "championId",
    ]);
  });

  it("reports the local pick as pending while hovering, then as locked", () => {
    expect(hovering).toMatchObject({
      queueId: RANKED_QUEUE,
      currentAction: "pick",
      isLocalPlayersTurn: true,
      localPick: { championId: 103, completed: false },
    });
    expect(locked).toMatchObject({
      currentAction: "none",
      isLocalPlayersTurn: false,
      localPick: { championId: 103, completed: true },
    });
  });

  it("drops empty ban slots", () => {
    expect(hovering?.bans).toEqual({
      myTeamBans: [157, 91],
      theirTeamBans: [55, 7],
    });
  });
});

describe("mocked live game", () => {
  it("names the local champion by its id and sorts players by team", () => {
    const game = normalizeLiveGame(liveGameData(false), CATALOG);
    expect(game).toMatchObject({
      activePlayer: { championName: "Ahri", level: 9 },
      myItems: [1056, 2003, 2003],
      allies: [{ championId: 86, items: [1055] }],
      enemies: [{ championId: 238, items: [1058] }],
    });
    expect(JSON.stringify(game)).not.toContain(sentinel);
  });

  it("gives every enemy the armor items in the armored scenario", () => {
    const game = normalizeLiveGame(liveGameData(true), CATALOG);
    expect(game?.enemies).toEqual([
      { championId: 238, items: [3047, 3075, 3110] },
    ]);
    expect(game?.allies).toEqual([{ championId: 86, items: [1055] }]);
  });

  it("has no game to report while a champion is missing from the catalog", () => {
    expect(normalizeLiveGame(liveGameData(false), { Ahri: 103 })).toBeNull();
  });
});

describe("mocked recent games", () => {
  it("counts only the local player's games", () => {
    expect(aggregateRecentGames(matchHistory, summoner)).toEqual([
      { championId: 103, games: 1, wins: 1 },
    ]);
  });
});
