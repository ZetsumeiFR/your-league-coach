import { skipToken, useQuery } from "@tanstack/react-query";
import type {
  BuildInput,
  BuildRecommendation,
} from "@your-league-coach/lol-data/types";
import { useCallback, useMemo } from "react";

import { DRAFT_DEBOUNCE_MS } from "@/components/draft/use-draft-suggestions";
import { useDesktop } from "@/lib/desktop/store";
import { isConnectionConfigured } from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useStickyFailure } from "@/lib/use-sticky-failure";
import {
  classifyServerError,
  orpc,
  retryUnreachableOnce,
  type ServerFailure,
} from "@/utils/orpc";

/** Longer than any champion select: its builds are still held when the screen is left and opened again during it. */
const BUILD_KEPT_FOR_MS = 30 * 60_000;
const NO_REQUEST = "";

export type BuildState =
  | { status: "idle" }
  | { status: "unconfigured" }
  | { status: "loading" }
  | {
      status: "failed";
      failure: ServerFailure;
      isRetrying: boolean;
      retry: () => void;
    }
  | { status: "empty" }
  | { status: "ready"; build: BuildRecommendation; isStale: boolean };

/** While the build for a changed draft loads, the previous one stays only if it was for the same champion. */
const sameChampionOnly =
  (championId: number | undefined) =>
  <Data>(
    previous: Data | undefined,
    previousQuery: { meta?: Record<string, unknown> } | undefined
  ): Data | undefined =>
    previousQuery?.meta?.championId === championId ? previous : undefined;

/**
 * The build for `input`, asked once the draft has stopped changing and again
 * when the teams change. An answer is kept for the whole champion select, so
 * nothing is asked once the game has started. No input, no request.
 */
export const useBuild = (input: BuildInput | null): BuildState => {
  const isConfigured = isConnectionConfigured(useSettings());
  const { champSelectSession } = useDesktop();
  const liveKey = input === null ? NO_REQUEST : JSON.stringify(input);
  const settledKey = useDebouncedValue(liveKey, DRAFT_DEBOUNCE_MS);
  const settled = useMemo(
    (): BuildInput | null =>
      settledKey === NO_REQUEST ? null : JSON.parse(settledKey),
    [settledKey]
  );
  const championId = settled?.championId;

  const query = useQuery({
    ...orpc.coach.build.queryOptions({
      input: settled ?? skipToken,
      queryKey: ["coach", "build", champSelectSession, settledKey],
    }),
    enabled: isConfigured && settled !== null,
    gcTime: BUILD_KEPT_FOR_MS,
    meta: { championId },
    placeholderData: sameChampionOnly(championId),
    retry: retryUnreachableOnce,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const reported = query.isError ? classifyServerError(query.error) : null;
  const lastFailure = useStickyFailure(
    reported,
    query.isSuccess && !query.isPlaceholderData
  );
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  if (input === null) {
    return { status: "idle" };
  }
  if (!isConfigured) {
    return { status: "unconfigured" };
  }
  const failure = reported ?? lastFailure;
  if (failure !== null) {
    return { status: "failed", failure, isRetrying: query.isFetching, retry };
  }
  if (input.championId !== championId || query.data === undefined) {
    return { status: "loading" };
  }
  if (query.data === null) {
    return { status: "empty" };
  }
  return {
    status: "ready",
    build: query.data,
    isStale: liveKey !== settledKey || query.isPlaceholderData,
  };
};
