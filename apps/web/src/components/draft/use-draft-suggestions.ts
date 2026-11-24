import { useQuery } from "@tanstack/react-query";
import type { Role } from "@your-league-coach/lol-data/roles";
import type {
  BanSuggestion,
  BlendSources,
  DraftState,
  EnemyRole,
  PickSuggestion,
  PlayerPoolEntry,
} from "@your-league-coach/lol-data/types";
import { useCallback, useMemo, useState } from "react";

import { desktop } from "@/lib/desktop/events";
import {
  assignedRole,
  parseSuggestionRequest,
  playerPool,
  type SuggestionKind,
  suggestionKind,
  suggestionRequestKey,
} from "@/lib/draft/request";
import { isConnectionConfigured } from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  classifyServerError,
  orpc,
  retryUnreachableOnce,
  type ServerFailure,
} from "@/utils/orpc";

/** A burst of client events (hover, lock, timer) settles into one request. */
const DRAFT_DEBOUNCE_MS = 300;
/** Same draft, same answer until the server aggregates again: no refetch each time the window regains focus. */
const SUGGESTIONS_FRESH_FOR_MS = 5 * 60_000;

const NO_POOL: PlayerPoolEntry[] = [];
const NO_ENEMY_ROLES: EnemyRole[] = [];

export type Suggestion = BanSuggestion &
  Partial<Pick<PickSuggestion, "components">>;

export interface SuggestionsResult {
  patch: string;
  previousPatch?: string | null;
  sources: BlendSources;
  suggestions: Suggestion[];
}

export type SuggestionsState =
  | { status: "unconfigured" }
  | { status: "needs-role" }
  | { status: "loading" }
  | {
      status: "failed";
      failure: ServerFailure;
      isRetrying: boolean;
      retry: () => void;
    }
  | { status: "ready"; isStale: boolean; result: SuggestionsResult };

export interface DraftSuggestions {
  /** Roles the server last assumed for the revealed enemies; empty until it has answered a pick request, and when it reports none. */
  enemyRoles: readonly EnemyRole[];
  kind: SuggestionKind;
  state: SuggestionsState;
}

/**
 * Mastery and recent games, read once per visit of the draft screen: kept as
 * long as the screen shows a draft, read again for the next one. A failed
 * read leaves the pool empty instead of holding the suggestions back.
 */
const usePlayerPool = () => {
  const query = useQuery({
    queryKey: ["desktop", "player-pool"],
    queryFn: async () => {
      const [mastery, recent] = await Promise.all([
        desktop.championMastery(),
        desktop.recentGames(),
      ]);
      return playerPool(mastery, recent);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
  return { entries: query.data ?? NO_POOL, isSettled: !query.isPending };
};

/** While a newer draft loads, its list keeps the previous answer only if that one was for the same role. */
const sameRoleOnly =
  (role: Role | null) =>
  <Data>(
    previous: Data | undefined,
    previousQuery: { meta?: Record<string, unknown> } | undefined
  ): Data | undefined =>
    previousQuery?.meta?.role === role ? previous : undefined;

/**
 * The last failure, kept until an answer replaces it: without it the list
 * would flicker between a placeholder and the error at every client event.
 */
const useStickyFailure = (
  reported: ServerFailure | null,
  hasFreshAnswer: boolean
): ServerFailure | null => {
  const [last, setLast] = useState<ServerFailure | null>(null);
  if (reported !== null && reported !== last) {
    setLast(reported);
  }
  if (hasFreshAnswer && last !== null) {
    setLast(null);
  }
  return last;
};

/**
 * The enemy roles of the last answer, kept while a newer request loads or
 * fails: without it the enemy rows lose their role, and move, at every request.
 */
const useKnownEnemyRoles = (
  answered: readonly EnemyRole[] | undefined
): readonly EnemyRole[] => {
  const [known, setKnown] = useState<readonly EnemyRole[]>(NO_ENEMY_ROLES);
  if (answered !== undefined && answered !== known) {
    setKnown(answered);
  }
  return answered ?? known;
};

interface Answer {
  failure: ServerFailure | null;
  isFetching: boolean;
  isStale: boolean;
  result: SuggestionsResult | undefined;
  retry: () => void;
}

const resolveState = (
  isConfigured: boolean,
  needsRole: boolean,
  isForAnotherList: boolean,
  answer: Answer
): SuggestionsState => {
  if (!isConfigured) {
    return { status: "unconfigured" };
  }
  if (needsRole) {
    return { status: "needs-role" };
  }
  if (answer.failure !== null) {
    return {
      status: "failed",
      failure: answer.failure,
      isRetrying: answer.isFetching,
      retry: answer.retry,
    };
  }
  if (isForAnotherList || answer.result === undefined) {
    return { status: "loading" };
  }
  return { status: "ready", isStale: answer.isStale, result: answer.result };
};

/**
 * Ban suggestions while the local player bans, pick suggestions otherwise.
 * The role is the one the client assigned, else `pickedRole`. Requests follow
 * the settled draft: while a newer one settles, the previous answer stays,
 * marked stale; an answer for another role or the other kind of list never
 * does.
 */
export const useDraftSuggestions = (
  draft: DraftState,
  pickedRole: Role | null
): DraftSuggestions => {
  const isConfigured = isConnectionConfigured(useSettings());
  const pool = usePlayerPool();
  const kind = suggestionKind(draft);
  const liveKey = suggestionRequestKey(draft);
  const settledKey = useDebouncedValue(liveKey, DRAFT_DEBOUNCE_MS);
  const request = useMemo(
    () => parseSuggestionRequest(settledKey),
    [settledKey]
  );
  const liveRole = assignedRole(draft) ?? pickedRole;
  const role = assignedRole(request.draft) ?? pickedRole;

  const canAsk = isConfigured && pool.isSettled;
  const input = {
    queueId: request.draft.queueId,
    role,
    draft: request.draft,
    pool: pool.entries,
  };
  const shared = {
    meta: { role },
    placeholderData: sameRoleOnly(role),
    retry: retryUnreachableOnce,
    staleTime: SUGGESTIONS_FRESH_FOR_MS,
  };
  const picks = useQuery({
    ...orpc.coach.suggestPicks.queryOptions({ input }),
    ...shared,
    enabled: canAsk && request.kind === "pick" && role !== null,
  });
  const bans = useQuery({
    ...orpc.coach.suggestBans.queryOptions({ input }),
    ...shared,
    enabled: canAsk && request.kind === "ban",
  });
  const query = request.kind === "pick" ? picks : bans;
  const enemyRoles = useKnownEnemyRoles(picks.data?.enemyRoles);

  const reported = query.isError ? classifyServerError(query.error) : null;
  const lastFailure = useStickyFailure(
    reported,
    query.isSuccess && !query.isPlaceholderData
  );
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    enemyRoles,
    kind,
    state: resolveState(
      isConfigured,
      kind === "pick" && liveRole === null,
      kind !== request.kind || liveRole !== role,
      {
        failure: reported ?? lastFailure,
        isFetching: query.isFetching,
        isStale: liveKey !== settledKey || query.isPlaceholderData,
        result: query.data,
        retry,
      }
    ),
  };
};
