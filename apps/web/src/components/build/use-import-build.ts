import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { useCallback } from "react";
import { toast } from "sonner";

import type { Translate } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";
import { itemSetBlocks } from "@/lib/build/items";
import { useChampionLookup } from "@/lib/ddragon";
import {
  announcementOrder,
  importBuild,
  type PartOutcome,
} from "@/lib/desktop/import";
import { useDesktop } from "@/lib/desktop/store";

const announce = (outcome: PartOutcome, t: Translate) => {
  switch (outcome.status) {
    case "done":
      toast.success(t(`build.import.done.${outcome.part}`));
      break;
    case "no-free-page":
      toast.warning(t("build.import.noFreePage.title"));
      break;
    default:
      toast.error(t(`build.import.failed.${outcome.part}`), {
        description: outcome.detail,
      });
  }
};

/**
 * Sends a build to the League client and reports each part with its own
 * toast, what went wrong last. The rune page and the item set are named after
 * the champion; the name is for the player to read and proves nothing about
 * who created them. Resolves to null when nothing was sent because another
 * import was running.
 */
export const useImportBuild = () => {
  const t = useT();
  const findChampion = useChampionLookup();
  const { champSelectSession } = useDesktop();

  return useCallback(
    async (build: BuildRecommendation): Promise<PartOutcome[] | null> => {
      const champion =
        findChampion(build.championId)?.name ?? String(build.championId);
      const outcomes = await importBuild({
        blocks: itemSetBlocks(build, {
          starter: t("build.items.slots.starter"),
          boots: t("build.items.slots.boots"),
          core: t("build.items.slots.core"),
          situational: t("build.items.slots.situational"),
        }),
        build,
        session: champSelectSession,
        title: `YLC ${champion}`,
      });
      for (const outcome of announcementOrder(outcomes ?? [])) {
        announce(outcome, t);
      }
      return outcomes;
    },
    [champSelectSession, findChampion, t]
  );
};
