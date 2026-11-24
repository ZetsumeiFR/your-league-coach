import { describe, expect, it } from "bun:test";
import { QUEUES, queueToStatsGroup } from "../src/queues";
import { lcuPositionToRole } from "../src/roles";

describe("queues", () => {
  it("maps summoner's rift queues to sr and ARAM to aram", () => {
    expect(queueToStatsGroup(420)).toBe("sr");
    expect(queueToStatsGroup(440)).toBe("sr");
    expect(queueToStatsGroup(400)).toBe("sr");
    expect(queueToStatsGroup(QUEUES.ARAM)).toBe("aram");
  });

  it("returns null for unsupported queues", () => {
    expect(queueToStatsGroup(1700)).toBeNull();
  });
});

describe("roles", () => {
  it("maps LCU assignedPosition to match-v5 roles", () => {
    expect(lcuPositionToRole("top")).toBe("TOP");
    expect(lcuPositionToRole("jungle")).toBe("JUNGLE");
    expect(lcuPositionToRole("middle")).toBe("MIDDLE");
    expect(lcuPositionToRole("bottom")).toBe("BOTTOM");
    expect(lcuPositionToRole("utility")).toBe("UTILITY");
  });

  it("returns null for empty or unknown positions", () => {
    expect(lcuPositionToRole("")).toBeNull();
    expect(lcuPositionToRole("constructor")).toBeNull();
  });
});
