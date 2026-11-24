import {
  type BuildAdjustment,
  parseReasonCode,
} from "@your-league-coach/lol-data/types";

import type { Translate } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";
import type { FindAsset } from "@/lib/ddragon";

import { ItemRow } from "./item-row";

/** The rule's own reason stands in for a code the app has no text for. */
export const adjustmentReason = (
  adjustment: BuildAdjustment,
  t: Translate
): string => {
  const reason = parseReasonCode(adjustment.reasonCode);
  const hasOwnText = reason !== null && !("championId" in reason);
  return t(`reasons.${hasOwnText ? reason.kind : adjustment.ruleId}`);
};

interface AdjustmentListProps {
  adjustments: BuildAdjustment[];
  findItem: FindAsset;
}

export function AdjustmentList({ adjustments, findItem }: AdjustmentListProps) {
  const t = useT();
  const nameOf = (itemId: number) =>
    findItem(itemId)?.name ?? t("build.unknown.item", { id: itemId });

  if (adjustments.length === 0) {
    return (
      <p className="px-3 text-muted-foreground text-xs">
        {t("build.items.noAdjustments")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {adjustments.map((adjustment) => (
        <li key={`${adjustment.ruleId}:${adjustment.added}`}>
          <ItemRow
            detail={
              adjustment.replaced === undefined
                ? t("build.items.added")
                : t("build.items.replaces", {
                    item: nameOf(adjustment.replaced),
                  })
            }
            item={findItem(adjustment.added)}
            name={nameOf(adjustment.added)}
            reasons={[adjustmentReason(adjustment, t)]}
          />
        </li>
      ))}
    </ul>
  );
}
