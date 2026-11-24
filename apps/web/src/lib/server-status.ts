import { useQuery } from "@tanstack/react-query";
import type { CoachMeta } from "@your-league-coach/lol-data/types";
import { useCallback } from "react";

import {
  classifyServerError,
  orpc,
  retryUnreachableOnce,
  type ServerFailure,
} from "@/utils/orpc";

import { isConnectionConfigured } from "./settings";
import { useSettings } from "./settings-store";

const META_FRESH_FOR_MS = 60_000;
/** Also how soon a patch rollover on the server reaches the app. */
const META_REFRESH_EVERY_MS = 5 * 60_000;

export type ServerStatus =
  | { kind: "unconfigured" }
  | { kind: "pending" }
  | { kind: ServerFailure }
  | { kind: "online"; meta: CoachMeta; checkedAt: Date };

/**
 * What is known about the coach server, from `coach.meta`. A failed read wins
 * over an earlier answer: the last good data is not shown as current.
 */
export const useServerStatus = () => {
  const isConfigured = isConnectionConfigured(useSettings());
  const query = useQuery(
    orpc.coach.meta.queryOptions({
      enabled: isConfigured,
      staleTime: META_FRESH_FOR_MS,
      refetchInterval: META_REFRESH_EVERY_MS,
      retry: retryUnreachableOnce,
    })
  );

  let status: ServerStatus = { kind: "pending" };
  if (!isConfigured) {
    status = { kind: "unconfigured" };
  } else if (query.isError) {
    status = { kind: classifyServerError(query.error) };
  } else if (query.data) {
    status = {
      kind: "online",
      meta: query.data,
      checkedAt: new Date(query.dataUpdatedAt),
    };
  }
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  return { status, isChecking: query.isFetching, retry };
};
