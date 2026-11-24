import type {
  BuildRecommendation,
  ItemId,
} from "@your-league-coach/lol-data/types";
import type { BuildStatRow } from "./base";
import {
  compareWinRate,
  hasGames,
  parseIds,
  rankByPickRate,
  rankRow,
} from "./ranking";
import {
  isDefensive,
  preferredProfileItem,
  type RuleItems,
} from "./rule-items";

export function defensiveCore(
  build: BuildRecommendation,
  rows: readonly BuildStatRow[],
  data: RuleItems
): ItemId[] | undefined {
  const isDefense = (id: ItemId): boolean => {
    const item = data.catalog.get(id);
    return item !== undefined && isDefensive(item);
  };
  const baseDefense = build.core.filter(isDefense).length;
  const blocked = new Set([
    ...build.starter,
    build.boots,
    ...build.adjustments.map(({ added }) => added),
  ]);
  const candidates = rows.flatMap((row) => {
    if (row.kind !== "core" || !hasGames(row)) {
      return [];
    }
    const ids = parseIds(row.key);
    if (
      ids?.length !== build.core.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => data.catalog.has(id) && !blocked.has(id)) ||
      ids.filter(isDefense).length <= baseDefense
    ) {
      return [];
    }
    return [rankRow(ids, row.key, row, data.prior)];
  });
  const preferred = preferredProfileItem(
    data,
    (id) =>
      !build.core.includes(id) &&
      isDefense(id) &&
      candidates.some(({ value }) => value.includes(id))
  );
  const ranked = rankByPickRate(candidates, build.sampleGames);
  return (
    (preferred === undefined
      ? undefined
      : candidates
          .filter(({ value }) => value.includes(preferred))
          .sort(compareWinRate)[0]?.value) ?? ranked[0]?.value
  );
}
