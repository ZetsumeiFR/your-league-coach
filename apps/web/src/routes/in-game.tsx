import { createFileRoute } from "@tanstack/react-router";

import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { useT } from "@/i18n/use-t";

export const Route = createFileRoute("/in-game")({
  component: InGameComponent,
});

function InGameComponent() {
  const t = useT();

  return (
    <>
      <h1 className="sr-only">{t("nav.inGame")}</h1>
      <IdleState
        description={t("inGame.idle.description")}
        icon={appIcons.inGame}
        title={t("inGame.idle.title")}
      />
    </>
  );
}
