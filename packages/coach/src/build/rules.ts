import type { Item } from "@your-league-coach/lol-data/ddragon";
import type { StatsGroup } from "@your-league-coach/lol-data/queues";
import {
  BUILD_RULE_IDS,
  type BuildAdjustment,
  type BuildRecommendation,
  type BuildRuleId,
  type ItemId,
} from "@your-league-coach/lol-data/types";
import { ENEMY_BUILD_THRESHOLDS, MAX_SITUATIONAL_ITEMS } from "../constants";
import type { PatchCounts } from "../stats/blend";
import type { BuildStatRow } from "./base";
import { defensiveCore } from "./frontline";
import { buildPrior } from "./ranking";
import {
  AD_ANTI_HEAL,
  AP_ANTI_HEAL,
  bestRuleItem,
  collectItemRows,
  type ItemVsEnemyStat,
  isAntiHeal,
  isArmor,
  isMr,
  isPenetration,
  MERCURYS_TREADS,
  PLATED_STEELCAPS,
  profileRows,
  type RuleItems,
  TANK_ANTI_HEAL,
} from "./rule-items";
import { type CompositionChampion, type EnemyProfile, isTank } from "./traits";

export type { ItemVsEnemyStat } from "./rule-items";

export interface BuildRuleContext {
  /** Other allies. The local player is also ignored if included. */
  readonly allies: readonly (CompositionChampion | null | undefined)[];
  readonly buildStats: readonly BuildStatRow[];
  readonly championCounts: PatchCounts;
  readonly items: readonly Item[];
  readonly itemVsEnemyStats?: readonly ItemVsEnemyStat[];
  readonly player: CompositionChampion | null | undefined;
  readonly profile: EnemyProfile;
  readonly statsGroup: StatsGroup;
}

interface RuleContext extends BuildRuleContext {
  readonly itemData: RuleItems;
  readonly protectedIds: Set<ItemId>;
}

interface BuildRule {
  readonly apply: (
    build: BuildRecommendation,
    ctx: RuleContext
  ) => BuildRecommendation;
  readonly when: (build: BuildRecommendation, ctx: RuleContext) => boolean;
}

function adjustment(
  ruleId: BuildRuleId,
  added: ItemId,
  replaced?: ItemId
): BuildAdjustment {
  return {
    ruleId,
    reasonCode: ruleId,
    added,
    ...(replaced === undefined ? {} : { replaced }),
  };
}

function addSituational(
  build: BuildRecommendation,
  ruleId: BuildRuleId,
  added: ItemId | undefined,
  protectedIds: Set<ItemId>
): BuildRecommendation {
  if (added === undefined) {
    return build;
  }
  if (
    [
      build.boots,
      ...build.starter,
      ...build.core,
      ...build.situational,
    ].includes(added)
  ) {
    protectedIds.add(added);
    return build;
  }
  const situational = [...build.situational];
  // Base items are already ranked. Preserve items added by earlier rules.
  const index = situational.findLastIndex((id) => !protectedIds.has(id));
  const replacesSlot =
    ruleId === "anti_heal" || situational.length >= MAX_SITUATIONAL_ITEMS;
  const replaced = replacesSlot && index >= 0 ? situational[index] : undefined;
  if (replaced !== undefined) {
    situational[index] = added;
  } else if (situational.length < MAX_SITUATIONAL_ITEMS) {
    situational.push(added);
  } else {
    return build;
  }
  protectedIds.add(added);
  return {
    ...build,
    situational,
    adjustments: [...build.adjustments, adjustment(ruleId, added, replaced)],
  };
}

function swapBoots(
  build: BuildRecommendation,
  ruleId: BuildRuleId,
  added: ItemId,
  protectedIds: Set<ItemId>
): BuildRecommendation {
  if (build.boots === null) {
    return build;
  }
  if (build.boots === added) {
    protectedIds.add(added);
    return build;
  }
  if (protectedIds.has(build.boots)) {
    return build;
  }
  protectedIds.add(added);
  return {
    ...build,
    boots: added,
    situational: build.situational.filter((id) => id !== added),
    adjustments: [...build.adjustments, adjustment(ruleId, added, build.boots)],
  };
}

