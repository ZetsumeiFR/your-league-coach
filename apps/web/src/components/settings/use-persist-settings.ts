import { useCallback } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/use-t";
import type { Settings } from "@/lib/settings";
import { saveSettings } from "@/lib/settings-store";

/** Saves settings and tells the user when the write failed; resolves to whether it worked. */
export const usePersistSettings = () => {
  const t = useT();

  return useCallback(
    async (changes: Partial<Settings>): Promise<boolean> => {
      try {
        await saveSettings(changes);
        return true;
      } catch (error) {
        toast.error(t("settings.saveFailed"), { description: String(error) });
        return false;
      }
    },
    [t]
  );
};
