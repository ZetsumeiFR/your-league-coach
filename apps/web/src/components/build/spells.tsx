import type { BuildRecommendation } from "@your-league-coach/lol-data/types";

import { useT } from "@/i18n/use-t";
import { useSpellLookup } from "@/lib/ddragon";

import { AssetIcon } from "./asset-icon";

export function Spells({ spells }: { spells: BuildRecommendation["spells"] }) {
  const t = useT();
  const findSpell = useSpellLookup();

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{t("build.spells.title")}</h3>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {spells.map((spellId) => {
          const spell = findSpell(spellId);
          return (
            <li className="flex items-center gap-2" key={spellId}>
              <AssetIcon asset={spell} />
              <span className="font-medium text-xs">
                {spell?.name ?? t("build.unknown.spell", { id: spellId })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
