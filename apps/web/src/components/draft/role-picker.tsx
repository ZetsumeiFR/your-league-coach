import { ROLES, type Role } from "@your-league-coach/lol-data/roles";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@your-league-coach/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@your-league-coach/ui/components/tooltip";
import { useCallback } from "react";

import { useT } from "@/i18n/use-t";

import { ROLE_ICONS } from "./role-icons";

interface RolePickerProps {
  onPick: (role: Role) => void;
  role: Role | null;
}

export function RolePicker({ onPick, role }: RolePickerProps) {
  const t = useT();
  // A second click on the pressed role reports an empty group: the role stays.
  const handleChange = useCallback(
    (pressed: string[]) => {
      const next = ROLES.find((option) => option === pressed[0]);
      if (next) {
        onPick(next);
      }
    },
    [onPick]
  );

  return (
    <ToggleGroup
      aria-label={t("draft.rolePicker")}
      onValueChange={handleChange}
      size="sm"
      spacing={0}
      value={role ? [role] : []}
      variant="outline"
    >
      {ROLES.map((option) => {
        const Icon = ROLE_ICONS[option];
        const label = t(`draft.roles.${option}`);
        return (
          <Tooltip key={option}>
            <TooltipTrigger
              render={<ToggleGroupItem aria-label={label} value={option} />}
            >
              <Icon />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  const Icon = ROLE_ICONS[role];

  return (
    <Badge variant="outline">
      <Icon />
      {t(`draft.roles.${role}`)}
    </Badge>
  );
}
