import { createFileRoute } from "@tanstack/react-router";

import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { useT } from "@/i18n/use-t";

export const Route = createFileRoute("/build")({
  component: BuildComponent,
});

function BuildComponent() {
  const t = useT();

  return (
    <>
      <h1 className="sr-only">{t("nav.build")}</h1>
      <IdleState
        description={t("build.idle.description")}
        icon={appIcons.build}
        title={t("build.idle.title")}
      />
    </>
  );
}
