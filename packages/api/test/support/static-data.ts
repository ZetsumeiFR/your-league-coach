import type { Champion, Item } from "@your-league-coach/lol-data/ddragon";

import {
  ARAM_LOCAL_CHAMPION_ID,
  RANKED_PICKABLE_MIDDLE_IDS,
} from "../../../../scripts/fake-riot-client/fixtures/ids";
import type { StaticData } from "../../src/stats/static-data";

const champion = (
  key: number,
  id: string,
  tags: string[],
  [attack, magic, defense]: [number, number, number]
): Champion => ({ key, id, name: id, tags, info: { attack, magic, defense } });

const item = (id: number, tags: string[], description = ""): Item => ({
  id,
  name: `Item ${id}`,
  description,
  tags,
  goldTotal: 3000,
  into: [],
  from: [],
  depth: 3,
  onSummonersRift: true,
  onHowlingAbyss: true,
});

export const TEST_STATIC_DATA: StaticData = {
  champions: [
    ...RANKED_PICKABLE_MIDDLE_IDS.map((key) =>
      champion(key, `Mage${key}`, ["Mage"], [2, 8, 3])
    ),
    champion(1, "Annie", ["Mage"], [2, 10, 3]),
    champion(99, "Lux", ["Mage", "Support"], [2, 9, 4]),
    champion(103, "Ahri", ["Mage", "Assassin"], [3, 8, 4]),
    champion(86, "Garen", ["Fighter", "Tank"], [7, 1, 7]),
    champion(64, "LeeSin", ["Fighter", "Assassin"], [8, 3, 5]),
    champion(222, "Jinx", ["Marksman"], [9, 2, 2]),
    champion(412, "Thresh", ["Support", "Tank"], [5, 6, 6]),
    champion(122, "Darius", ["Fighter", "Tank"], [9, 1, 5]),
    champion(121, "Khazix", ["Assassin"], [9, 3, 4]),
    champion(238, "Zed", ["Assassin"], [9, 1, 2]),
    champion(51, "Caitlyn", ["Marksman"], [8, 2, 2]),
    champion(89, "Leona", ["Tank", "Support"], [4, 3, 8]),
    champion(
      ARAM_LOCAL_CHAMPION_ID,
      "Ashe",
      ["Marksman", "Support"],
      [7, 2, 3]
    ),
  ],
  items: [
    item(1055, ["Damage", "Lane"]),
    item(1056, ["SpellDamage", "Lane"]),
    item(2003, ["Consumable"]),
    item(3006, ["Boots", "AttackSpeed"]),
    item(3020, ["Boots", "MagicPenetration"]),
    item(3047, ["Boots", "Armor"]),
    item(3111, ["Boots", "SpellBlock", "Tenacity"]),
    item(3158, ["Boots", "AbilityHaste"]),
    item(6655, ["SpellDamage", "Mana"]),
    item(4645, ["SpellDamage", "MagicPenetration"]),
    item(3089, ["SpellDamage"]),
    item(3157, ["SpellDamage", "Armor"]),
    item(3165, ["SpellDamage"], "Grievous Wounds"),
    item(3102, ["SpellDamage", "SpellBlock"]),
    item(3116, ["SpellDamage", "Health"]),
    item(3135, ["SpellDamage", "MagicPenetration"]),
    item(3075, ["Armor", "Health"]),
    item(3143, ["Armor", "Health"]),
    item(3110, ["Armor", "Mana"]),
    item(4401, ["SpellBlock", "Health"]),
    item(6672, ["AttackSpeed", "Damage"]),
    item(3031, ["CriticalStrike", "Damage"]),
    item(3046, ["CriticalStrike", "AttackSpeed"]),
    item(3072, ["Damage", "LifeSteal"]),
    item(3036, ["Damage", "ArmorPenetration"]),
    item(3033, ["Damage", "ArmorPenetration"], "Grievous Wounds"),
  ],
};
