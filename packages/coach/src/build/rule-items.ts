import type { Item } from "@your-league-coach/lol-data/ddragon";
import type { ItemId } from "@your-league-coach/lol-data/types";
import { MIN_ITEM_PROFILE_GAMES } from "../constants";
import type { PatchCounts } from "../stats/blend";
import type { BuildStatRow } from "./base";
import { compareWinRate, hasGames, parseIds, rankRow } from "./ranking";
import type { EnemyProfileLabel } from "./traits";

export interface ItemVsEnemyStat extends PatchCounts {
  readonly enemyProfile: EnemyProfileLabel;
  readonly itemId: ItemId;
}

export const PLATED_STEELCAPS = 3047;
export const MERCURYS_TREADS = 3111;
export const AD_ANTI_HEAL = [3123, 6609] as const;
export const AP_ANTI_HEAL = [3165] as const;
export const TANK_ANTI_HEAL = [3076] as const;

const TOOLTIP_MARKUP_OR_SPACE = /<[^>]*>|\s+/gu;
// Some tooltips use only the short percentage effect, e.g. "40% Wounds".
const WOUNDS_PATTERN = /grievouswounds|\d+%wounds|blessuresgraves|hémorragie/iu;

function mentionsWounds(text: string): boolean {
  return WOUNDS_PATTERN.test(text.replace(TOOLTIP_MARKUP_OR_SPACE, ""));
}

export function isAntiHeal(item: Item): boolean {
  return (
    item.tags.some(mentionsWounds) || mentionsWounds(item.description ?? "")
  );
}

export const isArmor = (item: Item): boolean => item.tags.includes("Armor");
export const isMr = (item: Item): boolean => item.tags.includes("SpellBlock");
export const isDefensive = (item: Item): boolean => isArmor(item) || isMr(item);
export const isPenetration = (item: Item): boolean =>
  item.tags.includes("ArmorPenetration") ||
  item.tags.includes("MagicPenetration");

export interface RuleItems {
  readonly catalog: ReadonlyMap<ItemId, Item>;
  readonly itemRows: ReadonlyMap<ItemId, BuildStatRow>;
  readonly prior: number;
  readonly profileRows: readonly ItemVsEnemyStat[];
}

export function collectItemRows(
  rows: readonly BuildStatRow[]
): ReadonlyMap<ItemId, BuildStatRow> {
  const result = new Map<ItemId, BuildStatRow>();
  for (const row of rows) {
    if (row.kind === "item" && hasGames(row)) {
      const [id, ...extra] = parseIds(row.key) ?? [];
      if (id && extra.length === 0) {
        result.set(id, row);
      }
    }
  }
  return result;
}

export function preferredProfileItem(
  data: RuleItems,
  accepts: (id: ItemId) => boolean
): ItemId | undefined {
  return data.profileRows
    .filter(({ itemId }) => accepts(itemId))
    .map((row) => rankRow(row.itemId, String(row.itemId), row, data.prior))
    .sort(compareWinRate)[0]?.value;
}

export function bestRuleItem(
  data: RuleItems,
  matches: (item: Item) => boolean,
  fallback: readonly ItemId[] = []
): ItemId | undefined {
  const accepts = (id: ItemId): boolean => {
    const item = data.catalog.get(id);
    return item !== undefined && !item.tags.includes("Boots") && matches(item);
  };
  const preferred = preferredProfileItem(data, accepts);
  if (preferred !== undefined) {
    return preferred;
  }
  return (
    [...data.itemRows]
      .filter(([id]) => accepts(id))
      .map(([id, row]) => rankRow(id, row.key, row, data.prior))
      .sort(compareWinRate)[0]?.value ?? fallback.find(accepts)
  );
}

export function profileRows(
  rows: readonly ItemVsEnemyStat[],
  label: EnemyProfileLabel
): ItemVsEnemyStat[] {
  return rows.filter(
    (row) =>
      row.enemyProfile === label &&
      row.games >= MIN_ITEM_PROFILE_GAMES &&
      hasGames(row)
  );
}
