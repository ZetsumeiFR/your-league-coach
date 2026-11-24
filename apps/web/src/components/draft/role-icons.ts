import type { Role } from "@your-league-coach/lol-data/roles";

import { appIcons } from "@/components/icons";

export const ROLE_ICONS = {
  TOP: appIcons.roleTop,
  JUNGLE: appIcons.roleJungle,
  MIDDLE: appIcons.roleMid,
  BOTTOM: appIcons.roleBottom,
  UTILITY: appIcons.roleSupport,
} as const satisfies Record<Role, (typeof appIcons)[keyof typeof appIcons]>;
