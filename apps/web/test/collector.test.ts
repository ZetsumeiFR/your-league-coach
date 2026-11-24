import { describe, expect, it } from "bun:test";

import { isAggregationStale } from "../src/lib/collector";

const NOW = new Date("2026-11-24T12:00:00Z");
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const before = (ms: number) => new Date(NOW.getTime() - ms);

describe("collector staleness", () => {
  it("accepts an aggregation up to two hours old", () => {
    expect(isAggregationStale(before(0), NOW)).toBe(false);
    expect(isAggregationStale(before(TWO_HOURS_MS), NOW)).toBe(false);
  });

  it("warns once the aggregation is older than two hours", () => {
    expect(isAggregationStale(before(TWO_HOURS_MS + 1), NOW)).toBe(true);
  });

  it("warns when the collector never aggregated", () => {
    expect(isAggregationStale(null, NOW)).toBe(true);
  });
});
