import type {
  BlendSources,
  BuildRecommendation,
  ItemId,
} from "@your-league-coach/lol-data/types";
import { MAX_SITUATIONAL_ITEMS } from "../constants";
import type { PatchCounts } from "../stats/blend";
import {
  buildPrior,
  compareWinRate,
  hasGames,
  parseIds,
  type Ranked,
  rankByPickRate,
  rankRow,
} from "./ranking";
import { expandSkillOrder } from "./skills";

export type BuildStatKind =
  | "starter"
  | "boots"
  | "core"
  | "item"
  | "rune_page"
  | "spells"
  | "skill_order";

export interface BuildStatRow extends PatchCounts {
  readonly key: string;
  readonly kind: BuildStatKind;
}

/** Rows and champion-role totals for one already-blended patch/queue slice. */
export interface BaseBuildInput extends PatchCounts {
  readonly championId: BuildRecommendation["championId"];
  readonly patch: BuildRecommendation["patch"];
  readonly role: BuildRecommendation["role"];
  readonly rows: readonly BuildStatRow[];
  readonly sources: BlendSources;
}

const CORE_SIZE = 3;
const RUNE_PAGE_PATTERN = /^(\d+):([^|]+)\|(\d+):([^|]+)\|([^|]+)$/;

function scoreKind<T>(
  input: BaseBuildInput,
  kind: BuildStatKind,
  parse: (key: string) => T | null
): Ranked<T>[] {
  const prior = buildPrior(input);
  const ranked: Ranked<T>[] = [];
  for (const row of input.rows) {
    if (row.kind !== kind || !hasGames(row)) {
      continue;
    }
    const value = parse(row.key);
    if (value !== null) {
      ranked.push(rankRow(value, row.key, row, prior));
    }
  }
  return ranked;
}

function bestKey<T>(
  input: BaseBuildInput,
  kind: BuildStatKind,
  parse: (key: string) => T | null
): T | undefined {
  return rankByPickRate(scoreKind(input, kind, parse), input.games)[0]?.value;
}

function parseCore(key: string): ItemId[] | null {
  const ids = parseIds(key);
  return ids?.length === CORE_SIZE && new Set(ids).size === CORE_SIZE
    ? ids
    : null;
}

function parseItem(key: string): ItemId | null {
  const ids = parseIds(key);
  return ids?.length === 1 ? (ids[0] ?? null) : null;
}

function parseSpells(key: string): BuildRecommendation["spells"] | null {
  const [first, second, ...extra] = parseIds(key) ?? [];
  return first && second && first !== second && extra.length === 0
    ? [first, second]
    : null;
}

function parseRunes(key: string): BuildRecommendation["runes"] | null {
  const [
    ,
    primary = "",
    primaryPerks = "",
    sub = "",
    subPerks = "",
    shards = "",
  ] = RUNE_PAGE_PATTERN.exec(key) ?? [];
  const styles = parseIds(`${primary}-${sub}`);
  const majorIds = parseIds(primaryPerks);
  const minorIds = parseIds(subPerks);
  const shardIds = parseIds(shards);
  const [primaryStyleId, subStyleId] = styles ?? [];
  if (
    !(primaryStyleId && subStyleId) ||
    majorIds?.length !== 4 ||
    minorIds?.length !== 2 ||
    shardIds?.length !== 3
  ) {
    return null;
  }
  return {
    primaryStyleId,
    subStyleId,
    selectedPerkIds: [...majorIds, ...minorIds, ...shardIds],
  };
}

function situationalItems(
  input: BaseBuildInput,
  excluded: ReadonlySet<ItemId>
): ItemId[] {
  return scoreKind(input, "item", (key) => {
    const item = parseItem(key);
    return item !== null && !excluded.has(item) ? item : null;
  })
    .sort(compareWinRate)
    .slice(0, MAX_SITUATIONAL_ITEMS)
    .map(({ value }) => value);
}

/** Returns null when no complete set of required build statistics is available. */
export function baseBuild(input: BaseBuildInput): BuildRecommendation | null {
  if (!hasGames(input)) {
    return null;
  }
  const runes = bestKey(input, "rune_page", parseRunes);
  const spells = bestKey(input, "spells", parseSpells);
  const skillOrder = bestKey(input, "skill_order", expandSkillOrder);
  const core = bestKey(input, "core", parseCore);
  if (!(runes && spells && skillOrder && core)) {
    return null;
  }

  const boots = bestKey(input, "boots", parseItem) ?? null;
  const starter = bestKey(input, "starter", parseIds) ?? [];
  const excluded = new Set<ItemId>([...core, ...starter]);
  if (boots !== null) {
    excluded.add(boots);
  }
  return {
    championId: input.championId,
    patch: input.patch,
    role: input.role,
    sources: input.sources,
    sampleGames: Math.round(input.games),
    runes,
    spells,
    skillOrder,
    starter,
    boots,
    core,
    situational: situationalItems(input, excluded),
    adjustments: [],
  };
}
