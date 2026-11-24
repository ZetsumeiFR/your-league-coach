import type { BuildRecommendation } from "@your-league-coach/lol-data/types";

import { useT } from "@/i18n/use-t";
import { adjustmentFor, purchaseOrder } from "@/lib/build/items";
import { useItemLookup } from "@/lib/ddragon";

import { AdjustmentList, adjustmentReason } from "./adjustment-list";
import { ItemOrder } from "./item-order";
import { ItemRow } from "./item-row";

const SECTION_LABEL = "px-3 font-medium text-muted-foreground text-xs";

export function ItemBuild({ build }: { build: BuildRecommendation }) {
  const t = useT();
  const findItem = useItemLookup();

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold text-sm">{t("build.items.title")}</h3>
      <div className="flex flex-col gap-1">
        <h4 className={SECTION_LABEL}>{t("build.items.order")}</h4>
        <div className="px-3">
          <ItemOrder findItem={findItem} steps={purchaseOrder(build)} />
        </div>
      </div>
      <div className="grid @2xl:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <h4 className={SECTION_LABEL}>
            {t("build.items.slots.situational")}
          </h4>
          <ul className="flex flex-col">
            {build.situational.map((itemId) => {
              const item = findItem(itemId);
              const adjustment = adjustmentFor(build.adjustments, itemId);
              return (
                <li key={itemId}>
                  <ItemRow
                    item={item}
                    name={item?.name ?? t("build.unknown.item", { id: itemId })}
                    reason={
                      adjustment ? adjustmentReason(adjustment, t) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className={SECTION_LABEL}>{t("build.items.adjustments")}</h4>
          <AdjustmentList adjustments={build.adjustments} findItem={findItem} />
        </div>
      </div>
    </div>
  );
}
