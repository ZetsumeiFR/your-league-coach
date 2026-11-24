import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import {
  championIconUrl,
  fetchVersions,
  itemIconUrl,
  parseChampions,
  parseItems,
  parseRunes,
  parseSummonerSpells,
  runeIconUrl,
  spellIconUrl,
} from "../src/ddragon";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const fixture = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(`${import.meta.dir}/fixtures/${name}`, "utf8"));

const zodPaths = (error: unknown): string[] => {
  expect(error).toBeInstanceOf(ZodError);
  return (error as ZodError).issues.map((issue) => issue.path.join("."));
};

describe("ddragon fixtures", () => {
  it("parses champions with numeric keys and localized names", async () => {
    const champions = parseChampions(await fixture("champion.fr_FR.json"));
    expect(champions.length).toBeGreaterThan(150);
    const aatrox = champions.find((champion) => champion.id === "Aatrox");
    expect(aatrox?.key).toBe(266);
    expect(aatrox?.info.attack).toBeGreaterThan(0);
  });

  it("parses items with build paths and map flags", async () => {
    const items = parseItems(await fixture("item.en_US.json"));
    const giantsBelt = items.find((item) => item.id === 1011);
    expect(giantsBelt?.goldTotal).toBe(900);
    expect(giantsBelt?.from).toEqual([1028]);
    expect(giantsBelt?.onSummonersRift).toBe(true);
    expect(giantsBelt?.onHowlingAbyss).toBe(true);
  });

  it("parses rune trees", async () => {
    const trees = parseRunes(await fixture("runesReforged.en_US.json"));
    expect(trees.length).toBe(5);
    const domination = trees.find((tree) => tree.id === 8100);
    expect(domination?.slots[0]?.runes.some((r) => r.id === 8112)).toBe(true);
  });

  it("parses summoner spells with numeric keys", async () => {
    const spells = parseSummonerSpells(await fixture("summoner.en_US.json"));
    const flash = spells.find((spell) => spell.id === "SummonerFlash");
    expect(flash?.key).toBe(4);
    expect(flash?.modes).toContain("ARAM");
  });

  it("has a versions fixture with a current version first", async () => {
    const versions = (await fixture("versions.json")) as string[];
    expect(versions[0]).toMatch(VERSION_PATTERN);
  });
});

describe("ddragon malformed input", () => {
  it("names the missing champion field in the zod error", async () => {
    const json = (await fixture("champion.fr_FR.json")) as {
      data: Record<string, { name?: string }>;
    };
    const [first] = Object.values(json.data);
    if (first) {
      first.name = undefined;
    }
    try {
      parseChampions(json);
      expect.unreachable("parseChampions should have thrown");
    } catch (error) {
      expect(zodPaths(error).some((path) => path.endsWith(".name"))).toBe(true);
    }
  });

  it("names the missing item field in the zod error", async () => {
    const json = (await fixture("item.en_US.json")) as {
      data: Record<string, { gold?: unknown }>;
    };
    const [first] = Object.values(json.data);
    if (first) {
      first.gold = undefined;
    }
    try {
      parseItems(json);
      expect.unreachable("parseItems should have thrown");
    } catch (error) {
      expect(zodPaths(error).some((path) => path.endsWith(".gold"))).toBe(true);
    }
  });
});

describe("ddragon fetch", () => {
  it("fails within the timeout instead of hanging on an unreachable host", async () => {
    const startedAt = performance.now();
    await expect(
      fetchVersions({ baseUrl: "http://10.255.255.1", timeoutMs: 300 })
    ).rejects.toThrow();
    expect(performance.now() - startedAt).toBeLessThan(3000);
  });
});

describe("ddragon image urls", () => {
  it("builds CDN urls", () => {
    expect(championIconUrl("16.23.1", "Aatrox")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/16.23.1/img/champion/Aatrox.png"
    );
    expect(itemIconUrl("16.23.1", 1011)).toBe(
      "https://ddragon.leagueoflegends.com/cdn/16.23.1/img/item/1011.png"
    );
    expect(spellIconUrl("16.23.1", "SummonerFlash")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/16.23.1/img/spell/SummonerFlash.png"
    );
    expect(runeIconUrl("perk-images/Styles/7200_Domination.png")).toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles/7200_Domination.png"
    );
  });
});
