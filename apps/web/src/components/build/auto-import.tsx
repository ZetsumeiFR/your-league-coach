import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  aramChampionId,
  createAutoImporter,
  sightingOf,
} from "@/lib/build/auto-import";
import { buildInput } from "@/lib/build/request";
import { useImportState } from "@/lib/desktop/import";
import { useDesktop } from "@/lib/desktop/store";
import { usePickedRole } from "@/lib/draft/picked-role";
import { useSettings } from "@/lib/settings-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import { useBuild } from "./use-build";
import { useImportBuild } from "./use-import-build";

/** An ARAM champion counts once it has stayed the same this long: rerolls and bench swaps come in bursts. */
const ARAM_SETTLE_MS = 1000;

/**
 * Imports the build by itself when the setting is on, whatever screen is
 * open: the importer says when and sends one build at a time. Renders nothing.
 */
export function AutoImport() {
  const { champSelect, champSelectSession, phase } = useDesktop();
  const { autoImport } = useSettings();
  const { isImporting } = useImportState();
  const pickedRole = usePickedRole();
  const send = useImportBuild();
  const [importer] = useState(createAutoImporter<BuildRecommendation>);
  const draft = phase === "ChampSelect" ? champSelect : null;
  const settledAramChampionId = useDebouncedValue(
    draft ? aramChampionId(draft) : 0,
    ARAM_SETTLE_MS
  );

  const dueChampionId = useSyncExternalStore(
    importer.subscribe,
    importer.dueChampionId
  );
  const state = useBuild(
    draft && dueChampionId !== 0 ? buildInput(draft, pickedRole) : null
  );
  const build = state.status === "ready" && !state.isStale ? state.build : null;

  useEffect(() => {
    importer.update({
      build,
      seen: draft
        ? sightingOf(draft, {
            autoImport,
            session: champSelectSession,
            settledAramChampionId,
          })
        : null,
      send,
    });
  }, [
    autoImport,
    build,
    champSelectSession,
    draft,
    importer,
    send,
    settledAramChampionId,
  ]);

  useEffect(() => {
    if (!isImporting) {
      importer.retry();
    }
  }, [importer, isImporting]);

  return null;
}
