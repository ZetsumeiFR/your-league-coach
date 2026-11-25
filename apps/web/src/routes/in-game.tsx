import { createFileRoute } from "@tanstack/react-router";

import { BuildPanel } from "@/components/build/build-panel";
import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { AlwaysOnTopToggle } from "@/components/in-game/always-on-top-toggle";
import { GameBoard } from "@/components/in-game/game-board";
import { useT } from "@/i18n/use-t";
import { useDesktop } from "@/lib/desktop/store";
import { liveQueueId } from "@/lib/in-game/request";
import { isConnectionConfigured } from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";

export const Route = createFileRoute("/in-game")({
  component: InGameComponent,
});

function InGameContent() {
  const t = useT();
  // The store keeps the draft of a game through that game, and drops it with it.
  const { champSelect: draft, live, liveGame } = useDesktop();
  const isConfigured = isConnectionConfigured(useSettings());

  if (live === "waiting_for_game") {
    return (
      <IdleState
        action={<AlwaysOnTopToggle />}
        description={t("inGame.idle.description")}
        icon={appIcons.inGame}
        title={t("inGame.idle.title")}
      />
    );
  }
  if (liveGame === null) {
    return (
      <IdleState
        action={<AlwaysOnTopToggle />}
        description={t("inGame.reading.description")}
        icon={appIcons.inGame}
        title={t("inGame.reading.title")}
      />
    );
  }
  if (liveQueueId(liveGame, draft) === null) {
    return (
      <IdleState
        action={<AlwaysOnTopToggle />}
        description={t("draft.unsupported.description")}
        icon={appIcons.warning}
        title={t("draft.unsupported.title")}
      />
    );
  }
  return (
    <>
      <GameBoard draft={draft} game={liveGame} />
      {/* The build answered during champion select, shown from memory. Without a server set up the board already says so. */}
      {draft && isConfigured ? <BuildPanel draft={draft} /> : null}
    </>
  );
}

function InGameComponent() {
  const t = useT();

  return (
    <>
      <h1 className="sr-only">{t("nav.inGame")}</h1>
      <InGameContent />
    </>
  );
}
