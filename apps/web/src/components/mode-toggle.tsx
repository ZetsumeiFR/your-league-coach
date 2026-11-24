import { Button } from "@your-league-coach/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@your-league-coach/ui/components/dropdown-menu";
import { useTheme } from "next-themes";
import { useCallback } from "react";

import { useT } from "@/i18n/use-t";

import { appIcons } from "./icons";

export function ModeToggle() {
  const t = useT();
  const { setTheme } = useTheme();
  const setLight = useCallback(() => setTheme("light"), [setTheme]);
  const setDark = useCallback(() => setTheme("dark"), [setTheme]);
  const setSystem = useCallback(() => setTheme("system"), [setTheme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon" variant="outline" />}>
        <appIcons.themeLight className="size-[1.2rem] rotate-0 scale-100 transition-none dark:-rotate-90 dark:scale-0" />
        <appIcons.themeDark className="absolute size-[1.2rem] rotate-90 scale-0 transition-none dark:rotate-0 dark:scale-100" />
        <span className="sr-only">{t("theme.toggle")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={setLight}>
            {t("theme.light")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={setDark}>
            {t("theme.dark")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={setSystem}>
            {t("theme.system")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
