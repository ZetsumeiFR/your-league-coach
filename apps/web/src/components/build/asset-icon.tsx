import { IconTile } from "@your-league-coach/ui/components/reui/icon-tile";

import type { AssetCard } from "@/lib/ddragon";

const ICON_PIXELS = { xs: 24, sm: 32 } as const;

interface AssetIconProps {
  asset: AssetCard | null;
  label?: string;
  size?: keyof typeof ICON_PIXELS;
}

/**
 * The square icon of an item or a summoner spell. Without a label it is
 * hidden from assistive technology: every place that shows it prints the name
 * beside it. With one, the label is the icon's text and its tooltip.
 */
export function AssetIcon({ asset, label, size = "sm" }: AssetIconProps) {
  const pixels = ICON_PIXELS[size];

  return (
    <IconTile aria-hidden={label === undefined} size={size} title={label}>
      {asset ? (
        <img
          alt=""
          className="size-full object-cover"
          height={pixels}
          src={asset.iconUrl}
          width={pixels}
        />
      ) : null}
      {label === undefined ? null : <span className="sr-only">{label}</span>}
    </IconTile>
  );
}
