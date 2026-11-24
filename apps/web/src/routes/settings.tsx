import { createFileRoute } from "@tanstack/react-router";

import { LegalNotice } from "@/components/legal-notice";
import { ConnectionForm } from "@/components/settings/connection-form";
import { Preferences } from "@/components/settings/preferences";
import { useT } from "@/i18n/use-t";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

function SettingsComponent() {
  const t = useT();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <h1 className="sr-only">{t("nav.settings")}</h1>
      <ConnectionForm />
      <Preferences />
      <LegalNotice />
    </div>
  );
}
