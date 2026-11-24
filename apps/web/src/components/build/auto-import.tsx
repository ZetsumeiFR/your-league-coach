import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { useEffect, useState, useSyncExternalStore } from "react";

import { createAutoImporter, sightingOf } from "@/lib/build/auto-import";
import { buildInput } from "@/lib/build/request";
import { useImportState } from "@/lib/desktop/import";
import { useDesktop } from "@/lib/desktop/store";
import { usePickedRole } from "@/lib/draft/picked-role";
import { useSettings } from "@/lib/settings-store";

import { useBuild } from "./use-build";
import { useImportBuild } from "./use-import-build";

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
        ? sightingOf(draft, { autoImport, session: champSelectSession })
        : null,
      send,
    });
  }, [autoImport, build, champSelectSession, draft, importer, send]);

  useEffect(() => {
    if (!isImporting) {
      importer.retry();
    }
  }, [importer, isImporting]);

  return null;
}
