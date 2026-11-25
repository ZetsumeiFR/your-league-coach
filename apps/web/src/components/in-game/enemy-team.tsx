import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@your-league-coach/ui/components/item";
import { useId } from "react";

import { AssetIcon } from "@/components/build/asset-icon";
import { ChampionAvatar } from "@/components/champion-avatar";
import { useT } from "@/i18n/use-t";
import { stackItems, stackName } from "@/lib/build/items";
import { useChampionLookup, useItemLookup } from "@/lib/ddragon";
import type { LiveTeamPlayer } from "@/lib/desktop/events";

function EnemyItems({ itemIds }: { itemIds: readonly number[] }) {
  const t = useT();
  const findItem = useItemLookup();
  const stacks = stackItems(itemIds);

  if (stacks.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("inGame.noItems")}
      </span>
    );
  }
  return (
    <ul
      aria-label={t("build.items.title")}
      className="flex flex-wrap items-center gap-1"
    >
      {stacks.map((stack) => (
        <li className="flex" key={stack.itemId}>
          <AssetIcon
            asset={findItem(stack.itemId)}
            label={stackName(stack, findItem, t)}
            size="xs"
          />
        </li>
      ))}
    </ul>
  );
}

export function EnemyTeam({ enemies }: { enemies: readonly LiveTeamPlayer[] }) {
  const t = useT();
  const titleId = useId();
  const findChampion = useChampionLookup();
  // An enemy has no id of its own: its seat on the scoreboard tells it apart.
  const seats = enemies.map((enemy, seat) => ({ ...enemy, seat }));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm" id={titleId}>
        {t("draft.teams.enemies")}
      </h3>
      {seats.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("inGame.enemies.none")}
        </p>
      ) : (
        <ul aria-labelledby={titleId} className="flex flex-col">
          {seats.map(({ championId, items, seat }) => {
            const champion = findChampion(championId);
            return (
              <li key={seat}>
                <Item size="xs">
                  <ItemMedia>
                    <ChampionAvatar champion={champion} />
                  </ItemMedia>
                  <ItemContent>
                    {/* One column of names, so every enemy's items start on the same line, as on the scoreboard. */}
                    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-2">
                      <ItemTitle>
                        {champion?.name ??
                          t("draft.teams.unknownChampion", { id: championId })}
                      </ItemTitle>
                      <EnemyItems itemIds={items} />
                    </div>
                  </ItemContent>
                </Item>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
