import { describe, expect, it } from "bun:test";
import { comparePatch, previousPatch, toPatch } from "../src/patch";

describe("patch", () => {
  it("normalizes Data Dragon versions and match gameVersions", () => {
    expect(toPatch("15.23.1")).toBe("15.23");
    expect(toPatch("15.23.712.1234")).toBe("15.23");
  });

  it("rejects malformed versions", () => {
    expect(() => toPatch("latest")).toThrow("Invalid patch");
    expect(() => toPatch("")).toThrow("Invalid patch");
  });

  it("compares numerically, not lexically", () => {
    expect(comparePatch("15.9", "15.10")).toBeLessThan(0);
    expect(comparePatch("16.1", "15.24")).toBeGreaterThan(0);
    expect(comparePatch("15.23", "15.23")).toBe(0);
  });

  it("finds the previous known patch across a year rollover", () => {
    const known = ["15.23", "15.24", "16.1", "15.22"];
    expect(previousPatch("16.1", known)).toBe("15.24");
    expect(previousPatch("15.22", known)).toBeNull();
  });
});
