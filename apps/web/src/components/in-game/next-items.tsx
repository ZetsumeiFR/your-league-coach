import { Link } from "@tanstack/react-router";
import {
  type NextItem,
  type NextItems as NextItemsAnswer,
  parseReasonCode,
} from "@your-league-coach/lol-data/types";
import { Skeleton } from "@your-league-coach/ui/components/skeleton";
import { useId } from "react";

import { ItemRow } from "@/components/build/item-row";
import { appIcons } from "@/components/icons";
import { PanelNotice } from "@/components/panel-notice";
import {
  SETTINGS_LINK,
  ServerFailureAlert,
} from "@/components/server-failure-alert";
import { useT } from "@/i18n/use-t";
import { useChampionLookup, useItemLookup } from "@/lib/ddragon";
import { reasonText } from "@/lib/draft/reasons";

import type { NextItemsState } from "./use-next-items";

/** One row per item of the longest answer the server gives. */
const PLACEHOLDER_ROW_IDS = ["first", "second"] as const;

function NextItemsPlaceholder({ labelledBy }: { labelledBy: string }) {
  return (
    <ul aria-busy="true" aria-labelledby={labelledBy} className="flex flex-col">
      {PLACEHOLDER_ROW_IDS.map((id) => (
        <li className="flex items-center gap-2.5 px-3 py-2.5" key={id}>
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-40" />
        </li>
      ))}
    </ul>
  );
}

interface NextItemListProps {
  busy: boolean;
  items: NextItem[];
  labelledBy: string;
}

function NextItemList({ busy, items, labelledBy }: NextItemListProps) {
  const t = useT();
  const findItem = useItemLookup();
  const findChampion = useChampionLookup();
  const championName = (championId: number) =>
    findChampion(championId)?.name ??
    t("draft.teams.unknownChampion", { id: championId });

  return (
    <ol
      aria-busy={busy}
      aria-labelledby={labelledBy}
      className="flex max-w-xl flex-col"
    >
      {items.map(({ itemId, reasons }) => {
        const item = findItem(itemId);
        return (
          <li key={itemId}>
            <ItemRow
              item={item}
              name={item?.name ?? t("build.unknown.item", { id: itemId })}
              reasons={reasons.flatMap((code) => {
                const reason = parseReasonCode(code);
                return reason ? [reasonText(reason, t, championName)] : [];
              })}
              reasonVariant="info-light"
            />
          </li>
        );
      })}
    </ol>
  );
}

interface NextItemAnswerProps {
  answer: NextItemsAnswer;
  busy: boolean;
  labelledBy: string;
}

function NextItemAnswer({ answer, busy, labelledBy }: NextItemAnswerProps) {
  const t = useT();
  const { currentGames, previousGames } = answer.sources;

  if (answer.items.length > 0) {
    return (
      <NextItemList busy={busy} items={answer.items} labelledBy={labelledBy} />
    );
  }
  if (currentGames + previousGames === 0) {
    return (
      <PanelNotice
        description={t("build.empty.description")}
        icon={appIcons.info}
        title={t("build.empty.title")}
      />
    );
  }
  return (
    <PanelNotice
      description={t("inGame.next.complete.description")}
      icon={appIcons.info}
      title={t("inGame.next.complete.title")}
    />
  );
}

interface NextItemsBodyProps {
  labelledBy: string;
  state: NextItemsState;
}

function NextItemsBody({ labelledBy, state }: NextItemsBodyProps) {
  const t = useT();

  switch (state.status) {
    case "unconfigured":
      return (
        <PanelNotice
          action={
            <Link className={SETTINGS_LINK} to="/settings">
              {t("inGame.unconfigured.action")}
            </Link>
          }
          description={t("inGame.unconfigured.description")}
          icon={appIcons.server}
          title={t("inGame.unconfigured.title")}
        />
      );
    case "loading":
      return <NextItemsPlaceholder labelledBy={labelledBy} />;
    case "failed":
      return (
        <ServerFailureAlert
          failure={state.problem.failure}
          isRetrying={state.problem.isRetrying}
          retry={state.problem.retry}
          title={t("inGame.next.error.title")}
          variant="warning"
        />
      );
    default: {
      const { answer, isForEarlierItems, problem } = state;
      return (
        <>
          {problem ? (
            <ServerFailureAlert
              failure={problem.failure}
              isRetrying={problem.isRetrying}
              note={t("inGame.next.outdated.note")}
              retry={problem.retry}
              title={t("inGame.next.outdated.title")}
              variant="warning"
            />
          ) : null}
          <NextItemAnswer
            answer={answer}
            busy={isForEarlierItems && problem === null}
            labelledBy={labelledBy}
          />
        </>
      );
    }
  }
}

interface NextItemsProps {
  isChampionKnown: boolean;
  state: NextItemsState;
}

export function NextItems({ isChampionKnown, state }: NextItemsProps) {
  const t = useT();
  const titleId = useId();

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm" id={titleId}>
        {t("inGame.next.title")}
      </h3>
      {isChampionKnown ? (
        <NextItemsBody labelledBy={titleId} state={state} />
      ) : (
        <PanelNotice
          description={t("inGame.next.unknownChampion.description")}
          icon={appIcons.info}
          title={t("inGame.next.unknownChampion.title")}
        />
      )}
    </div>
  );
}
