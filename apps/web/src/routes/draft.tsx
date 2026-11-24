import { createFileRoute } from "@tanstack/react-router";

import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { useT } from "@/i18n/use-t";

export const Route = createFileRoute("/draft")({
  component: DraftComponent,
});

function DraftComponent() {
  const t = useT();

  return (
    <>
      <h1 className="sr-only">{t("nav.draft")}</h1>
      <IdleState
        description={t("draft.idle.description")}
        icon={appIcons.draft}
        title={t("draft.idle.title")}
      />
    </>
  );
}
