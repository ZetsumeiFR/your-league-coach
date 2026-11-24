import {
  Badge,
  type BadgeProps,
} from "@your-league-coach/ui/components/reui/badge";

import { useT } from "@/i18n/use-t";
import type { LcuState } from "@/lib/desktop/events";
import { useDesktop } from "@/lib/desktop/store";
import { useServerStatus } from "@/lib/server-status";

const CLIENT_VARIANTS = {
  connected: "success-light",
  searching: "warning-light",
  disconnected: "destructive-light",
} as const satisfies Record<LcuState, BadgeProps["variant"]>;

export function ClientStatusBadge() {
  const t = useT();
  const { lcu } = useDesktop();

  return (
    <Badge role="status" variant={CLIENT_VARIANTS[lcu]}>
      <span aria-hidden="true" className="size-1.5 bg-current" />
      {t(`client.badge.${lcu}`)}
    </Badge>
  );
}

export function PatchBadge() {
  const t = useT();
  const { status } = useServerStatus();
  const patch = status.kind === "online" ? status.meta.patch : null;

  if (patch === null) {
    return null;
  }
  return (
    <Badge className="hidden sm:inline-flex" variant="outline">
      {t("patch.badge", { patch })}
    </Badge>
  );
}
