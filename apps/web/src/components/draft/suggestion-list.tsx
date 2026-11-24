import { Link } from "@tanstack/react-router";
import type { Role } from "@your-league-coach/lol-data/roles";
import { CapitalInflowTabs } from "@your-league-coach/ui/components/blocks/list-3/components/capital-inflow-tabs";
import {
  Button,
  buttonVariants,
} from "@your-league-coach/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@your-league-coach/ui/components/empty";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@your-league-coach/ui/components/reui/alert";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import { Separator } from "@your-league-coach/ui/components/separator";
import { Skeleton } from "@your-league-coach/ui/components/skeleton";
import { cn } from "@your-league-coach/ui/lib/utils";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { ButtonIcon } from "@/components/button-icon";
import { appIcons } from "@/components/icons";
import { formatNumber } from "@/i18n/format";
import type { TranslationKey } from "@/i18n/translate";
import { useLanguage, useT } from "@/i18n/use-t";
import type { FindChampion } from "@/lib/ddragon";
import type { SuggestionKind } from "@/lib/draft/request";
import { FULL_SCORE_POINTS } from "@/lib/draft/score";
import type { ServerFailure } from "@/utils/orpc";

import { RoleBadge, RolePicker } from "./role-picker";
import { SuggestionRow } from "./suggestion-row";
import type {
  DraftSuggestions,
  SuggestionsResult,
} from "./use-draft-suggestions";

const KIND_TEXTS = {
  ban: { info: "draft.suggestions.info.bans", title: "draft.suggestions.bans" },
  pick: {
    info: "draft.suggestions.info.picks",
    title: "draft.suggestions.picks",
  },
} as const satisfies Record<
  SuggestionKind,
  { info: TranslationKey; title: TranslationKey }
>;

/** Rows the placeholder holds while a list loads: the most the server returns. */
const PLACEHOLDER_ROWS = { ban: 5, pick: 10 } as const;
const PLACEHOLDER_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** Merged, so the variant's border wins over the transparent one of the base classes. */
const SETTINGS_LINK = cn(buttonVariants({ size: "sm", variant: "outline" }));

type PanelList = ComponentProps<typeof CapitalInflowTabs>["list"];

interface PanelNoticeProps {
  action?: ReactNode;
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}

