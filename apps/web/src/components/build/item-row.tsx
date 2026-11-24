import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@your-league-coach/ui/components/item";
import { Badge } from "@your-league-coach/ui/components/reui/badge";

import type { AssetCard } from "@/lib/ddragon";

import { AssetIcon } from "./asset-icon";

interface ItemRowProps {
  detail?: string;
  item: AssetCard | null;
  name: string;
  reason?: string;
}

export function ItemRow({ detail, item, name, reason }: ItemRowProps) {
  return (
    <Item size="sm">
      <ItemMedia>
        <AssetIcon asset={item} />
      </ItemMedia>
      {/* Wide enough to read: a chip that would squeeze the text wraps under it. */}
      <ItemContent className="min-w-40">
        <ItemTitle>{name}</ItemTitle>
        {detail ? <ItemDescription>{detail}</ItemDescription> : null}
      </ItemContent>
      {reason ? (
        <ItemActions>
          <Badge variant="warning-light">{reason}</Badge>
        </ItemActions>
      ) : null}
    </Item>
  );
}