function resistanceRule(
  ruleId: "armor_vs_ad" | "mr_vs_ap",
  boots: ItemId,
  matches: (item: Item) => boolean
): BuildRule["apply"] {
  return (build, { itemData, protectedIds }) => {
    if (build.boots !== null && !itemData.catalog.has(boots)) {
      return build;
    }
    return addSituational(
      swapBoots(build, ruleId, boots, protectedIds),
      ruleId,
      bestRuleItem(itemData, matches),
      protectedIds
    );
  };
}

function antiHealFallback(
  player: BuildRuleContext["player"]
): readonly ItemId[] {
  if (!player) {
    return [];
  }
  if (player.tags.includes("Tank") || isTank(player)) {
    return TANK_ANTI_HEAL;
  }
  return player.info.magic > player.info.attack ? AP_ANTI_HEAL : AD_ANTI_HEAL;
}

function swapCore(
  build: BuildRecommendation,
  core: ItemId[]
): BuildRecommendation {
  const removed = build.core.filter((id) => !core.includes(id));
  const added = core.filter((id) => !build.core.includes(id));
  return {
    ...build,
    core,
    situational: build.situational.filter((id) => !core.includes(id)),
    adjustments: [
      ...build.adjustments,
      ...added.map((id, index) =>
        adjustment("frontline_missing", id, removed[index])
      ),
    ],
  };
}

const thresholds = ENEMY_BUILD_THRESHOLDS;
const RULES: Readonly<Record<BuildRuleId, BuildRule>> = {
  anti_heal: {
    when: (_, { profile }) => profile.healers >= thresholds.healers,
    apply: (build, { player, itemData, protectedIds }) =>
      addSituational(
        build,
        "anti_heal",
        bestRuleItem(itemData, isAntiHeal, antiHealFallback(player)),
        protectedIds
      ),
  },
  armor_vs_ad: {
    when: (_, { profile, player }) =>
      profile.adShare >= thresholds.damageShare &&
      !player?.tags.includes("Marksman"),
    apply: resistanceRule("armor_vs_ad", PLATED_STEELCAPS, isArmor),
  },
  mr_vs_ap: {
    when: (_, { profile }) => profile.apShare >= thresholds.damageShare,
    apply: resistanceRule("mr_vs_ap", MERCURYS_TREADS, isMr),
  },
  tenacity_vs_cc: {
    when: (_, { profile }) => profile.hardCc >= thresholds.hardCc,
    apply: (build, { itemData, protectedIds }) =>
      itemData.catalog.has(MERCURYS_TREADS)
        ? swapBoots(build, "tenacity_vs_cc", MERCURYS_TREADS, protectedIds)
        : build,
  },
  frontline_missing: {
    when: (_, { allies, player }) =>
      Boolean(
        player?.tags.some((tag) => tag === "Fighter" || tag === "Tank")
      ) &&
      !allies.some((ally) => ally && ally.id !== player?.id && isTank(ally)),
    apply: (build, { buildStats, itemData, protectedIds }) => {
      const core = defensiveCore(build, buildStats, itemData, protectedIds);
      if (!core) {
        return build;
      }
      for (const id of core) {
        protectedIds.add(id);
      }
      return swapCore(build, core);
    },
  },
  penetration_vs_tanks: {
    when: (_, { profile }) =>
      profile.tanks >= thresholds.tanks ||
      profile.resistanceItems >= thresholds.resistanceItems,
    apply: (build, { itemData, protectedIds }) =>
      addSituational(
        build,
        "penetration_vs_tanks",
        bestRuleItem(itemData, isPenetration),
        protectedIds
      ),
  },
};

/** Re-run from the base build, optionally enriching profile.resistanceItems. */
export function applyBuildRules(
  build: BuildRecommendation,
  context: BuildRuleContext
): BuildRecommendation {
  const catalog = new Map<ItemId, Item>();
  for (const item of context.items) {
    if (
      context.statsGroup === "aram" ? item.onHowlingAbyss : item.onSummonersRift
    ) {
      catalog.set(item.id, item);
    }
  }
  const ctx = {
    ...context,
    protectedIds: new Set(build.adjustments.map(({ added }) => added)),
    itemData: {
      catalog,
      itemRows: collectItemRows(context.buildStats),
      profileRows: profileRows(
        context.itemVsEnemyStats ?? [],
        context.profile.label
      ),
      prior: buildPrior(context.championCounts),
    },
  };
  return BUILD_RULE_IDS.reduce((current, id) => {
    const rule = RULES[id];
    return rule.when(current, ctx) ? rule.apply(current, ctx) : current;
  }, build);
}
