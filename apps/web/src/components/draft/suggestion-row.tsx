import type { ParsedReasonCode } from "@your-league-coach/lol-data/types";
import { InflowRow } from "@your-league-coach/ui/components/blocks/list-3/components/inflow-row";
import { Progress } from "@your-league-coach/ui/components/progress";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@your-league-coach/ui/components/tooltip";

import { ChampionAvatar } from "@/components/champion-avatar";
import {
  formatNumber,
  formatPercent,
  formatPoints,
  pluralForm,
} from "@/i18n/format";
import { useLanguage, useT } from "@/i18n/use-t";
import type { FindChampion } from "@/lib/ddragon";
import {
  MAX_VISIBLE_REASONS,
  orderReasons,
  reasonKey,
  reasonText,
  reasonVariant,
} from "@/lib/draft/reasons";
import { scoreBarValue } from "@/lib/draft/score";

import type { Suggestion } from "./use-draft-suggestions";

const SCORE_COMPONENTS = ["strength", "matchup", "synergy", "pool"] as const;

const DETAIL_LINE = "flex w-full items-start justify-between gap-3";
const DETAIL_BUTTON = `${DETAIL_LINE} text-start outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background`;

interface SuggestionRowProps {
  findChampion: FindChampion;
  isLast: boolean;
  laneOpponentId: number | null;
  suggestion: Suggestion;
}

export function SuggestionRow({
  findChampion,
  isLast,
  laneOpponentId,
  suggestion,
}: SuggestionRowProps) {
  const t = useT();
  const language = useLanguage();
  const { components, sampleGames } = suggestion;

  const nameOf = (championId: number) =>
    findChampion(championId)?.name ??
    t("draft.teams.unknownChampion", { id: championId });
  const textOf = (reason: ParsedReasonCode) => reasonText(reason, t, nameOf);

  const reasons = orderReasons(suggestion.reasons, laneOpponentId);
  const shown = reasons.slice(0, MAX_VISIBLE_REASONS);
  const hidden = reasons.slice(MAX_VISIBLE_REASONS);

  const detail = (
    <>
      <span className="flex flex-wrap gap-1">
        {shown.map((reason) => (
          <Badge key={reasonKey(reason)} variant={reasonVariant(reason.kind)}>
            {textOf(reason)}
          </Badge>
        ))}
        {hidden.length > 0 ? (
          <Badge variant="outline">
            {t("draft.suggestions.moreReasons", { count: hidden.length })}
          </Badge>
        ) : null}
      </span>
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        <span className="sr-only">{t("draft.suggestions.score")} </span>
        {t("draft.suggestions.points", {
          points: formatPoints(language, suggestion.score),
        })}
      </span>
    </>
  );

  return (
    <InflowRow
      amount={
        <>
          <span className="sr-only">{t("draft.suggestions.winRate")} </span>
          <span className="tabular-nums">
            {formatPercent(language, suggestion.winRate)}
          </span>
        </>
      }
      logo={<ChampionAvatar champion={findChampion(suggestion.championId)} />}
      name={nameOf(suggestion.championId)}
      share={
        <span className="tabular-nums">
          {t(`draft.suggestions.games.${pluralForm(language, sampleGames)}`, {
            count: formatNumber(language, sampleGames),
          })}
        </span>
      }
      showSeparator={!isLast}
    >
      <div className="flex flex-col gap-2 ps-10 pb-3">
        {/* The score is printed, with its name, on the line below: the bar only draws it. */}
        <Progress
          aria-hidden="true"
          className="**:data-[slot=progress-track]:h-1"
          value={scoreBarValue(suggestion.score)}
        />
        {components || hidden.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={<button className={DETAIL_BUTTON} type="button" />}
            >
              {detail}
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1.5">
                {components ? (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                    {SCORE_COMPONENTS.map((component) => (
                      <div className="contents" key={component}>
                        <dt>
                          {t(`draft.suggestions.components.${component}`)}
                        </dt>
                        <dd className="text-end tabular-nums">
                          {formatPoints(language, components[component])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {hidden.length > 0 ? (
                  <p>{hidden.map(textOf).join(" \u00b7 ")}</p>
                ) : null}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className={DETAIL_LINE}>{detail}</div>
        )}
      </div>
    </InflowRow>
  );
}
