import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@your-league-coach/ui/components/sonner";
import { TooltipProvider } from "@your-league-coach/ui/components/tooltip";
import { useEffect, useRef } from "react";

import { AppLayout } from "@/components/app-layout";
import { SettingsGate } from "@/components/settings-gate";
import { ThemeProvider } from "@/components/theme-provider";
import { useLanguage } from "@/i18n/use-t";
import { useChampionCatalogSync } from "@/lib/ddragon";
import { DesktopProvider, useDesktop } from "@/lib/desktop/store";
import { routeForPhase } from "@/lib/phase-route";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({ meta: [{ title: "Your League Coach" }] }),
});

/** The mocked dev server is the QA surface: it shows the app as a user gets it. */
const SHOW_DEVTOOLS = import.meta.env.DEV && !__YLC_MOCK_IPC__;
/** Keeps the router toggle clear of the query toggle in the same corner. */
const ROUTER_DEVTOOLS_TOGGLE = { style: { right: "4rem" } };

function DesktopEffects() {
  const { phase } = useDesktop();
  const language = useLanguage();
  const navigate = useNavigate();
  const target = routeForPhase(phase);
  const shownTarget = useRef(target);

  useChampionCatalogSync();

  // Follows the game: the screen changes when the phase moves to another
  // screen, never on load and never while the phase stays on the same one, so
  // a page the player opened by hand is left alone.
  useEffect(() => {
    if (shownTarget.current !== target) {
      shownTarget.current = target;
      navigate({ to: target });
    }
  }, [navigate, target]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider>
        <TooltipProvider>
          <SettingsGate>
            <DesktopProvider>
              <DesktopEffects />
              <AppLayout>
                <Outlet />
              </AppLayout>
            </DesktopProvider>
          </SettingsGate>
          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
      {SHOW_DEVTOOLS ? (
        <>
          <TanStackRouterDevtools
            position="bottom-right"
            toggleButtonProps={ROUTER_DEVTOOLS_TOGGLE}
          />
          <ReactQueryDevtools buttonPosition="bottom-right" />
        </>
      ) : null}
    </>
  );
}
