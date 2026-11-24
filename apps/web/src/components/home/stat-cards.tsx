import { Link } from "@tanstack/react-router";
import type { StatCard } from "@your-league-coach/ui/components/blocks/stats-8/components/stats";
import {
  Button,
  buttonVariants,
} from "@your-league-coach/ui/components/button";
import type { BadgeProps } from "@your-league-coach/ui/components/reui/badge";
import { Skeleton } from "@your-league-coach/ui/components/skeleton";

import { ButtonIcon } from "@/components/button-icon";
import { appIcons } from "@/components/icons";
import { formatNumber } from "@/i18n/format";
import { useLanguage, useT } from "@/i18n/use-t";
import { isAggregationStale } from "@/lib/collector";
import type { GameflowPhase, LcuState } from "@/lib/desktop/events";
import { useDesktop } from "@/lib/desktop/store";
import { type ServerStatus, useServerStatus } from "@/lib/server-status";
import { useSettings } from "@/lib/settings-store";

type BadgeVariant = BadgeProps["variant"];

/** Stands for a value that is not known, as opposed to none or zero. */
const UNKNOWN_VALUE = "\u2014";

const CLIENT_LOOK = {
  connected: { icon: appIcons.connected, iconColor: "text-success-foreground" },
  searching: {
    icon: appIcons.disconnected,
    iconColor: "text-warning-foreground",
  },
  disconnected: { icon: appIcons.disconnected, iconColor: "text-destructive" },
} as const satisfies Record<LcuState, { icon: unknown; iconColor: string }>;

const PHASES_IN_A_GAME: ReadonlySet<GameflowPhase> = new Set([
  "ReadyCheck",
  "ChampSelect",
  "GameStart",
  "InProgress",
  "Reconnect",
]);
const PHASES_GONE_WRONG: ReadonlySet<GameflowPhase> = new Set([
  "FailedToLaunch",
  "TerminatedInError",
]);

const phaseVariant = (phase: GameflowPhase): BadgeVariant => {
  if (PHASES_IN_A_GAME.has(phase)) {
    return "info-light";
  }
  return PHASES_GONE_WRONG.has(phase) ? "destructive-light" : "outline";
};

export const useClientCard = (): StatCard => {
  const t = useT();
  const { lcu, phase } = useDesktop();
  const { lockfilePath } = useSettings();
  const look = CLIENT_LOOK[lcu];
  const isConnected = lcu === "connected";
  const lockfileDetail = t(
    lockfilePath === null
      ? "home.client.detail.auto"
      : "home.client.detail.custom"
  );

  return {
    id: "client",
    title: t("home.client.title"),
    icon: <look.icon />,
    iconColor: look.iconColor,
    value: t(`client.state.${lcu}`),
    badge:
      isConnected && phase !== null
        ? { color: phaseVariant(phase), text: t(`phase.${phase}`) }
        : undefined,
    detail: isConnected ? t("home.client.detail.connected") : lockfileDetail,
  };
};

const SERVER_LOOK = {
  unconfigured: {
    badge: "warning-light",
    iconColor: "text-warning-foreground",
  },
  online: { badge: "success-light", iconColor: "text-success-foreground" },
  unauthorized: { badge: "destructive-light", iconColor: "text-destructive" },
  unreachable: { badge: "destructive-light", iconColor: "text-destructive" },
  failed: { badge: "destructive-light", iconColor: "text-destructive" },
} as const satisfies Record<
  Exclude<ServerStatus["kind"], "pending">,
  { badge: BadgeVariant; iconColor: string }
>;

const SMALL_LINK_BUTTON = buttonVariants({ size: "xs", variant: "outline" });

function ServerNextStep({
  isChecking,
  kind,
  onRetry,
}: {
  isChecking: boolean;
  kind: "unconfigured" | "unauthorized" | "unreachable" | "failed";
  onRetry: () => void;
}) {
  const t = useT();

  if (kind === "unconfigured" || kind === "unauthorized") {
    return (
      <Link className={SMALL_LINK_BUTTON} to="/settings">
        {t(
          kind === "unconfigured"
            ? "home.server.openSettings"
            : "home.server.fixKey"
        )}
      </Link>
    );
  }
  return (
    <Button
      aria-busy={isChecking}
      disabled={isChecking}
      onClick={onRetry}
      size="xs"
      variant="outline"
    >
      <ButtonIcon
        className={isChecking ? "animate-spin" : undefined}
        icon={isChecking ? appIcons.loading : appIcons.refresh}
      />
      {t("home.server.retry")}
    </Button>
  );
}

export const useServerCard = (): StatCard => {
  const t = useT();
  const { serverUrl } = useSettings();
  const { isChecking, retry, status } = useServerStatus();
  const base = {
    id: "server",
    title: t("home.server.title"),
    icon: <appIcons.server />,
  };
  const host = URL.canParse(serverUrl) ? new URL(serverUrl).host : serverUrl;

  if (status.kind === "pending") {
    return {
      ...base,
      iconColor: "text-muted-foreground",
      value: <Skeleton className="h-9 w-28" />,
      detail: host,
    };
  }
  const look = SERVER_LOOK[status.kind];
  return {
    ...base,
    iconColor: look.iconColor,
    value: t(`home.server.value.${status.kind}`),
    badge: { color: look.badge, text: t(`home.server.badge.${status.kind}`) },
    detail:
      status.kind === "online" ? (
        host
      ) : (
        <ServerNextStep
          isChecking={isChecking}
          kind={status.kind}
          onRetry={retry}
        />
      ),
  };
};

export const usePatchCard = (): StatCard => {
  const t = useT();
  const language = useLanguage();
  const { status } = useServerStatus();
  const base = {
    id: "patch",
    title: t("home.patch.title"),
    icon: <appIcons.patch />,
  };

  if (status.kind === "pending") {
    return {
      ...base,
      iconColor: "text-muted-foreground",
      value: <Skeleton className="h-9 w-20" />,
      detail: <Skeleton className="h-4 w-40" />,
    };
  }
  if (status.kind !== "online") {
    return {
      ...base,
      iconColor: "text-muted-foreground",
      value: <span className="text-muted-foreground">{UNKNOWN_VALUE}</span>,
      detail: t("home.patch.needsServer"),
    };
  }
  const { checkedAt, meta } = status;
  if (meta.patch === null) {
    return {
      ...base,
      iconColor: "text-warning-foreground",
      value: t("home.patch.none"),
      detail: t("home.patch.waitingCollector"),
    };
  }
  const isStale = isAggregationStale(meta.collector.lastAggregateAt, checkedAt);
  return {
    ...base,
    iconColor: "text-info",
    value: <span className="tabular-nums">{meta.patch}</span>,
    badge: isStale
      ? { color: "warning-light", text: t("home.patch.stale") }
      : { color: "success-light", text: t("home.patch.fresh") },
    detail: (
      <span className="tabular-nums">
        {t("home.patch.games", {
          sr: formatNumber(language, meta.statsGroups.sr),
          aram: formatNumber(language, meta.statsGroups.aram),
        })}
      </span>
    ),
  };
};
