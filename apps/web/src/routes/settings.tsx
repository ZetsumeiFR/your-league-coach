import { createFileRoute } from "@tanstack/react-router";

import { LegalNotice } from "@/components/legal-notice";
import { ConnectionForm } from "@/components/settings/connection-form";
import { Preferences } from "@/components/settings/preferences";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

/** The page heading is the visible h1 of the preferences block. */
function SettingsComponent() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <ConnectionForm />
      <Preferences />
      <LegalNotice />
    </div>
  );
}
