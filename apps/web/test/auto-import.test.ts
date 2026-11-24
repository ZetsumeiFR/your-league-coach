import { describe, expect, it } from "bun:test";

import {
  type AutoImportMemory,
  type DraftSighting,
  dueAutoImport,
  isSameMemory,
  markAutoImported,
  NO_AUTO_IMPORT,
  observeDraft,
} from "../src/lib/build/auto-import";

const AHRI = 103;
const ASHE = 22;
const JINX = 222;

const rift = (change: Partial<DraftSighting> = {}): DraftSighting => ({
  autoImport: true,
  championId: AHRI,
  completed: false,
  mode: "rift",
  session: 1,
  ...change,
});
const hover = rift();
const lock = rift({ completed: true });
const aram = (championId: number, autoImport = true): DraftSighting => ({
  autoImport,
  championId,
  completed: championId !== 0,
  mode: "aram",
  session: 1,
});

/**
 * Plays sightings in order, starting each due import the way the app does,
 * and returns the champion each sighting started an import for (0 for none).
 */
const importsOf = (sightings: DraftSighting[]): number[] => {
  let memory: AutoImportMemory = NO_AUTO_IMPORT;
  return sightings.map((seen) => {
    memory = observeDraft(memory, seen);
    const due = dueAutoImport(memory);
    if (due !== 0) {
      memory = markAutoImported(memory);
    }
    return due;
  });
};

describe("automatic import on the Rift", () => {
  it("imports once, on the lock, never on a hover", () => {
    expect(importsOf([rift({ championId: 0 }), hover, hover, lock])).toEqual([
      0,
      0,
      0,
      AHRI,
    ]);
  });

  it("does not import again when the lock is seen again", () => {
    expect(importsOf([hover, lock, lock, hover, lock])).toEqual([
      0,
      AHRI,
      0,
      0,
      0,
    ]);
  });

  it("does not import for a pick that was already locked when first seen", () => {
    expect(importsOf([lock, lock])).toEqual([0, 0]);
  });

  it("imports nothing while the setting is off, nor when it is switched on later", () => {
    const off = { autoImport: false };
    expect(
      importsOf([rift(off), rift({ ...off, completed: true }), lock, lock])
    ).toEqual([0, 0, 0, 0]);
  });

  it("imports again in the next champion select", () => {
    const next = { session: 2, championId: JINX };
    expect(
      importsOf([hover, lock, rift(next), rift({ ...next, completed: true })])
    ).toEqual([0, AHRI, 0, JINX]);
  });

  it("imports nothing in a mode without builds", () => {
    const arena = { mode: "unsupported" } as const;
    expect(
      importsOf([rift(arena), rift({ ...arena, completed: true })])
    ).toEqual([0, 0]);
  });
});

describe("automatic import in ARAM", () => {
  it("imports for each champion the player settles on, back to an earlier one included", () => {
    expect(
      importsOf([aram(0), aram(ASHE), aram(ASHE), aram(JINX), aram(ASHE)])
    ).toEqual([0, ASHE, 0, JINX, ASHE]);
  });

  it("keeps waiting while the champion has not settled", () => {
    expect(importsOf([aram(ASHE), aram(0), aram(0)])).toEqual([ASHE, 0, 0]);
  });

  it("imports nothing for the champion on screen when the setting is switched on", () => {
    expect(importsOf([aram(ASHE, false), aram(ASHE), aram(JINX)])).toEqual([
      0,
      0,
      JINX,
    ]);
  });
});

describe("memory", () => {
  it("is unchanged by seeing the same thing twice", () => {
    for (const seen of [hover, lock, aram(ASHE), aram(0)]) {
      const once = observeDraft(NO_AUTO_IMPORT, seen);
      expect(isSameMemory(observeDraft(once, seen), once)).toBe(true);
    }
  });
});
