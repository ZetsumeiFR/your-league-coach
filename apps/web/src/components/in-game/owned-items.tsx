import { AssetIcon } from "@/components/build/asset-icon";
import { useT } from "@/i18n/use-t";
import { stackItems, stackName } from "@/lib/build/items";
import { useItemLookup } from "@/lib/ddragon";

export function OwnedItems({ itemIds }: { itemIds: readonly number[] }) {
  const t = useT();
  const findItem = useItemLookup();
  const stacks = stackItems(itemIds);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{t("inGame.owned.title")}</h3>
      {stacks.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("inGame.noItems")}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {stacks.map((stack) => (
            <li className="flex items-center gap-2" key={stack.itemId}>
              <AssetIcon asset={findItem(stack.itemId)} />
              <span className="font-medium text-xs">
                {stackName(stack, findItem, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
