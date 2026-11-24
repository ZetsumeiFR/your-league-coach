import { describe, expect, it } from "bun:test";
import { suggestBans } from "@your-league-coach/coach/draft/bans";
import {
  type SuggestPicksInput,
  suggestPicks,
} from "@your-league-coach/coach/draft/picks";
import {
  banSuggestionSchema,
  pickSuggestionSchema,
} from "@your-league-coach/lol-data/types";

const empty: SuggestPicksInput = {
  role: "MIDDLE",
  draft: {
    queueId: 420,
    localPlayerCellId: 0,
    myTeam: [],
    theirTeam: [],
    bans: { myTeamBans: [], theirTeamBans: [] },
    currentAction: "pick",
    isLocalPlayersTurn: true,
    pickableChampionIds: [],
    localPick: { championId: 0, completed: false },
  },
  pool: [],
  championInfo: [],
  stats: {
    championRole: [],
    matchups: [],
    synergies: [],
    roleDistribution: {},
  },
};

const middle = (championId: number, wins: number, games = 200) =>
  ({ championId, role: "MIDDLE", games, wins }) as const;

const ally = (championId: number, cellId: number, championPickIntent = 0) =>
  ({
    championId,
    cellId,
    championPickIntent,
    assignedPosition: "top",
  }) as const;

const poolEntry = (
  championId: number,
  masteryPoints: number,
  recentGames = 20,
  recentWins = 10
) => ({ championId, masteryPoints, recentGames, recentWins });

describe("draft picks", () => {
  it("lets a weighted lane counter overtake a stronger base pick and uses raw LCU ally roles", () => {
    const picks = suggestPicks({
      ...empty,
      draft: {
        ...empty.draft,
        theirTeam: [
          { cellId: 5, championId: 157 },
          { cellId: 6, championId: 64 },
        ],
        myTeam: [ally(122, 1)],
      },
      stats: {
        championRole: [middle(103, 100), middle(99, 104)],
        roleDistribution: { 157: { MIDDLE: 80 }, 64: { JUNGLE: 90 } },
        matchups: [
          {
            ...middle(103, 55, 100),
            opponentChampionId: 157,
            opponentRole: "MIDDLE",
          },
          {
            ...middle(103, 47, 100),
            opponentChampionId: 64,
            opponentRole: "JUNGLE",
          },
        ],
        synergies: [
          { ...middle(103, 51, 100), allyChampionId: 122, allyRole: "TOP" },
          { ...middle(103, 20, 100), allyChampionId: 122, allyRole: "JUNGLE" },
        ],
      },
    });
    expect(picks.map(({ championId }) => championId)).toEqual([103, 99]);
    const first = pickSuggestionSchema.parse(picks[0]);
    // (2 * 5 - 3) / 150 prior-adjusted games, then divide by total weight 3.
    expect(first.components.matchup).toBeCloseTo(7 / 450, 10);
    expect(first.components.synergy).toBeCloseTo(0.01, 10);
    expect(first.score).toBeCloseTo(7 / 450 + 0.005, 10);
    expect(first.reasons).toEqual([
      "counters:157",
      "countered_by:64",
      "synergy:122",
    ]);
  });

  it("filters pickability before truncation and returns ten picks in descending score order", () => {
    const ids = [103, 157, 99, 61, 134, 4, 7, 55, 91, 105, 238];
    const stats = {
      ...empty.stats,
      championRole: ids.map((id, index) => middle(id, 130 - index)).reverse(),
    };
    const open = suggestPicks({ ...empty, stats });
    const restricted = suggestPicks({
      ...empty,
      stats,
      draft: { ...empty.draft, pickableChampionIds: ids.slice(1) },
    });
    expect(open.map(({ championId }) => championId)).toEqual(ids.slice(0, 10));
    expect(restricted.map(({ championId }) => championId)).toEqual(
      ids.slice(1)
    );
  });

  it("admits the 150-game role and ten-game pool boundaries, caps mastery and handles negative form", () => {
    const picks = suggestPicks({
      ...empty,
      pool: [
        poolEntry(157, 1_000_000_000, 10, 10),
        poolEntry(4, 0, 25, 0),
        poolEntry(99, 1_000_000_000, 9, 9),
      ],
      stats: {
        ...empty.stats,
        championRole: [middle(103, 75, 150), middle(99, 100, 149)],
      },
    });
    expect(picks.map(({ championId }) => championId)).toEqual([157, 103, 4]);
    expect(picks[0]).toMatchObject({
      components: { pool: 0.03 },
      sampleGames: 0,
      reasons: ["in_your_pool"],
    });
    expect(picks[2]?.components.pool).toBe(-0.01);
  });

  it("subtracts a damage penalty only with at least three revealed allies and flags balance", () => {
    const input: SuggestPicksInput = {
      ...empty,
      championInfo: [122, 64, 22, 157]
        .map((key) => ({ key, info: { attack: 8, magic: 0 } }))
        .concat({ key: 103, info: { attack: 0, magic: 8 } }),
      stats: {
        ...empty.stats,
        championRole: [middle(103, 100), middle(157, 100)],
      },
    };
    const allies = [ally(122, 1), ally(64, 2), ally(22, 3)];
    const three = suggestPicks({
      ...input,
      draft: { ...empty.draft, myTeam: allies },
    });
    const two = suggestPicks({
      ...input,
      draft: { ...empty.draft, myTeam: allies.slice(0, 2) },
    });
    expect(three[0]).toMatchObject({
      championId: 103,
      score: 0,
      reasons: ["balances_damage"],
    });
    expect(three[1]).toMatchObject({ championId: 157, score: -0.01 });
    expect(two.map(({ score }) => score)).toEqual([0, 0]);
  });
});

