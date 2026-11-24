import { describe, expect, it } from "bun:test";
import {
  type DraftState,
  draftInputSchema,
  draftStateSchema,
} from "@your-league-coach/lol-data/types";
import { file } from "bun";

import { sentinel } from "../../../scripts/fake-riot-client/fixtures/lcu/accounts";
import {
  draftPath,
  rankedPickableChampionIds,
  rankedScenario,
  scenarioFrames,
} from "../../../scripts/fake-riot-client/fixtures/lcu/scenarios";
import {
  assignedRole,
  draftMode,
  parseSuggestionRequest,
  playerPool,
  scoringDraft,
  suggestionKind,
  suggestionRequestKey,
} from "../src/lib/draft/request";
import { normalizeDraft, wampFrameSchema } from "./support/backend-mirror";

const rankedJsonl = await file(
  new URL(
    "../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl",
    import.meta.url
  )
).text();

const [hovering, locked] = (scenarioFrames(rankedScenario, rankedJsonl) ?? [])
  .map((text) => wampFrameSchema.parse(JSON.parse(text))[2])
  .filter(({ uri }) => uri === draftPath)
  .map(({ data }) =>
    normalizeDraft(data, 420, [...rankedPickableChampionIds])
  ) as [DraftState, DraftState];

const withLocal = (
  draft: DraftState,
  change: Partial<DraftState["myTeam"][number]>
): DraftState => ({
  ...draft,
  myTeam: draft.myTeam.map((member) =>
    member.cellId === draft.localPlayerCellId
      ? { ...member, ...change }
      : member
  ),
});

describe("suggestion request key", () => {
  const key = suggestionRequestKey(hovering);

  it("ignores what the scoring does not read", () => {
    const otherHover = withLocal(
      { ...hovering, localPick: { championId: 99, completed: false } },
      { championPickIntent: 99 }
    );
    const turnPassed: DraftState = {
      ...hovering,
      currentAction: "none",
      isLocalPlayersTurn: false,
    };
    const reordered: DraftState = {
      ...hovering,
      bans: {
        myTeamBans: [...hovering.bans.myTeamBans].reverse(),
        theirTeamBans: [
          ...hovering.bans.theirTeamBans,
          ...hovering.bans.theirTeamBans,
        ],
      },
      pickableChampionIds: [...hovering.pickableChampionIds].reverse(),
    };
    for (const same of [otherHover, turnPassed, reordered]) {
      expect(suggestionRequestKey(same)).toBe(key);
    }
  });

  it("changes with everything the scoring reads", () => {
    const [firstAlly] = hovering.myTeam.filter(
      ({ cellId }) => cellId !== hovering.localPlayerCellId
    );
    const allyHover: DraftState = {
      ...hovering,
      myTeam: hovering.myTeam.map((member) =>
        member === firstAlly ? { ...member, championPickIntent: 1 } : member
      ),
    };
    const enemyHidden: DraftState = {
      ...hovering,
      theirTeam: hovering.theirTeam.map((member, index) =>
        index === 0 ? { ...member, championId: 0 } : member
      ),
    };
    const oneMoreBan: DraftState = {
      ...hovering,
      bans: {
        ...hovering.bans,
        myTeamBans: [...hovering.bans.myTeamBans, 1],
      },
    };
    const banTurn: DraftState = {
      ...hovering,
      currentAction: "ban",
      isLocalPlayersTurn: true,
    };
    const otherRole = withLocal(hovering, { assignedPosition: "top" });
    const keys = [
      allyHover,
      enemyHidden,
      oneMoreBan,
      banTurn,
      otherRole,
      locked,
      { ...hovering, queueId: 440 },
      { ...hovering, pickableChampionIds: [] },
    ].map(suggestionRequestKey);
    expect(new Set([key, ...keys]).size).toBe(keys.length + 1);
  });

  it("round-trips to a draft the API accepts, without the local hover", () => {
    const request = parseSuggestionRequest(key);
    expect(request.kind).toBe("pick");
    expect(request.draft).toEqual(scoringDraft(hovering));
    expect(draftStateSchema.parse(request.draft)).toEqual(request.draft);
    const local = request.draft.myTeam.find(
      ({ cellId }) => cellId === request.draft.localPlayerCellId
    );
    expect(local?.championPickIntent).toBe(0);
    expect(request.draft.localPick).toEqual({
      championId: 0,
      completed: false,
    });
    expect(
      parseSuggestionRequest(suggestionRequestKey(locked)).draft.localPick
    ).toEqual(locked.localPick);
  });

  it("sends nothing but the fields of a draft", () => {
    const named = {
      ...hovering,
      summonerName: sentinel,
      myTeam: hovering.myTeam.map((member) => ({
        ...member,
        gameName: sentinel,
      })),
      theirTeam: hovering.theirTeam.map((member) => ({
        ...member,
        displayName: sentinel,
      })),
    };
    expect(JSON.stringify(named)).toContain(sentinel);
    expect(suggestionRequestKey(named)).toBe(key);
    expect(suggestionRequestKey(named)).not.toContain(sentinel);
  });
});

