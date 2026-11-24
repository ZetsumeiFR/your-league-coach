import { skipToken, useQuery } from "@tanstack/react-query";
import type {
  NextItems,
  NextItemsInput,
} from "@your-league-coach/lol-data/types";
import { useCallback, useState } from "react";

import { isConnectionConfigured } from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";
import { useStickyFailure } from "@/lib/use-sticky-failure";
import {
  classifyServerError,
  orpc,
  retryUnreachableOnce,
  type ServerFailure,
} from "@/utils/orpc";

export interface RefreshProblem {
  failure: ServerFailure;
  isRetrying: boolean;
  retry: () => void;
}

export type NextItemsState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "failed"; problem: RefreshProblem }
  | {
      status: "ready";
      answer: NextItems;
      isForEarlierItems: boolean;
      problem: RefreshProblem | null;
    };

/**
 * The next items for `input`. The same items give the same request and an
 * answer never goes stale, so nothing is asked again until the player's items
 * or the enemy's change: not at each tick of the game, not when the window
 * regains focus. While the answer for changed items is asked, and when it
 * cannot be had, the last answer of this game stays, marked as being for
 * earlier items. The hook lives as long as the game is on screen, so no
 * answer outlives its game. No input, no request.
 */
export const useNextItems = (input: NextItemsInput | null): NextItemsState => {
  const isConfigured = isConnectionConfigured(useSettings());
  const query = useQuery({
    ...orpc.coach.nextItems.queryOptions({ input: input ?? skipToken }),
    enabled: isConfigured && input !== null,
    retry: retryUnreachableOnce,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [lastAnswer, setLastAnswer] = useState<NextItems | null>(null);
  if (query.data !== undefined && query.data !== lastAnswer) {
    setLastAnswer(query.data);
  }

  const reported = query.isError ? classifyServerError(query.error) : null;
  const lastFailure = useStickyFailure(reported, query.isSuccess);
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  if (!isConfigured) {
    return { status: "unconfigured" };
  }
  const failure = reported ?? lastFailure;
  const problem =
    failure === null ? null : { failure, isRetrying: query.isFetching, retry };
  const answer = query.data ?? lastAnswer;
  if (answer === null) {
    return problem === null
      ? { status: "loading" }
      : { status: "failed", problem };
  }
  return {
    status: "ready",
    answer,
    isForEarlierItems: query.data === undefined,
    problem,
  };
};
