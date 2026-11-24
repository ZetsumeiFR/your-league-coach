import { expect, it } from "bun:test";
import { computeEnemyProfile } from "../../src/build/traits";
import { champion } from "./fixtures";

it.each([
  { ids: ["Aatrox", "Soraka", "Ornn", "Leona", "Jinx"], label: "heal_heavy" },
  { ids: ["Ornn", "Leona", "Zed", "Talon", "Jinx"], label: "tank_heavy" },
  { ids: ["Zed", "Talon", "Jinx", "Sivir", "Ahri"], label: "ad_heavy" },
  { ids: ["Ahri", "Annie", "Brand", "Karthus", "Talon"], label: "ap_heavy" },
])("labels $ids as $label by precedence", ({ ids, label }) => {
  expect(computeEnemyProfile(ids.map(champion)).label).toBe(label);
});

it("ignores unresolved champions and derives traits for an unknown Data Dragon ID", () => {
  const uncatalogued = {
    id: "constructor",
    tags: ["Fighter"],
    info: { attack: 5, magic: 5, defense: 8 },
  };
  expect(computeEnemyProfile([undefined, null, uncatalogued])).toEqual({
    adShare: 0.5,
    apShare: 0.5,
    healers: 0,
    hardCc: 0,
    tanks: 1,
    label: "balanced",
    resistanceItems: 0,
  });
});
