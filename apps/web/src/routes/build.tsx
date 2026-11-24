import { createFileRoute } from "@tanstack/react-router";

import { BuildPanel } from "@/components/build/build-panel";
import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { useT } from "@/i18n/use-t";
import { buildChampionId } from "@/lib/build/request";
import { useDesktop } from "@/lib/desktop/store";
import { draftMode } from "@/lib/draft/request";

export const Route = createFileRoute("/build")({
  component: BuildComponent,
});

function BuildContent() {
  const t = useT();
  // The store keeps the draft through the game that follows, so the build stays readable there.
  const { champSelect: draft } = useDesktop();

  if (draft !== null && draftMode(draft.queueId) === "unsupported") {
    return (
      <IdleState
        description={t("draft.unsupported.description")}
        icon={appIcons.warning}
        title={t("draft.unsupported.title")}
      />
    );
  }
  if (draft === null || buildChampionId(draft) === 0) {
    return (
      <IdleState
        description={t("build.idle.description")}
        icon={appIcons.build}
        title={t("build.idle.title")}
      />
    );
  }
  return <BuildPanel draft={draft} />;
}

function BuildComponent() {
  const t = useT();

  return (
    <>
      <h1 className="sr-only">{t("nav.build")}</h1>
      <BuildContent />
    </>
  );
}
