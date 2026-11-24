import {
  type ParsedReasonCode,
  parseReasonCode,
} from "@your-league-coach/lol-data/types";
import type { BadgeProps } from "@your-league-coach/ui/components/reui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;
type ReasonKind = ParsedReasonCode["kind"];

const REASON_VARIANTS: Partial<Record<ReasonKind, BadgeVariant>> = {
  strong_on_patch: "success-light",
  counters: "success-light",
  countered_by: "destructive-light",
  synergy: "info-light",
  in_your_pool: "primary-light",
  balances_damage: "warning-light",
};

export const reasonVariant = (kind: ReasonKind): BadgeVariant =>
  REASON_VARIANTS[kind] ?? "outline";

export const MAX_VISIBLE_REASONS = 3;

const LANE_MATCHUP_RANK = 0;
const KIND_RANKS: Partial<Record<ReasonKind, number>> = {
  in_your_pool: 1,
  strong_on_patch: 2,
  counters: 3,
  countered_by: 4,
  synergy: 5,
};
const LAST_RANK = 6;

const rankOf = (
  reason: ParsedReasonCode,
  laneOpponentId: number | null
): number => {
  const isLaneMatchup =
    (reason.kind === "counters" || reason.kind === "countered_by") &&
    reason.championId === laneOpponentId;
  return isLaneMatchup
    ? LANE_MATCHUP_RANK
    : (KIND_RANKS[reason.kind] ?? LAST_RANK);
};

/** Most decisive first; within a rank the server's order is kept. Unknown codes are dropped. */
export const orderReasons = (
  codes: readonly string[],
  laneOpponentId: number | null
): ParsedReasonCode[] =>
  codes
    .flatMap((code) => {
      const reason = parseReasonCode(code);
      return reason ? [reason] : [];
    })
    .toSorted((a, b) => rankOf(a, laneOpponentId) - rankOf(b, laneOpponentId));

export const reasonKey = (reason: ParsedReasonCode): string =>
  "championId" in reason ? `${reason.kind}:${reason.championId}` : reason.kind;