function PanelNotice({
  action,
  description,
  icon: Icon,
  title,
}: PanelNoticeProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

function SuggestionPlaceholder({ kind }: { kind: SuggestionKind }) {
  const ids = PLACEHOLDER_IDS.slice(0, PLACEHOLDER_ROWS[kind]);

  // The app's reduced-motion rule shortens every animation to 1 ms: a pulse left running would flicker.
  return ids.map((id, index) => (
    <li className="motion-reduce:**:data-[slot=skeleton]:animate-none" key={id}>
      <div className="flex min-h-12 items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ms-auto h-4 w-24" />
      </div>
      <div className="flex flex-col gap-2 ps-10 pb-3">
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      {index < ids.length - 1 ? <Separator /> : null}
    </li>
  ));
}

interface SuggestionFailureProps {
  failure: ServerFailure;
  isRetrying: boolean;
  retry: () => void;
}

function SuggestionFailure({
  failure,
  isRetrying,
  retry,
}: SuggestionFailureProps) {
  const t = useT();

  return (
    <Alert variant="destructive">
      <appIcons.error />
      <AlertTitle>{t("draft.suggestions.error.title")}</AlertTitle>
      {/* The muted gray of the description falls under 4.5:1 on the tinted surface of this variant. */}
      <AlertDescription className="text-foreground/80">
        <p>{t(`draft.suggestions.error.${failure}`)}</p>
      </AlertDescription>
      <AlertAction>
        {failure === "unauthorized" ? (
          <Link className={SETTINGS_LINK} to="/settings">
            {t("draft.suggestions.error.openSettings")}
          </Link>
        ) : (
          <Button
            aria-busy={isRetrying}
            disabled={isRetrying}
            onClick={retry}
            size="sm"
            variant="outline"
          >
            <ButtonIcon
              className={isRetrying ? "animate-spin" : undefined}
              icon={isRetrying ? appIcons.loading : appIcons.refresh}
            />
            {t("draft.suggestions.error.retry")}
          </Button>
        )}
      </AlertAction>
    </Alert>
  );
}

function BlendNote({ result }: { result: SuggestionsResult }) {
  const t = useT();
  const language = useLanguage();
  const { patch, previousPatch, sources } = result;

  if (sources.previousGames === 0) {
    return null;
  }
  const games = formatNumber(
    language,
    sources.currentGames + sources.previousGames
  );
  return (
    <div className="pb-2">
      <Badge variant="info-light">
        {previousPatch
          ? t("draft.suggestions.blended", {
              patch,
              previous: previousPatch,
              games,
            })
          : t("draft.suggestions.blendedUnnamed", { patch, games })}
      </Badge>
    </div>
  );
}

interface SuggestionListProps {
  assignedRole: Role | null;
  findChampion: FindChampion;
  laneOpponentId: number | null;
  onPickRole: (role: Role) => void;
  role: Role | null;
  suggestions: DraftSuggestions;
}

export function SuggestionList({
  assignedRole,
  findChampion,
  laneOpponentId,
  onPickRole,
  role,
  suggestions,
}: SuggestionListProps) {
  const t = useT();
  const language = useLanguage();
  const { kind, state } = suggestions;
  const title = t(KIND_TEXTS[kind].title);

  const panel = (content: { body?: ReactNode; list?: PanelList }) => (
    <CapitalInflowTabs
      actions={
        assignedRole ? (
          <RoleBadge role={assignedRole} />
        ) : (
          <RolePicker onPick={onPickRole} role={role} />
        )
      }
      info={{
        icon: appIcons.info,
        label: t("draft.suggestions.info.label"),
        text: t(KIND_TEXTS[kind].info, {
          full: formatNumber(language, FULL_SCORE_POINTS),
        }),
      }}
      list={content.list}
      title={title}
    >
      {content.body}
    </CapitalInflowTabs>
  );

  switch (state.status) {
    case "unconfigured":
      return panel({
        body: (
          <PanelNotice
            action={
              <Link className={SETTINGS_LINK} to="/settings">
                {t("draft.suggestions.unconfigured.action")}
              </Link>
            }
            description={t("draft.suggestions.unconfigured.description")}
            icon={appIcons.server}
            title={t("draft.suggestions.unconfigured.title")}
          />
        ),
      });
    case "needs-role":
      return panel({
        body: (
          <PanelNotice
            description={t("draft.suggestions.needRole.description")}
            icon={appIcons.draft}
            title={t("draft.suggestions.needRole.title")}
          />
        ),
      });
    case "failed":
      return panel({
        body: (
          <SuggestionFailure
            failure={state.failure}
            isRetrying={state.isRetrying}
            retry={state.retry}
          />
        ),
      });
    case "loading":
      return panel({
        list: {
          busy: true,
          label: title,
          rows: <SuggestionPlaceholder kind={kind} />,
        },
      });
    default: {
      const rows = state.result.suggestions;
      if (rows.length === 0) {
        return panel({
          body: (
            <PanelNotice
              description={t("draft.suggestions.empty.description")}
              icon={appIcons.info}
              title={t("draft.suggestions.empty.title")}
            />
          ),
        });
      }
      return panel({
        body: <BlendNote result={state.result} />,
        list: {
          busy: state.isStale,
          label: title,
          rows: rows.map((suggestion, index) => (
            <SuggestionRow
              findChampion={findChampion}
              isLast={index === rows.length - 1}
              key={suggestion.championId}
              laneOpponentId={laneOpponentId}
              suggestion={suggestion}
            />
          )),
        },
      });
    }
  }
}
