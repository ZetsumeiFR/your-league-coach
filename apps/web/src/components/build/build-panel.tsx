import { Link } from "@tanstack/react-router";
import type {
  BuildRecommendation,
  DraftState,
} from "@your-league-coach/lol-data/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@your-league-coach/ui/components/reui/alert";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@your-league-coach/ui/components/reui/frame";
import { Skeleton } from "@your-league-coach/ui/components/skeleton";
import { type ReactNode, useId } from "react";

import { ChampionAvatar } from "@/components/champion-avatar";
import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import {
  SETTINGS_LINK,
  ServerFailureAlert,
} from "@/components/server-failure-alert";
import { formatNumber, pluralForm } from "@/i18n/format";
import { useLanguage, useT } from "@/i18n/use-t";
import { buildInput } from "@/lib/build/request";
import { useChampionLookup } from "@/lib/ddragon";
import { useImportState } from "@/lib/desktop/import";
import { useDesktop } from "@/lib/desktop/store";
import { usePickedRole } from "@/lib/draft/picked-role";

import { AutoImportSwitch, ImportButton } from "./import-button";
import { ItemBuild } from "./item-build";
import { RunePage } from "./rune-page";
import { SkillOrder } from "./skill-order";
import { Spells } from "./spells";
import { useBuild } from "./use-build";

function SampleBadge({ build }: { build: BuildRecommendation }) {
  const t = useT();
  const language = useLanguage();
  const { patch, sampleGames, sources } = build;

  if (sources.previousGames > 0) {
    const games = formatNumber(
      language,
      sources.currentGames + sources.previousGames
    );
    return (
      <Badge variant="info-light">
        {t("build.sample.blended", { patch, games })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      {t(`build.sample.games.${pluralForm(language, sampleGames)}`, {
        patch,
        count: formatNumber(language, sampleGames),
      })}
    </Badge>
  );
}

interface BuildFrameProps {
  actions?: ReactNode;
  busy: boolean;
  championId: number;
  items: ReactNode;
  roleLabel: string | null;
  runes: ReactNode;
  skills: ReactNode;
  spells: ReactNode;
}

/**
 * One Frame of separated panels. On a wide panel, the runes sit beside the
 * spells and the skills, and the items take the full width below; on a narrow
 * one the four stack. The wrappers lay the panels out, so the Frame parts stay
 * as shipped.
 */
function BuildFrame({
  actions,
  busy,
  championId,
  items,
  roleLabel,
  runes,
  skills,
  spells,
}: BuildFrameProps) {
  const t = useT();
  const titleId = useId();
  const champion = useChampionLookup()(championId);
  const name =
    champion?.name ?? t("draft.teams.unknownChampion", { id: championId });
  const subject = roleLabel ? `${name} \u00b7 ${roleLabel}` : name;

  return (
    <section aria-busy={busy} aria-labelledby={titleId}>
      <Frame>
        <FrameHeader>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <ChampionAvatar champion={champion} />
              <div className="flex min-w-0 flex-col">
                <FrameTitle>
                  <h2 id={titleId}>{t("build.title")}</h2>
                </FrameTitle>
                <FrameDescription>{subject}</FrameDescription>
              </div>
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {actions}
              </div>
            ) : null}
          </div>
        </FrameHeader>
        <div className="@container">
          <div className="grid @3xl:grid-cols-2 gap-(--frame-gap)">
            <FramePanel>{runes}</FramePanel>
            <div className="flex flex-col gap-(--frame-gap)">
              <FramePanel fit>{spells}</FramePanel>
              <FramePanel>{skills}</FramePanel>
            </div>
            <div className="@3xl:col-span-2">
              <FramePanel>{items}</FramePanel>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}

function NoFreePageAlert() {
  const t = useT();

  return (
    <Alert variant="warning">
      <appIcons.warning />
      <AlertTitle>{t("build.import.noFreePage.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("build.import.noFreePage.description")}</p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The build of the champion the local player hovers or has locked, with the
 * import controls during champion select. Renders nothing while the player
 * has no champion.
 */
export function BuildPanel({ draft }: { draft: DraftState }) {
  const t = useT();
  const { champSelectSession, lcu, phase } = useDesktop();
  const { noFreePageSession } = useImportState();
  const input = buildInput(draft, usePickedRole());
  const state = useBuild(input);

  if (input === null || state.status === "idle") {
    return null;
  }
  switch (state.status) {
    case "unconfigured":
      return (
        <IdleState
          action={
            <Link className={SETTINGS_LINK} to="/settings">
              {t("build.unconfigured.action")}
            </Link>
          }
          description={t("build.unconfigured.description")}
          icon={appIcons.server}
          title={t("build.unconfigured.title")}
        />
      );
    case "failed":
      return (
        <ServerFailureAlert
          failure={state.failure}
          isRetrying={state.isRetrying}
          retry={state.retry}
          title={t("build.error.title")}
        />
      );
    case "empty":
      return (
        <IdleState
          description={t("build.empty.description")}
          icon={appIcons.info}
          title={t("build.empty.title")}
        />
      );
    case "loading":
      return (
        <BuildFrame
          busy
          championId={input.championId}
          items={<Skeleton className="h-72 w-full" />}
          roleLabel={input.role ? t(`draft.roles.${input.role}`) : null}
          runes={<Skeleton className="h-40 w-full" />}
          skills={<Skeleton className="h-44 w-full" />}
          spells={<Skeleton className="h-14 w-full" />}
        />
      );
    default: {
      const { build } = state;
      const canImport = lcu === "connected" && phase === "ChampSelect";
      return (
        <div className="flex flex-col gap-4">
          {noFreePageSession === champSelectSession ? (
            <NoFreePageAlert />
          ) : null}
          <BuildFrame
            actions={
              <>
                <SampleBadge build={build} />
                {canImport ? (
                  <>
                    <AutoImportSwitch />
                    <ImportButton build={build} />
                  </>
                ) : null}
              </>
            }
            busy={state.isStale}
            championId={build.championId}
            items={<ItemBuild build={build} />}
            roleLabel={build.role ? t(`draft.roles.${build.role}`) : null}
            runes={<RunePage runes={build.runes} />}
            skills={<SkillOrder skillOrder={build.skillOrder} />}
            spells={<Spells spells={build.spells} />}
          />
        </div>
      );
    }
  }
}
