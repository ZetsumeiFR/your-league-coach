import { Button } from "@your-league-coach/ui/components/button";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@your-league-coach/ui/components/reui/alert";
import type { ReactNode } from "react";

import { resolveLanguage, translate } from "@/i18n/translate";
import { loadSettings, useSettingsState } from "@/lib/settings-store";

import { ButtonIcon } from "./button-icon";
import { appIcons } from "./icons";
import Loader from "./loader";

function SettingsLoadError({ detail }: { detail: string }) {
  // The language setting itself could not be read, so the system language decides.
  const language = resolveLanguage("auto", null, navigator.language);

  return (
    <main className="flex h-svh items-center justify-center p-4">
      <Alert className="max-w-xl" variant="destructive">
        <appIcons.error />
        <AlertTitle>
          {translate(language, "settings.loadFailed.title")}
        </AlertTitle>
        <AlertDescription>
          <p>{translate(language, "settings.loadFailed.description")}</p>
          <p className="wrap-anywhere">{detail}</p>
        </AlertDescription>
        <AlertAction>
          <Button onClick={loadSettings} size="sm" variant="outline">
            <ButtonIcon icon={appIcons.refresh} />
            {translate(language, "settings.loadFailed.retry")}
          </Button>
        </AlertAction>
      </Alert>
    </main>
  );
}

/** Renders the app once its settings are known: they decide language and server. */
export function SettingsGate({ children }: { children: ReactNode }) {
  const state = useSettingsState();

  if (state.status === "loading") {
    return <Loader />;
  }
  if (state.status === "error") {
    return <SettingsLoadError detail={state.detail} />;
  }
  return children;
}
