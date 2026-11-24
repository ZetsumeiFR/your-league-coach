import { expect, it } from "bun:test";
import {
  type SuggestPicksInput,
  suggestPicks,
} from "@your-league-coach/coach/draft/picks";
import type { PickSuggestion } from "@your-league-coach/lol-data/types";

const pickableChampionIds = [
  103, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15,
];
const ranked = {
  role: "MIDDLE",
  draft: {
    queueId: 420,
    localPlayerCellId: 2,
    myTeam: [
      {
        cellId: 0,
        championId: 86,
        championPickIntent: 0,
        assignedPosition: "top",
      },
      {
        cellId: 1,
        championId: 64,
        championPickIntent: 0,
        assignedPosition: "jungle",
      },
      {
        cellId: 2,
        championId: 0,
        championPickIntent: 103,
        assignedPosition: "middle",
      },
      {
        cellId: 3,
        championId: 222,
        championPickIntent: 0,
        assignedPosition: "bottom",
      },
      {
        cellId: 4,
        championId: 412,
        championPickIntent: 0,
        assignedPosition: "utility",
      },
    ],
    theirTeam: [122, 121, 238, 51, 89].map((championId, index) => ({
      championId,
      cellId: index + 5,
    })),
    bans: { myTeamBans: [], theirTeamBans: [] },
    currentAction: "pick",
    isLocalPlayersTurn: true,
    pickableChampionIds,
    localPick: { championId: 103, completed: false },
  },
  pool: [],
  stats: {
    championRole: pickableChampionIds.map((championId) => ({
      championId,
      role: "MIDDLE" as const,
      games: 600,
      wins: 300 + (championId === 1 ? 12 : 0) + (championId === 2 ? 10 : 0),
    })),
    matchups: [
      {
        championId: 103,
        role: "MIDDLE",
        opponentChampionId: 238,
        opponentRole: "MIDDLE",
        wins: 224,
        games: 400,
      },
    ],
    synergies: [
      {
        championId: 8,
        role: "MIDDLE",
        allyChampionId: 86,
        allyRole: "TOP",
        wins: 50,
        games: 100,
      },
      {
        championId: 9,
        role: "MIDDLE",
        allyChampionId: 64,
        allyRole: "JUNGLE",
        wins: 50,
        games: 100,
      },
    ],
    roleDistribution: {
      122: { TOP: 100 },
      121: { JUNGLE: 100 },
      51: { BOTTOM: 100 },
      89: { UTILITY: 100 },
    },
  },
} satisfies Omit<SuggestPicksInput, "championInfo">;

it("scores the documented four-field input with four revealed allies and no damage data", () => {
  const expected = suggestPicks({ ...ranked, championInfo: [] });
  expect(expected).toHaveLength(10);
  expect(suggestPicks(ranked)).toEqual(expected);
  expect(
    suggestPicks({
      ...ranked,
      championInfo: [{ key: 103, info: { attack: 0, magic: 10 } }],
    })
  ).toEqual(expected);
});

it("weights the lane opponent assigned by elimination even without marginal role data", () => {
  const picks = suggestPicks({ ...ranked, championInfo: [] });
  expect(picks.slice(0, 3).map(({ championId }) => championId)).toEqual([
    1, 103, 2,
  ]);
  expect(picks[1]?.score).toBeCloseTo(0.017_777_78, 7);
  expect(picks[2]?.score).toBeCloseTo(0.015_384_62, 7);
  expect(picks[1]?.reasons).toContain("counters:238");
});

it("suggests an experienced pool pick using its matchup without any champion-role rows", () => {
  const input: SuggestPicksInput = {
    ...ranked,
    championInfo: [],
    draft: {
      ...ranked.draft,
      myTeam: [],
      theirTeam: [{ cellId: 5, championId: 1 }],
      pickableChampionIds: [2],
    },
    pool: [{ championId: 2, masteryPoints: 0, recentGames: 12, recentWins: 6 }],
    stats: {
      championRole: [],
      matchups: [
        {
          championId: 2,
          role: "MIDDLE",
          opponentChampionId: 1,
          opponentRole: "MIDDLE",
          wins: 90,
          games: 100,
        },
      ],
      synergies: [],
      roleDistribution: { 1: { MIDDLE: 100 } },
    },
  };
  const withTopRow = suggestPicks({
    ...input,
    stats: {
      ...input.stats,
      championRole: [{ championId: 99, role: "TOP", wins: 75, games: 150 }],
    },
  });
  const expected: PickSuggestion = {
    championId: 2,
    winRate: 0.5,
    sampleGames: 0,
    components: {
      strength: 0,
      matchup: (90 + 25) / 150 - 0.5,
      synergy: 0,
      pool: 0,
    },
    score: (90 + 25) / 150 - 0.5,
    reasons: ["counters:1", "in_your_pool"],
  };
  expect(withTopRow).toEqual([expected]);
  expect(suggestPicks(input)).toEqual([expected]);
});
