import { expect, it } from "bun:test";
import {
  type BuildRecommendation,
  buildRecommendationSchema,
} from "@your-league-coach/lol-data/types";
import { baseBuild } from "../../src/build/base";
import { applyBuildRules } from "../../src/build/rules";
import { computeEnemyProfile } from "../../src/build/traits";
import { ahriStats, champion, items, row } from "./fixtures";

function replay(base: BuildRecommendation, result: BuildRecommendation) {
  const build = {
    ...base,
    core: [...base.core],
    situational: [...base.situational],
  };
  for (const change of result.adjustments) {
    const { added, replaced, ruleId } = change;
    if (ruleId === "frontline_missing") {
      expect(replaced).toBeDefined();
      const index = replaced === undefined ? -1 : build.core.indexOf(replaced);
      expect(index).not.toBe(-1);
      build.core[index] = added;
      // Promoting an item to a purchase slot removes its optional duplicate.
      build.situational = build.situational.filter((id) => id !== added);
    } else if (replaced !== undefined && replaced === build.boots) {
      build.boots = added;
      build.situational = build.situational.filter((id) => id !== added);
    } else if (replaced === undefined) {
      build.situational.push(added);
    } else {
      const index = build.situational.indexOf(replaced);
      expect(index).not.toBe(-1);
      build.situational[index] = added;
    }
  }
  return { ...build, adjustments: result.adjustments };
}

const balanced = ["Zed", "Jinx", "Karthus", "Ahri", "Brand"];

it.each([
  { scenario: "balanced", enemies: balanced },
  {
    scenario: "healers and AD",
    enemies: ["Soraka", "Aatrox", "Jinx", "Zed", "Talon"],
  },
  {
    scenario: "AP, CC, and tanks",
    enemies: ["Maokai", "Nunu", "Soraka", "Brand", "Annie"],
  },
  {
    scenario: "reviewer's reordered core",
    enemies: balanced,
    alternative: [3157, 6655, 3102],
  },
  {
    scenario: "core slot cycle and situational promotion",
    enemies: balanced,
    alternative: [4645, 6655, 3102],
    promote: true,
  },
])(
  "replays the exact recommendation for $scenario",
  ({ enemies, alternative, promote }) => {
    const player = champion(alternative ? "Mordekaiser" : "Ahri");
    const stats = alternative
      ? {
          ...ahriStats,
          championId: player.key,
          rows: [
            ...ahriStats.rows.filter(({ kind }) => kind !== "core"),
            row("core", "6655-4645-3089", 240, 139),
            row("core", alternative.join("-"), 140, 76),
            ...(promote ? [row("item", "3102", 210, 150)] : []),
          ],
        }
      : ahriStats;
    const base = buildRecommendationSchema.parse(baseBuild(stats));
    const result = applyBuildRules(base, {
      allies: [],
      buildStats: stats.rows,
      championCounts: stats,
      items,
      player,
      profile: computeEnemyProfile(enemies.map(champion)),
      statsGroup: "sr",
    });
    if (alternative) {
      expect(base.core).toEqual([6655, 4645, 3089]);
      expect(result.core).toEqual([...alternative]);
    }
    expect(replay(base, result)).toEqual(result);
  }
);
