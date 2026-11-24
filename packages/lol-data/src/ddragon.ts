import { z } from "zod";

export const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";
export const DEFAULT_TIMEOUT_MS = 10_000;

export const LOCALES = ["fr_FR", "en_US"] as const;
export type Locale = (typeof LOCALES)[number];

export interface DdragonOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

const versionsSchema = z.array(z.string()).min(1);

const championSchema = z.object({
  key: z.string().regex(/^\d+$/),
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  info: z.object({
    attack: z.number(),
    magic: z.number(),
    defense: z.number(),
  }),
});

const championsResponseSchema = z.object({
  data: z.record(z.string(), championSchema),
});

const itemSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  gold: z.object({ total: z.number() }),
  into: z.array(z.string()).optional(),
  from: z.array(z.string()).optional(),
  maps: z.record(z.string(), z.boolean()),
  depth: z.number().optional(),
});

const itemsResponseSchema = z.object({
  data: z.record(z.string(), itemSchema),
});

const runeSchema = z.object({
  id: z.number(),
  key: z.string(),
  name: z.string(),
  icon: z.string(),
});

const runeTreeSchema = z.object({
  id: z.number(),
  key: z.string(),
  name: z.string(),
  icon: z.string(),
  slots: z.array(z.object({ runes: z.array(runeSchema) })),
});

const runesResponseSchema = z.array(runeTreeSchema);

const spellSchema = z.object({
  key: z.string().regex(/^\d+$/),
  id: z.string(),
  name: z.string(),
  modes: z.array(z.string()),
});

const spellsResponseSchema = z.object({
  data: z.record(z.string(), spellSchema),
});

export type RuneTree = z.infer<typeof runeTreeSchema>;

export interface Champion {
  /** Data Dragon string id, used in image paths. */
  id: string;
  info: { attack: number; magic: number; defense: number };
  /** Numeric champion id, as used by the LCU and match-v5. */
  key: number;
  name: string;
  tags: string[];
}

export interface Item {
  depth: number | undefined;
  from: number[];
  goldTotal: number;
  id: number;
  into: number[];
  name: string;
  onHowlingAbyss: boolean;
  onSummonersRift: boolean;
  tags: string[];
}

export interface SummonerSpell {
  id: string;
  key: number;
  modes: string[];
  name: string;
}

export const parseChampions = (json: unknown): Champion[] =>
  Object.values(championsResponseSchema.parse(json).data).map((champion) => ({
    ...champion,
    key: Number(champion.key),
  }));

export const parseItems = (json: unknown): Item[] =>
  Object.entries(itemsResponseSchema.parse(json).data).map(([id, item]) => ({
    id: Number(id),
    name: item.name,
    tags: item.tags,
    goldTotal: item.gold.total,
    into: (item.into ?? []).map(Number),
    from: (item.from ?? []).map(Number),
    depth: item.depth,
    onSummonersRift: item.maps["11"] === true,
    onHowlingAbyss: item.maps["12"] === true,
  }));

export const parseRunes = (json: unknown): RuneTree[] =>
  runesResponseSchema.parse(json);

export const parseSummonerSpells = (json: unknown): SummonerSpell[] =>
  Object.values(spellsResponseSchema.parse(json).data).map((spell) => ({
    ...spell,
    key: Number(spell.key),
  }));

const fetchJson = async (
  path: string,
  { baseUrl = DDRAGON_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS }: DdragonOptions
): Promise<unknown> => {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(
      `Data Dragon request failed: ${path} -> HTTP ${response.status}`
    );
  }
  return response.json();
};

export const fetchVersions = async (
  options: DdragonOptions = {}
): Promise<string[]> =>
  versionsSchema.parse(await fetchJson("/api/versions.json", options));

export const fetchChampions = async (
  version: string,
  locale: Locale,
  options: DdragonOptions = {}
): Promise<Champion[]> =>
  parseChampions(
    await fetchJson(`/cdn/${version}/data/${locale}/champion.json`, options)
  );

export const fetchItems = async (
  version: string,
  locale: Locale,
  options: DdragonOptions = {}
): Promise<Item[]> =>
  parseItems(
    await fetchJson(`/cdn/${version}/data/${locale}/item.json`, options)
  );

export const fetchRunes = async (
  version: string,
  locale: Locale,
  options: DdragonOptions = {}
): Promise<RuneTree[]> =>
  parseRunes(
    await fetchJson(
      `/cdn/${version}/data/${locale}/runesReforged.json`,
      options
    )
  );

export const fetchSummonerSpells = async (
  version: string,
  locale: Locale,
  options: DdragonOptions = {}
): Promise<SummonerSpell[]> =>
  parseSummonerSpells(
    await fetchJson(`/cdn/${version}/data/${locale}/summoner.json`, options)
  );

/** `id` is the Data Dragon string id (e.g. "Aatrox"), not the numeric key. */
export const championIconUrl = (version: string, id: string): string =>
  `${DDRAGON_BASE_URL}/cdn/${version}/img/champion/${id}.png`;

export const itemIconUrl = (version: string, itemId: number): string =>
  `${DDRAGON_BASE_URL}/cdn/${version}/img/item/${itemId}.png`;

/** `id` is the Data Dragon string id (e.g. "SummonerFlash"). */
export const spellIconUrl = (version: string, id: string): string =>
  `${DDRAGON_BASE_URL}/cdn/${version}/img/spell/${id}.png`;

/** `path` is a rune `icon` value such as "perk-images/Styles/7200_Domination.png". */
export const runeIconUrl = (path: string): string =>
  `${DDRAGON_BASE_URL}/cdn/img/${path}`;
