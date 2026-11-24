import { createFileRoute } from "@tanstack/react-router";

import { BuildPanel } from "@/components/build/build-panel";
import { DraftBoard } from "@/components/draft/draft-board";
import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { useT } from "@/i18n/use-t";
import { useDesktop } from "@/lib/desktop/store";
import { draftMode } from "@/lib/draft/request";

export const Route = createFileRoute("/draft")({
  component: DraftComponent,
});

function DraftComponent() {
  const t = useT();
  const { champSelect, phase } = useDesktop();
  // The store keeps the snapshot through the game that follows: only during champion select is it a draft in progress.
  const draft = phase === "ChampSelect" ? champSelect : null;

  return (
    <>
      <h1 className="sr-only">{t("nav.draft")}</h1>
      {draft ? (
        <DraftBoard draft={draft} />
      ) : (
        <IdleState
          description={t("draft.idle.description")}
          icon={appIcons.draft}
          title={t("draft.idle.title")}
        />
      )}
      {/* The shell stacks these children: the build sits under the board at full width. ARAM shows its build inside the board. */}
      {draft && draftMode(draft.queueId) === "rift" ? (
        <BuildPanel draft={draft} />
      ) : null}
    </>
  );
}
