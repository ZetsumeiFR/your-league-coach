import { Link, useLocation } from "@tanstack/react-router";
import { AppShell } from "@your-league-coach/ui/components/blocks/app-shell-1/components/app-shell";
import { AppSidebar } from "@your-league-coach/ui/components/blocks/app-shell-1/components/app-sidebar";
import type { NavItem } from "@your-league-coach/ui/components/blocks/app-shell-1/components/nav-main";
import { SidebarBrand } from "@your-league-coach/ui/components/blocks/app-shell-1/components/sidebar-brand";
import {
  type ReactNode,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

import type { TranslationKey } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";

import { appIcons } from "./icons";
import { ModeToggle } from "./mode-toggle";
import { ClientStatusBadge, PatchBadge } from "./status-badges";

interface Screen {
  icon: (typeof appIcons)[keyof typeof appIcons];
  id: string;
  label: TranslationKey;
  to: string;
}

const SCREENS = [
  { icon: appIcons.home, id: "home", label: "nav.home", to: "/" },
  { icon: appIcons.draft, id: "draft", label: "nav.draft", to: "/draft" },
  { icon: appIcons.build, id: "build", label: "nav.build", to: "/build" },
  {
    icon: appIcons.inGame,
    id: "in-game",
    label: "nav.inGame",
    to: "/in-game",
  },
] as const satisfies readonly Screen[];

const SETTINGS_SCREEN = {
  icon: appIcons.settings,
  id: "settings",
  label: "nav.settings",
  to: "/settings",
} as const satisfies Screen;

/** Below this width the sidebar starts as an icon rail. */
const WIDE_WINDOW = "(min-width: 1024px)";

const subscribeToWidth = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_WINDOW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const isWideWindow = () => window.matchMedia(WIDE_WINDOW).matches;

/**
 * Open on a wide window, icon rail on a narrow one. A manual toggle applies
 * to the side of the breakpoint it was made on; the other side keeps its
 * default.
 */
const useSidebarOpen = () => {
  const isWide = useSyncExternalStore(subscribeToWidth, isWideWindow);
  const [choice, setChoice] = useState<{
    isWide: boolean;
    open: boolean;
  } | null>(null);
  const open =
    choice !== null && choice.isWide === isWide ? choice.open : isWide;
  const setOpen = useCallback(
    (next: boolean) => setChoice({ isWide, open: next }),
    [isWide]
  );
  return [open, setOpen] as const;
};

export function AppLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [open, setOpen] = useSidebarOpen();

  const toNavItem = (
    screen: (typeof SCREENS)[number] | typeof SETTINGS_SCREEN
  ): NavItem => ({
    id: screen.id,
    label: t(screen.label),
    icon: <screen.icon />,
    isActive: pathname === screen.to,
    render: <Link to={screen.to} />,
  });
  const currentScreen = [...SCREENS, SETTINGS_SCREEN].find(
    (screen) => screen.to === pathname
  );

  return (
    <AppShell
      actions={
        <>
          <ClientStatusBadge />
          <PatchBadge />
          <ModeToggle />
        </>
      }
      home={{ label: t("app.name"), render: <Link to="/" /> }}
      onOpenChange={setOpen}
      open={open}
      page={currentScreen ? t(currentScreen.label) : ""}
      sidebar={
        <AppSidebar
          brand={
            <SidebarBrand
              mark={<appIcons.brand className="size-4" />}
              name={t("app.name")}
              render={<Link to="/" />}
            />
          }
          nav={SCREENS.map(toNavItem)}
          navLabel={t("nav.group")}
          railLabels={{ collapse: t("nav.collapse"), expand: t("nav.expand") }}
          secondary={[toNavItem(SETTINGS_SCREEN)]}
        />
      }
      triggerLabel={t("nav.open")}
    >
      {children}
    </AppShell>
  );
}
