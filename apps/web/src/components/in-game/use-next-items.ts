import { hashKey, skipToken, useQuery } from "@tanstack/react-query";
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

/** One request of a board for next items. */
export interface NextItemsAsk {
  /**
   * Unique among the asks of every board, so an answer serves the ask it was
   * given for and no other: not a later return to the same items, not a board
   * shown again.
   */
  id: number;
  input: NextItemsInput | null;
}

let lastAskId = 0;

/**
 * The board's ask for `input` after its `previous` one: the same ask while
 * the request is the same, a new one at each change of the player's items or
 * the enemy's, a return to earlier items included.
 */
export const nextAsk = (
  previous: NextItemsAsk | null,
  input: NextItemsInput | null
): NextItemsAsk => {
  if (previous !== null && hashKey([previous.input]) === hashKey([input])) {
    return previous;
  }
  lastAskId += 1;
  return { input, id: lastAskId };
};

/**
 * The query of one ask. It never goes stale, so an ask is sent once: not again
 * at each tick of the game, nor when the window regains focus.
 */
export const nextItemsQuery = (
  { id, input }: NextItemsAsk,
  isConfigured: boolean
) => ({
  ...orpc.coach.nextItems.queryOptions({
    input: input ?? skipToken,
    queryKey: [
      ...orpc.coach.nextItems.queryKey({ input: input ?? skipToken }),
      id,
    ],
  }),
  enabled: isConfigured && input !== null,
  retry: retryUnreachableOnce,
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * The next items for `input`, asked once at each change of the player's items
 * or the enemy's. While the answer for changed items is asked, and when it
 * cannot be had, the last answer of this board stays, marked as being for
 * earlier items, with the failure beside it. The hook lives as long as the
 * game is on screen, so no answer outlives its game. No input, no request.
 */
export const useNextItems = (input: NextItemsInput | null): NextItemsState => {
  const isConfigured = isConnectionConfigured(useSettings());
  const [lastAsk, setLastAsk] = useState(() => nextAsk(null, input));
  const ask = nextAsk(lastAsk, input);
  if (ask !== lastAsk) {
    setLastAsk(ask);
  }
  const query = useQuery(nextItemsQuery(ask, isConfigured));
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
