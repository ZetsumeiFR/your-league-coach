import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import { cn } from "@your-league-coach/ui/lib/utils";

import { useT } from "@/i18n/use-t";
import { runePageParts, shardName } from "@/lib/build/runes";
import { type AssetCard, type FindAsset, useRuneLookup } from "@/lib/ddragon";

const SHARD_ROWS = ["offense", "flex", "defense"] as const;

const DISC_SIZES = {
  keystone: { disc: "size-10", image: "size-9", pixels: 36 },
  rune: { disc: "size-7", image: "size-6", pixels: 24 },
  tree: { disc: "size-5", image: "size-3.5", pixels: 14 },
} as const;

interface RuneIconProps {
  rune: AssetCard | null;
  size: keyof typeof DISC_SIZES;
}

/**
 * Rune art is drawn for a dark surface, so it sits on a disc that is dark in
 * both themes. Hidden from assistive technology: the name is printed beside it.
 */
function RuneIcon({ rune, size }: RuneIconProps) {
  const { disc, image, pixels } = DISC_SIZES[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-invert",
        disc
      )}
    >
      {rune ? (
        <img
          alt=""
          className={image}
          height={pixels}
          src={rune.iconUrl}
          width={pixels}
        />
      ) : null}
    </span>
  );
}

interface RuneTreeProps {
  findRune: FindAsset;
  /** The first rune of the primary tree is its keystone. */
  hasKeystone?: boolean;
  runeIds: number[];
  treeId: number;
}

function RuneTree({
  findRune,
  hasKeystone = false,
  runeIds,
  treeId,
}: RuneTreeProps) {
  const t = useT();
  const nameOf = (id: number) =>
    findRune(id)?.name ?? t("build.unknown.rune", { id });
  const [keystoneId] = hasKeystone ? runeIds : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
        <RuneIcon rune={findRune(treeId)} size="tree" />
        {nameOf(treeId)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {runeIds.map((runeId) => {
          const isKeystone = runeId === keystoneId;
          return (
            <li className="flex items-center gap-2" key={runeId}>
              <RuneIcon
                rune={findRune(runeId)}
                size={isKeystone ? "keystone" : "rune"}
              />
              <span className={isKeystone ? "font-medium text-sm" : "text-xs"}>
                {nameOf(runeId)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RunePage({ runes }: { runes: BuildRecommendation["runes"] }) {
  const t = useT();
  const findRune = useRuneLookup();
  const { primary, secondary, shards } = runePageParts(runes.selectedPerkIds);
  const shardRows = SHARD_ROWS.flatMap((row, index) => {
    const shardId = shards[index];
    return shardId === undefined ? [] : [{ row, shardId }];
  });

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{t("build.runes.title")}</h3>
      <div className="grid grid-cols-2 gap-4">
        <RuneTree
          findRune={findRune}
          hasKeystone
          runeIds={primary}
          treeId={runes.primaryStyleId}
        />
        <RuneTree
          findRune={findRune}
          runeIds={secondary}
          treeId={runes.subStyleId}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">
          {t("build.runes.shards")}
        </span>
        {shardRows.map(({ row, shardId }) => {
          const name = shardName(shardId);
          return (
            <Badge key={row} variant="outline">
              {name
                ? t(`build.runes.shard.${name}`)
                : t("build.unknown.shard", { id: shardId })}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
