import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
} from "@your-league-coach/ui/components/reui/stepper";

import type { Translate } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";
import { type OrderStep, stackName } from "@/lib/build/items";
import type { FindAsset } from "@/lib/ddragon";

import { AssetIcon } from "./asset-icon";

/** Nothing is bought before the game: no step is the current one. */
const NO_CURRENT_STEP = 0;

const slotLabel = (step: OrderStep, t: Translate): string =>
  step.slot === "core"
    ? t("build.items.coreStep", { rank: step.coreRank })
    : t(`build.items.slots.${step.slot}`);

interface ItemOrderProps {
  findItem: FindAsset;
  steps: OrderStep[];
}

/**
 * The purchase order as a stepper that only shows: it has no trigger, so
 * nothing in it takes focus, and it is announced as a group, not as tabs. The
 * label above each row of icons and the names below it take the same height,
 * which keeps the connectors level with the icons.
 */
export function ItemOrder({ findItem, steps }: ItemOrderProps) {
  const t = useT();

  return (
    <div className="overflow-x-auto">
      <Stepper
        aria-label={t("build.items.order")}
        aria-orientation={undefined}
        role="group"
        value={NO_CURRENT_STEP}
      >
        <StepperNav>
          {steps.map((step, index) => (
            <StepperItem key={step.id} step={index + 1}>
              <div className="flex flex-col gap-1.5">
                <span className="flex h-8 items-end font-medium text-xs">
                  {slotLabel(step, t)}
                </span>
                <span className="flex items-center gap-2">
                  <StepperIndicator>{index + 1}</StepperIndicator>
                  {step.items.map(({ itemId }) => (
                    <AssetIcon asset={findItem(itemId)} key={itemId} />
                  ))}
                </span>
                <span className="line-clamp-2 h-8 max-w-28 text-muted-foreground text-xs">
                  {step.items
                    .map((stack) => stackName(stack, findItem, t))
                    .join(", ")}
                </span>
              </div>
              {index < steps.length - 1 ? <StepperSeparator /> : null}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
    </div>
  );
}
