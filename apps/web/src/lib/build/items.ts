import type {
  BuildAdjustment,
  BuildRecommendation,
} from "@your-league-coach/lol-data/types";

import type { ItemSetBlock } from "../desktop/events";

export interface StackedItem {
  count: number;
  itemId: number;
}

export const stackItems = (itemIds: readonly number[]): StackedItem[] => {
  const counts = new Map<number, number>();
  for (const itemId of itemIds) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
};

export const ORDER_SLOTS = ["starter", "boots", "core"] as const;
export type OrderSlot = (typeof ORDER_SLOTS)[number];

export interface OrderStep {
  /** Position among the core items, from 1; 0 for the other slots. */
  coreRank: number;
  id: string;
  items: StackedItem[];
  slot: OrderSlot;
}

type OrderedItems = Pick<BuildRecommendation, "boots" | "core" | "starter">;

/** What to buy, in order: the starting items, the boots, then each core item. */
export const purchaseOrder = (build: OrderedItems): OrderStep[] => {
  const steps: OrderStep[] = [];
  if (build.starter.length > 0) {
    steps.push({
      id: "starter",
      slot: "starter",
      coreRank: 0,
      items: stackItems(build.starter),
    });
  }
  if (build.boots !== null) {
    steps.push({
      id: "boots",
      slot: "boots",
      coreRank: 0,
      items: [{ itemId: build.boots, count: 1 }],
    });
  }
  for (const [index, itemId] of build.core.entries()) {
    steps.push({
      id: `core-${itemId}`,
      slot: "core",
      coreRank: index + 1,
      items: [{ itemId, count: 1 }],
    });
  }
  return steps;
};

export const adjustmentFor = (
  adjustments: readonly BuildAdjustment[],
  itemId: number
): BuildAdjustment | null =>
  adjustments.find(({ added }) => added === itemId) ?? null;

export const ITEM_SET_BLOCKS = [
  "starter",
  "boots",
  "core",
  "situational",
] as const;
export type ItemSetBlockName = (typeof ITEM_SET_BLOCKS)[number];

type ImportedItems = OrderedItems & Pick<BuildRecommendation, "situational">;

/**
 * The build as groups of the in-game shop, titled by `titles`. A group with
 * no item is left out: the client refuses an empty one.
 */
export const itemSetBlocks = (
  build: ImportedItems,
  titles: Record<ItemSetBlockName, string>
): ItemSetBlock[] => {
  const groups: Record<ItemSetBlockName, readonly number[]> = {
    starter: build.starter,
    boots: build.boots === null ? [] : [build.boots],
    core: build.core,
    situational: build.situational,
  };
  return ITEM_SET_BLOCKS.flatMap((name) => {
    const items = stackItems(groups[name]).map(({ count, itemId }) => ({
      count,
      id: itemId,
    }));
    return items.length > 0 ? [{ type: titles[name], items }] : [];
  });
};