describe("draft reading", () => {
  it("suggests bans only while the local player bans", () => {
    const turns = [
      ["ban", true, "ban"],
      ["ban", false, "pick"],
      ["pick", true, "pick"],
      ["none", false, "pick"],
    ] as const;
    for (const [currentAction, isLocalPlayersTurn, kind] of turns) {
      expect(
        suggestionKind({ ...hovering, currentAction, isLocalPlayersTurn })
      ).toBe(kind);
    }
  });

  it("takes the role the client assigned to the local player", () => {
    expect(assignedRole(hovering)).toBe("MIDDLE");
    expect(
      assignedRole(withLocal(hovering, { assignedPosition: "" }))
    ).toBeNull();
    expect(assignedRole({ ...hovering, localPlayerCellId: 99 })).toBeNull();
  });

  it("knows which queues have suggestions", () => {
    expect([420, 440, 400].map(draftMode)).toEqual(["rift", "rift", "rift"]);
    expect(draftMode(450)).toBe("aram");
    expect([1700, 430, 0].map(draftMode)).toEqual([
      "unsupported",
      "unsupported",
      "unsupported",
    ]);
  });
});

describe("player pool", () => {
  const mastery = [
    { championId: 103, masteryPoints: 42_000 },
    { championId: 1, masteryPoints: 90_000 },
    { championId: 7, masteryPoints: 500 },
  ];
  const recent = [
    { championId: 103, games: 12, wins: 7 },
    { championId: 61, games: 3, wins: 1 },
  ];

  it("merges mastery and recent results, most played recently first", () => {
    expect(playerPool(mastery, recent)).toEqual([
      {
        championId: 103,
        masteryPoints: 42_000,
        recentGames: 12,
        recentWins: 7,
      },
      { championId: 61, masteryPoints: 0, recentGames: 3, recentWins: 1 },
      { championId: 1, masteryPoints: 90_000, recentGames: 0, recentWins: 0 },
      { championId: 7, masteryPoints: 500, recentGames: 0, recentWins: 0 },
    ]);
  });

  it("gives the same pool whatever order the client answers in", () => {
    expect(playerPool([...mastery].reverse(), [...recent].reverse())).toEqual(
      playerPool(mastery, recent)
    );
  });

  it("keeps the most played champions, as many as one request may carry", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      championId: index + 1,
      masteryPoints: index,
    }));
    const pool = playerPool(many, [{ championId: 1, games: 2, wins: 1 }]);
    const request = { queueId: 420, role: "MIDDLE", draft: locked, pool };
    expect(draftInputSchema.safeParse(request).success).toBe(true);
    expect(
      draftInputSchema.safeParse({
        ...request,
        pool: [...pool, ...pool.slice(0, 1)],
      }).success
    ).toBe(false);
    expect(pool.slice(0, 2).map(({ championId }) => championId)).toEqual([
      1, 400,
    ]);
    expect(pool.map(({ championId }) => championId)).not.toContain(2);
  });
});
