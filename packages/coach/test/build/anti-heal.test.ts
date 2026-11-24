import { expect, it } from "bun:test";
import type { Item } from "@your-league-coach/lol-data/ddragon";
import { buildRecommendationSchema } from "@your-league-coach/lol-data/types";
import { baseBuild } from "../../src/build/base";
import { applyBuildRules } from "../../src/build/rules";
import { computeEnemyProfile } from "../../src/build/traits";
import { ahriStats, champion, items, row } from "./fixtures";

const base = buildRecommendationSchema.parse(baseBuild(ahriStats));
const profile = computeEnemyProfile(
  ["Soraka", "Aatrox", "Jinx", "Veigar", "Zed"].map(champion)
);

function selectedAntiHeal(
  id: number,
  catalog: readonly Item[],
  player = "Ahri"
) {
  return applyBuildRules(base, {
    allies: [],
    buildStats: [...ahriStats.rows, row("item", String(id), 100, 40)],
    championCounts: ahriStats,
    items: catalog,
    player: champion(player),
    profile,
    statsGroup: "sr",
  })
    .adjustments.filter(({ ruleId }) => ruleId === "anti_heal")
    .map(({ added }) => added);
}

it.each([3123, 3076, 6609])(
  "prefers stat-backed item %i with its real fixture tooltip over Morellonomicon",
  (id) => {
    expect(selectedAntiHeal(id, items)).toEqual([id]);
  }
);

it("prefers the real Morellonomicon tooltip to a tank's Bramble Vest fallback", () => {
  expect(selectedAntiHeal(3165, items, "Ornn")).toEqual([3165]);
});

it.each([
  "Grievous Wounds",
  "GrievousWounds",
  "<status>gRiEvOuS\t WOUNDS</status>",
])("prefers a stat-backed item with tag %s and no tooltip", (tag) => {
  const catalog = items.map((item) => {
    if (item.id !== 3123) {
      return item;
    }
    const { description: _description, ...rest } = item;
    return { ...rest, tags: [tag] };
  });
  expect(selectedAntiHeal(3123, catalog)).toEqual([3123]);
});

it("recognizes the full keyword across tooltip markup and mixed whitespace", () => {
  const catalog = items.map((item) =>
    item.id === 3123
      ? {
          ...item,
          description: "<status> GRIEVOUS </status>\n<keyword>wounds</keyword>",
        }
      : item
  );
  expect(selectedAntiHeal(3123, catalog)).toEqual([3123]);
});
