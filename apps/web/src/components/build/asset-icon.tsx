import { IconTile } from "@your-league-coach/ui/components/reui/icon-tile";

import type { AssetCard } from "@/lib/ddragon";

const ICON_PIXELS = 32;

/**
 * The square icon of an item or a summoner spell. Hidden from assistive
 * technology: every place that shows it prints the name beside it.
 */
export function AssetIcon({ asset }: { asset: AssetCard | null }) {
  return (
    <IconTile aria-hidden="true" size="sm">
      {asset ? (
        <img
          alt=""
          className="size-full object-cover"
          height={ICON_PIXELS}
          src={asset.iconUrl}
          width={ICON_PIXELS}
        />
      ) : null}
    </IconTile>
  );
}
