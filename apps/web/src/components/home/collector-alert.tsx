import type { CoachMeta } from "@your-league-coach/lol-data/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@your-league-coach/ui/components/reui/alert";

import { appIcons } from "@/components/icons";
import { formatTimeAgo } from "@/i18n/format";
import { useLanguage, useT } from "@/i18n/use-t";
import { isAggregationStale } from "@/lib/collector";

interface CollectorAlertProps {
  checkedAt: Date;
  collector: CoachMeta["collector"];
}

/**
 * Warns the maintainer when the statistics are old or the collector reported
 * an error. The error text comes from the server and is shown as plain text.
 */
export function CollectorAlert({ checkedAt, collector }: CollectorAlertProps) {
  const t = useT();
  const language = useLanguage();
  const { lastAggregateAt, lastError, lastErrorAt } = collector;
  const isStale = isAggregationStale(lastAggregateAt, checkedAt);

  if (!(isStale || lastError)) {
    return null;
  }
  const staleText = lastAggregateAt
    ? t("home.collector.stale", {
        when: formatTimeAgo(language, lastAggregateAt, checkedAt),
      })
    : t("home.collector.never");
  const errorLabel = lastErrorAt
    ? t("home.collector.error", {
        when: formatTimeAgo(language, lastErrorAt, checkedAt),
      })
    : t("home.collector.errorUndated");

  return (
    <Alert role="status" variant="warning">
      <appIcons.warning />
      <AlertTitle>{t("home.collector.title")}</AlertTitle>
      <AlertDescription>
        {isStale ? <p>{staleText}</p> : null}
        {lastError ? (
          <p className="wrap-anywhere">
            {errorLabel} {lastError}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
