import { useEffect, useState } from "react";

import {
  dueAutoImport,
  isSameMemory,
  markAutoImported,
  NO_AUTO_IMPORT,
  observeDraft,
} from "@/lib/build/auto-import";
import { buildChampionId, buildInput } from "@/lib/build/request";
import { useDesktop } from "@/lib/desktop/store";
import { usePickedRole } from "@/lib/draft/picked-role";
import { draftMode } from "@/lib/draft/request";
import { useSettings } from "@/lib/settings-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import { useBuild } from "./use-build";
import { useImportBuild } from "./use-import-build";

/** An ARAM champion counts once it has stayed the same this long: rerolls and bench swaps come in bursts. */
const ARAM_SETTLE_MS = 1000;

/**
 * Imports the build by itself when the setting is on, whatever screen is
 * open: `observeDraft` says when. Renders nothing.
 */
export function AutoImport() {
  const { champSelect, champSelectSession, phase } = useDesktop();
  const { autoImport } = useSettings();
  const pickedRole = usePickedRole();
  const importBuild = useImportBuild();
  const draft = phase === "ChampSelect" ? champSelect : null;
  const mode = draft ? draftMode(draft.queueId) : "unsupported";
  const settledAramChampionId = useDebouncedValue(
    draft && mode === "aram" ? buildChampionId(draft) : 0,
    ARAM_SETTLE_MS
  );

  const [memory, setMemory] = useState(NO_AUTO_IMPORT);
  if (draft) {
    const seen = observeDraft(memory, {
      autoImport,
      championId:
        mode === "aram" ? settledAramChampionId : draft.localPick.championId,
      completed: draft.localPick.completed,
      mode,
      session: champSelectSession,
    });
    if (!isSameMemory(seen, memory)) {
      setMemory(seen);
    }
  }

  const dueChampionId = draft ? dueAutoImport(memory) : 0;
  const state = useBuild(
    draft && dueChampionId !== 0 ? buildInput(draft, pickedRole) : null
  );
  const build = state.status === "ready" && !state.isStale ? state.build : null;

  useEffect(() => {
    if (build === null || build.championId !== dueChampionId) {
      return;
    }
    setMemory(markAutoImported);
    importBuild(build);
  }, [build, dueChampionId, importBuild]);

  return null;
}
