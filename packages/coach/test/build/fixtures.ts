import {
  parseChampions,
  parseItems,
} from "@your-league-coach/lol-data/ddragon";
import championData from "../../../lol-data/test/fixtures/champion.fr_FR.json";
import itemData from "../../../lol-data/test/fixtures/item.en_US.json";
import type { BaseBuildInput, BuildStatRow } from "../../src/build/base";

const champions = new Map(
  parseChampions(championData).map((entry) => [entry.id, entry])
);
export const items = parseItems(itemData);

export function champion(id: string) {
  const found = champions.get(id);
  if (!found) {
    throw new Error(`Missing champion fixture: ${id}`);
  }
  return found;
}

export const row = (
  kind: BuildStatRow["kind"],
  key: string,
  games: number,
  wins: number
): BuildStatRow => ({ kind, key, games, wins });

export const ahriStats: BaseBuildInput = {
  championId: 103,
  role: "MIDDLE",
  patch: "16.23",
  games: 1000,
  wins: 510,
  sources: { currentGames: 1000, previousGames: 0 },
  rows: [
    row(
      "rune_page",
      "8100:8112-8139-8138-8106|8200:8226-8210|5007-5008-5001",
      610,
      325
    ),
    row("spells", "4-14", 605, 325),
    row("skill_order", "QEW|Q>W>E", 745, 386),
    row("starter", "1056-2003-2003", 831, 433),
    row("boots", "3020", 631, 320),
    row("boots", "3158", 380, 185),
    row("core", "6655-4645-3089", 240, 139),
    row("core", "6655-3157-3089", 145, 77),
    row("item", "4645", 510, 292),
    row("item", "3020", 631, 357),
    row("item", "3135", 200, 114),
    row("item", "4629", 200, 109),
    row("item", "3116", 100, 53),
    row("item", "3100", 100, 51),
    row("item", "3157", 145, 73),
    row("item", "3102", 70, 34),
  ],
};
