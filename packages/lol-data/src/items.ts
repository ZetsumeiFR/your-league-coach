import type { Item } from "./ddragon";

export type ItemClass =
  | "starter"
  | "boots"
  | "legendary"
  | "component"
  | "consumable"
  | "other";

// Data Dragon depth and price signals for completed purchases.
const BOOTS_DEPTH = 2;
const LEGENDARY_DEPTH = 3;
const LEGENDARY_PRICE = 2200;

export const classifyItem = (item: Item): ItemClass => {
  if (item.tags.includes("Consumable")) {
    return "consumable";
  }
  if (item.tags.includes("Boots") && item.depth === BOOTS_DEPTH) {
    return "boots";
  }
  if (item.into.length) {
    return "component";
  }
  if (
    (item.depth ?? 0) >= LEGENDARY_DEPTH ||
    item.goldTotal >= LEGENDARY_PRICE
  ) {
    return "legendary";
  }
  if (
    item.tags.includes("Lane") ||
    item.tags.includes("Jungle") ||
    item.tags.includes("GoldPer")
  ) {
    return "starter";
  }
  return "other";
};
