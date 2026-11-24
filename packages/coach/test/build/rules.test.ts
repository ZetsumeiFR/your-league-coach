import { expect, it } from "bun:test";
import { buildRecommendationSchema } from "@your-league-coach/lol-data/types";
import { baseBuild } from "../../src/build/base";
import { applyBuildRules, type BuildRuleContext } from "../../src/build/rules";
import { computeEnemyProfile } from "../../src/build/traits";
import { ahriStats, champion, items, row } from "./fixtures";

const healHeavy = ["Soraka", "Aatrox", "Jinx", "Veigar", "Zed"];
const adHeavy = ["Zed", "Talon", "Jinx", "Sivir", "Ahri"];
const balanced = ["Zed", "Jinx", "Karthus", "Ahri", "Brand"];
const build = buildRecommendationSchema.parse(baseBuild(ahriStats));

function context(
  enemies: readonly string[],
  overrides: Partial<BuildRuleContext> = {}
): BuildRuleContext {
  return {
    player: champion("Ahri"),
    allies: [champion("Ornn")],
    profile: computeEnemyProfile(enemies.map(champion)),
    statsGroup: "sr",
    items,
    buildStats: ahriStats.rows,
    championCounts: ahriStats,
    ...overrides,
  };
}

it("replaces the lowest-ranked situational item against two healers", () => {
  const result = applyBuildRules(build, context(healHeavy));
  expect(result.situational).toEqual([3135, 4629, 3116, 3165]);
  expect(result.adjustments).toEqual([
    {
      ruleId: "anti_heal",
      reasonCode: "anti_heal",
      replaced: 3100,
      added: 3165,
    },
  ]);
});

it("detects stat-backed Wounds items that don't use the passive name", () => {
  const result = applyBuildRules(
    build,
    context(healHeavy, {
      buildStats: [...ahriStats.rows, row("item", "3075", 100, 63)],
    })
  );
  expect(result.adjustments.map(({ added }) => added)).toEqual([3075]);
});

it.each([
  { games: 199, label: "heal_heavy", selected: 3165 },
  { games: 200, label: "ad_heavy", selected: 3165 },
  { games: 200, label: "heal_heavy", selected: 3075 },
] as const)(
  "uses enemy item evidence only at 200 games and for the matching label ($games, $label)",
  ({ games, label, selected }) => {
    const result = applyBuildRules(
      build,
      context(healHeavy, {
        itemVsEnemyStats: [
          { itemId: 3075, enemyProfile: label, games, wins: 120 },
          {
            itemId: 999_999,
            enemyProfile: "heal_heavy",
            games: 400,
            wins: 390,
          },
          { itemId: 3089, enemyProfile: "heal_heavy", games: 400, wins: 380 },
        ],
      })
    );
    expect(result.adjustments.map(({ added }) => added)).toEqual([selected]);
  }
);

it("suggests Steelcaps and an armor item against four AD champions for a non-ADC", () => {
  const result = applyBuildRules(build, context(adHeavy));
  expect(result.boots).toBe(3047);
  expect(result.adjustments).toEqual([
    {
      ruleId: "armor_vs_ad",
      reasonCode: "armor_vs_ad",
      replaced: 3020,
      added: 3047,
    },
    {
      ruleId: "armor_vs_ad",
      reasonCode: "armor_vs_ad",
      replaced: 3100,
      added: 3157,
    },
  ]);
});

it("leaves the base build unchanged against a balanced composition", () => {
  expect(applyBuildRules(build, context(balanced))).toEqual(build);
});

it("does not apply the armor rule to an ADC", () => {
  const marksman = { ...build, championId: 222, role: "BOTTOM" } as const;
  expect(
    applyBuildRules(
      marksman,
      context(adHeavy, {
        player: champion("Jinx"),
      })
    )
  ).toEqual(marksman);
});

it.each([
  { missing: 3165, enemies: healHeavy },
  { missing: 3047, enemies: adHeavy },
])(
  "skips a rule when its replacement $missing is missing",
  ({ missing, enemies }) => {
    expect(
      applyBuildRules(
        build,
        context(enemies, {
          items: items.filter(({ id }) => id !== missing),
        })
      )
    ).toEqual(build);
  }
);

it("replaces boots once when AP and hard CC both call for Mercury's Treads", () => {
  const result = applyBuildRules(
    build,
    context(["Annie", "Ahri", "Lux", "Karthus", "Jinx"])
  );
  expect(result.adjustments).toEqual([
    { ruleId: "mr_vs_ap", reasonCode: "mr_vs_ap", replaced: 3020, added: 3111 },
    { ruleId: "mr_vs_ap", reasonCode: "mr_vs_ap", replaced: 3100, added: 3102 },
  ]);
});

it("applies the hard-CC rule without a dominant damage type", () => {
  const result = applyBuildRules(
    build,
    context(["Leona", "Jinx", "Zed", "Ahri", "Annie"])
  );
  expect(result.adjustments).toEqual([
    {
      ruleId: "tenacity_vs_cc",
      reasonCode: "tenacity_vs_cc",
      replaced: 3020,
      added: 3111,
    },
  ]);
});

it("does not create an ARAM boot slot when there is no boots statistic", () => {
  const result = applyBuildRules(
    { ...build, role: null, boots: null },
    context(adHeavy, {
      statsGroup: "aram",
    })
  );
  expect(result.boots).toBeNull();
  expect(result.adjustments.map(({ added }) => added)).toEqual([3157]);
});

it("selects a defensive core triple for a fighter without an allied tank", () => {
  const result = applyBuildRules(
    build,
    context(balanced, {
      player: champion("Mordekaiser"),
      allies: [champion("Jinx")],
    })
  );
  expect(result.core).toEqual([6655, 3157, 3089]);
  expect(result.adjustments).toEqual([
    {
      ruleId: "frontline_missing",
      reasonCode: "frontline_missing",
      replaced: 4645,
      added: 3157,
    },
  ]);
});

it.each([
  {
    enemies: ["Ornn", "Leona", "Karthus", "Brand", "Jinx"],
    resistanceItems: 0,
  },
  { enemies: balanced, resistanceItems: 3 },
])(
  "recommends stat-backed penetration for tanks or live resistance ($resistanceItems items)",
  ({ enemies, resistanceItems }) => {
    const result = applyBuildRules(
      { ...build, situational: [4629, 3116, 3100] },
      context(enemies, {
        profile: {
          ...computeEnemyProfile(enemies.map(champion)),
          resistanceItems,
        },
        buildStats: [...ahriStats.rows.filter(({ key }) => key !== "4645")],
      })
    );
    expect(
      result.adjustments.map(({ ruleId, added }) => ({ ruleId, added }))
    ).toEqual([{ ruleId: "penetration_vs_tanks", added: 3135 }]);
  }
);
