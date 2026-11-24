import { createFileRoute, Link } from "@tanstack/react-router";
import { Stats } from "@your-league-coach/ui/components/blocks/stats-8/components/stats";
import { buttonVariants } from "@your-league-coach/ui/components/button";

import { CollectorAlert } from "@/components/home/collector-alert";
import {
  useClientCard,
  usePatchCard,
  useServerCard,
} from "@/components/home/stat-cards";
import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import { LOCKFILE_INPUT_ID } from "@/components/settings/preferences";
import { useT } from "@/i18n/use-t";
import { useDesktop } from "@/lib/desktop/store";
import { useServerStatus } from "@/lib/server-status";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const LOCKFILE_LINK = buttonVariants({ size: "sm", variant: "outline" });

function HomeComponent() {
  const t = useT();
  const { lcu } = useDesktop();
  const { status } = useServerStatus();
  const cards = [useClientCard(), useServerCard(), usePatchCard()];

  return (
    <>
      <h1 className="sr-only">{t("nav.home")}</h1>
      {status.kind === "online" ? (
        <CollectorAlert
          checkedAt={status.checkedAt}
          collector={status.meta.collector}
        />
      ) : null}
      {/* The block lays its tiles out against the width of this container. */}
      <section className="@container">
        <Stats cards={cards} />
      </section>
      {lcu === "connected" ? null : (
        <IdleState
          action={
            <Link
              className={LOCKFILE_LINK}
              hash={LOCKFILE_INPUT_ID}
              to="/settings"
            >
              {t("home.empty.action")}
            </Link>
          }
          description={t("home.empty.description")}
          icon={appIcons.disconnected}
          title={t("home.empty.title")}
        />
      )}
    </>
  );
}
