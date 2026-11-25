import { Badge } from "@your-league-coach/ui/components/reui/badge";
import { Toggle } from "@your-league-coach/ui/components/toggle";
import { cn } from "@your-league-coach/ui/lib/utils";
import { useCallback } from "react";
import { toast } from "sonner";

import { ButtonIcon } from "@/components/button-icon";
import { appIcons } from "@/components/icons";
import { useT } from "@/i18n/use-t";
import { setAlwaysOnTop, useAlwaysOnTop } from "@/lib/desktop/always-on-top";

const STATE_CELL = "col-start-1 row-start-1";

/**
 * The Toggle's own pressed look is a fill one shade off the surface behind
 * it, too faint to tell a pinned window from a free one. The state is
 * therefore also written in the button. Both words share one cell, so the
 * button keeps its width, and assistive technology reads the state from
 * `aria-pressed` alone.
 */
export function AlwaysOnTopToggle() {
  const t = useT();
  const isOnTop = useAlwaysOnTop();
  const handleChange = useCallback(
    async (pressed: boolean) => {
      try {
        await setAlwaysOnTop(pressed);
      } catch (error) {
        toast.error(t("inGame.alwaysOnTop.failed"), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [t]
  );

  return (
    <Toggle
      onPressedChange={handleChange}
      pressed={isOnTop}
      size="sm"
      variant="outline"
    >
      <ButtonIcon icon={appIcons.pin} />
      {t("inGame.alwaysOnTop.label")}
      <span aria-hidden="true" className="grid justify-items-end">
        <span className={cn(STATE_CELL, isOnTop && "invisible")}>
          <Badge variant="invert-light">{t("inGame.alwaysOnTop.off")}</Badge>
        </span>
        <span className={cn(STATE_CELL, !isOnTop && "invisible")}>
          <Badge variant="success-light">{t("inGame.alwaysOnTop.on")}</Badge>
        </span>
      </span>
    </Toggle>
  );
}
