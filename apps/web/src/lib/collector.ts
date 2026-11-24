/** Age of the last aggregation past which the home screen warns about the statistics. */
const STALE_AFTER_MS = 2 * 60 * 60_000;

/** A collector that never aggregated is stale too: there is nothing current to show. */
export const isAggregationStale = (
  lastAggregateAt: Date | null,
  now: Date
): boolean =>
  lastAggregateAt === null ||
  now.getTime() - lastAggregateAt.getTime() > STALE_AFTER_MS;
