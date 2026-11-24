import { expect, test } from "bun:test";
import type { Item } from "../src/ddragon";
import { classifyItem } from "../src/items";

const base: Item = {
  id: 1,
  name: "Test item",
  goldTotal: 400,
  tags: [],
  into: [],
  from: [],
  depth: undefined,
  onSummonersRift: true,
  onHowlingAbyss: true,
};

test.each([
  [{ tags: ["Lane"] }, "starter"],
  [{ tags: ["Jungle", "Consumable"] }, "consumable"],
  [{ tags: ["Boots"], depth: 2, into: [2] }, "boots"],
  [{ tags: ["Boots"], depth: 1, into: [2] }, "component"],
  [{ depth: 3, into: [2], goldTotal: 3000 }, "component"],
  [{ depth: 3 }, "legendary"],
  [{ goldTotal: 2200 }, "legendary"],
  [{ goldTotal: 2199 }, "other"],
] as const)("classifies %j as %s", (overrides, expected) => {
  expect(
    classifyItem({
      ...base,
      ...overrides,
      tags: [...("tags" in overrides ? overrides.tags : [])],
      into: [...("into" in overrides ? overrides.into : [])],
    })
  ).toBe(expected);
});
