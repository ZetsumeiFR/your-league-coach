import { expect, it } from "bun:test";
import { buildRecommendationSchema } from "@your-league-coach/lol-data/types";
import { baseBuild } from "../../src/build/base";
import { ahriStats, row } from "./fixtures";

it("decodes the aggregate keys into a shared recommendation with a legal level sequence", () => {
  const build = buildRecommendationSchema.parse(baseBuild(ahriStats));
  expect(build).toMatchObject({
    championId: 103,
    role: "MIDDLE",
    patch: "16.23",
    sampleGames: 1000,
    sources: { currentGames: 1000, previousGames: 0 },
    runes: {
      primaryStyleId: 8100,
      subStyleId: 8200,
      selectedPerkIds: [8112, 8139, 8138, 8106, 8226, 8210, 5007, 5008, 5001],
    },
    spells: [4, 14],
    starter: [1056, 2003, 2003],
    skillOrder: [..."QEWQQRQWQWRWWEEREE"],
    boots: 3020,
    core: [6655, 4645, 3089],
    situational: [3135, 4629, 3116, 3100],
    adjustments: [],
  });
});

it("excludes below-5% core rows and shrinks a small win-rate lead at exactly 5%", () => {
  const build = baseBuild({
    ...ahriStats,
    rows: [
      ...ahriStats.rows,
      row("core", "6655-3157-3135", 49, 49),
      row("core", "6655-3102-3089", 50, 30),
    ],
  });
  expect(build?.core).toEqual([6655, 4645, 3089]);
});

it("uses the most popular key when no candidate reaches 5%", () => {
  const build = baseBuild({
    ...ahriStats,
    rows: [
      ...ahriStats.rows.filter(({ kind }) => kind !== "boots"),
      row("boots", "3158", 49, 10),
      row("boots", "3020", 48, 48),
    ],
  });
  expect(build?.boots).toBe(3158);
});

it("admits a key at exactly 5% while excluding the stronger row just below it", () => {
  const build = baseBuild({
    ...ahriStats,
    rows: [
      ...ahriStats.rows,
      row("core", "6655-3157-3135", 49, 49),
      row("core", "6655-3102-3089", 50, 35),
    ],
  });
  expect(build?.core).toEqual([6655, 3102, 3089]);
});

it("ranks a starter item among the top four when its item stats qualify", () => {
  const build = baseBuild({
    ...ahriStats,
    rows: [...ahriStats.rows, row("item", "1056", 200, 160)],
  });
  expect(build?.situational).toEqual([1056, 3135, 4629, 3116]);
});

it.each([
  { label: "empty", rows: [] },
  {
    label: "zero-game",
    rows: ahriStats.rows.map((entry) => ({ ...entry, games: 0, wins: 0 })),
  },
])("returns null for $label build stats", ({ rows }) => {
  expect(baseBuild({ ...ahriStats, rows })).toBeNull();
});