describe("draft bans", () => {
  it("ranks the top five unique threats using directed matchup rates against the three highest-mastery pool entries", () => {
    const ids = [8, 45, 38, 13, 69, 157];
    const rows = ids.map((id, index) => middle(id, 112 - index));
    const result = suggestBans({
      ...empty,
      pool: [
        poolEntry(99, 100),
        poolEntry(61, 900),
        poolEntry(103, 800),
        poolEntry(4, 700),
      ],
      stats: {
        championRole: [...rows, { ...middle(157, 100), role: "TOP" }],
        matchups: [
          {
            ...middle(157, 80, 100),
            opponentChampionId: 103,
            opponentRole: "MIDDLE",
          },
          {
            ...middle(157, 57, 100),
            opponentChampionId: 61,
            opponentRole: "MIDDLE",
          },
          {
            ...middle(157, 0, 100),
            opponentChampionId: 99,
            opponentRole: "MIDDLE",
          },
          {
            ...middle(103, 20, 100),
            opponentChampionId: 157,
            opponentRole: "MIDDLE",
          },
        ],
      },
    });
    expect(result.map(({ championId }) => championId)).toEqual([
      157, 8, 45, 38, 13,
    ]);
    const first = banSuggestionSchema.parse(result[0]);
    expect(first.score).toBeCloseTo(0.028 + (0.3 + 0.07) / 3, 10);
    expect(first.reasons).toEqual([
      "strong_on_patch",
      "counters:61",
      "counters:103",
    ]);
  });

  it("targets the three best champions in the requested role without a player pool", () => {
    const result = suggestBans({
      ...empty,
      stats: {
        championRole: [
          middle(103, 120),
          middle(61, 115),
          middle(4, 110),
          middle(157, 100),
        ],
        matchups: [
          {
            ...middle(157, 80, 100),
            opponentChampionId: 103,
            opponentRole: "MIDDLE",
          },
        ],
      },
    });
    expect(result[0]).toMatchObject({
      championId: 157,
      reasons: ["counters:103"],
    });
  });
});

it("excludes both sides' bans and revealed picks, plus ally intents, but not the local hover", () => {
  const input: SuggestPicksInput = {
    ...empty,
    draft: {
      ...empty.draft,
      bans: { myTeamBans: [99], theirTeamBans: [61] },
      myTeam: [ally(0, 0, 103), ally(122, 1), ally(0, 2, 4)],
      theirTeam: [{ championId: 157, cellId: 5 }],
      localPick: { championId: 103, completed: false },
    },
    stats: {
      ...empty.stats,
      championRole: [103, 99, 61, 122, 4, 157, 55].map((id) => middle(id, 110)),
    },
  };
  expect(suggestPicks(input).map(({ championId }) => championId)).toEqual([
    55, 103,
  ]);
  expect(suggestBans(input).map(({ championId }) => championId)).toEqual([
    55, 103,
  ]);
  const locked = {
    ...input,
    draft: { ...input.draft, localPick: { championId: 103, completed: true } },
  };
  expect(suggestPicks(locked).map(({ championId }) => championId)).toEqual([
    55,
  ]);
  expect(suggestBans(locked).map(({ championId }) => championId)).toEqual([55]);
});

it("returns no suggestions for empty stats even with an experienced pool entry", () => {
  const input = { ...empty, pool: [poolEntry(103, 5000)] };
  expect(suggestPicks(input)).toEqual([]);
  expect(suggestBans(input)).toEqual([]);
});

it("treats an unknown opponent and missing pair rows neutrally; null role disables only picks", () => {
  const input = {
    ...empty,
    draft: {
      ...empty.draft,
      theirTeam: [
        { championId: 999_999, cellId: 5 },
        { championId: 0, cellId: 6 },
      ],
      pickableChampionIds: [103, 999_999],
    },
    stats: { ...empty.stats, championRole: [middle(103, 111, 200.5)] },
  };
  const [pick] = suggestPicks(input);
  expect(pick).toMatchObject({
    championId: 103,
    sampleGames: 201,
    components: { matchup: 0, synergy: 0 },
  });
  expect(suggestPicks({ ...input, role: null })).toEqual([]);
  expect(suggestBans({ ...input, role: null })[0]).toMatchObject({
    championId: 103,
    score: pick?.score,
  });
});
