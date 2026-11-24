import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import type { DraftState } from "@your-league-coach/lol-data/types";

import {
  createAutoImporter,
  type DraftSighting,
  sightingOf,
} from "../src/lib/build/auto-import";
import {
  type BuildImport,
  type ImportCommands,
  importBuild,
} from "../src/lib/desktop/import";
import { hovering, locked, withLocal } from "./support/ranked-drafts";

const AHRI = 103;
const ASHE = 22;
const JINX = 222;

/**
 * How long an ARAM assignment has to last before its import: the plan's
 * figure, written here and not read from the code under test.
 */
const SETTLE_MS = 1000;

type Build = BuildImport["build"];

const buildOf = (championId: number): Build => ({
  championId,
  runes: {
    primaryStyleId: 8100,
    subStyleId: 8200,
    selectedPerkIds: [8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011],
  },
  spells: [4, 14],
});

const COMMANDS = ["runes", "spells", "items"] as const;

const commandsOf = (championId: number): string[] =>
  COMMANDS.map((command) => `${command} ${championId}`);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const pass = (ms: number) => {
  jest.advanceTimersByTime(ms);
};

/**
 * A League client that records the commands it receives, named after the
 * champion of their import. `send` is the app's own import, on that client.
 */
const client = () => {
  const calls: string[] = [];
  const held = new Map<number, Promise<null>>();
  const imports: Promise<unknown>[] = [];
  const commandsFor = (championId: number): ImportCommands => {
    const record = (command: (typeof COMMANDS)[number]) => {
      calls.push(`${command} ${championId}`);
      return Promise.resolve(null);
    };
    return {
      importRunes: async () => {
        await record("runes");
        return (await held.get(championId)) ?? null;
      },
      setSpells: () => record("spells"),
      importItemSet: () => record("items"),
    };
  };
  const ended = async (from: number): Promise<void> => {
    if (from < imports.length) {
      await imports[from];
      await ended(from + 1);
    }
  };
  return {
    calls,
    hold: (championId: number) => {
      const gate = Promise.withResolvers<null>();
      held.set(championId, gate.promise);
      return () => {
        held.delete(championId);
        gate.resolve(null);
      };
    },
    send: (build: Build) => {
      const outcomes = importBuild(
        {
          blocks: [{ type: "Core", items: [{ id: 6655, count: 1 }] }],
          build,
          session: 1,
          title: `YLC ${build.championId}`,
        },
        commandsFor(build.championId)
      );
      imports.push(outcomes);
      return outcomes;
    },
    /**
     * The commands received once every import started has ended. When one
     * ends the importer goes on before this does, so an import it starts
     * right after is waited for too.
     */
    sent: async (): Promise<string[]> => {
      await ended(0);
      return [...calls];
    },
  };
};

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

/**
 * Shows the sightings to an importer one after the other, with the build of
 * the champion on screen at hand as the panel has it, and returns the
 * champion each sighting got imported (0 for none).
 */
const importsOf = (sightings: DraftSighting[]): Promise<number[]> => {
  const { calls, send } = client();
  const importer = createAutoImporter<Build>();
  const show = async (
    [seen, ...later]: DraftSighting[],
    imported: number[]
  ): Promise<number[]> => {
    if (seen === undefined) {
      return imported;
    }
    const before = calls.length;
    await importer.update({
      build: seen.championId === 0 ? null : buildOf(seen.championId),
      seen,
      send,
    });
    const sent = calls.slice(before);
    const championId = sent.length === 0 ? 0 : seen.championId;
    expect(sent).toEqual(championId === 0 ? [] : commandsOf(championId));
    return show(later, [...imported, championId]);
  };
  return show(sightings, []);
};

describe("automatic import on the Rift", () => {
  it("imports once, on the lock, never on a hover", async () => {
    expect(
      await importsOf([rift({ championId: 0 }), hover, hover, lock])
    ).toEqual([0, 0, 0, AHRI]);
  });

  it("does not import again when the lock is seen again", async () => {
    expect(await importsOf([hover, lock, lock, hover, lock])).toEqual([
      0,
      AHRI,
      0,
      0,
      0,
    ]);
  });

  it("does not import for a pick that was already locked when first seen", async () => {
    expect(await importsOf([lock, lock])).toEqual([0, 0]);
  });

  it("imports nothing while the setting is off, nor when it is switched on later", async () => {
    const off = { autoImport: false };
    expect(
      await importsOf([
        rift(off),
        rift({ ...off, completed: true }),
        lock,
        lock,
      ])
    ).toEqual([0, 0, 0, 0]);
  });

  it("imports again in the next champion select", async () => {
    const next = { session: 2, championId: JINX };
    expect(
      await importsOf([
        hover,
        lock,
        rift(next),
        rift({ ...next, completed: true }),
      ])
    ).toEqual([0, AHRI, 0, JINX]);
  });

  it("imports nothing in a mode without builds", async () => {
    const arena = { mode: "unsupported" } as const;
    expect(
      await importsOf([rift(arena), rift({ ...arena, completed: true })])
    ).toEqual([0, 0]);
  });

  it("waits for an import started by hand, then sends its own", async () => {
    const byHand = client();
    const release = byHand.hold(AHRI);
    const importingByHand = byHand.send(buildOf(AHRI));

    const { calls, send } = client();
    const importer = createAutoImporter<Build>();
    await importer.update({ build: buildOf(AHRI), seen: hover, send });
    await importer.update({ build: buildOf(AHRI), seen: lock, send });
    expect(calls).toEqual([]);

    release();
    await importingByHand;
    await importer.retry();
    expect(calls).toEqual(commandsOf(AHRI));
    await importer.retry();
    expect(calls).toEqual(commandsOf(AHRI));
  });
});

describe("automatic import in ARAM", () => {
  const BUILD_LATE_MS = 1700;
  const SHORT_GAP_MS = 135;

  const aramDraft = (
    local: Pick<
      DraftState["myTeam"][number],
      "championId" | "championPickIntent"
    >
  ): DraftState => ({
    ...withLocal(locked, local),
    // ARAM has no pick turn: the backend reports an assigned champion as a completed pick.
    localPick: {
      championId: local.championId,
      completed: local.championId !== 0,
    },
    queueId: 450,
  });
  const assigned = (championId: number) =>
    aramDraft({ championId, championPickIntent: 0 });
  const withdrawn = aramDraft({ championId: 0, championPickIntent: 0 });
  const declared = aramDraft({ championId: 0, championPickIntent: ASHE });

  /**
   * An importer fed as the component feeds it: the draft now and the build at
   * hand. It times the assignment itself, on the clock `pass` moves.
   */
  const watching = () => {
    const { calls, hold, send, sent } = client();
    const importer = createAutoImporter<Build>();
    const see = (draft: DraftState, build: Build | null, autoImport = true) =>
      importer.update({
        build,
        seen: sightingOf(draft, { autoImport, session: 1 }),
        send,
      });
    const settleOn = async (championId: number) => {
      await see(assigned(championId), buildOf(championId));
      pass(SETTLE_MS);
      return sent();
    };
    return { calls, hold, see, sent, settleOn };
  };

  it("imports for each champion the player settles on, back to an earlier one included", async () => {
    const { see, sent, settleOn } = watching();
    await see(withdrawn, null);
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    expect(await settleOn(ASHE)).toEqual(commandsOf(ASHE));
    expect(await settleOn(ASHE)).toEqual(commandsOf(ASHE));
    expect(await settleOn(JINX)).toEqual([
      ...commandsOf(ASHE),
      ...commandsOf(JINX),
    ]);
    expect(await settleOn(ASHE)).toEqual([
      ...commandsOf(ASHE),
      ...commandsOf(JINX),
      ...commandsOf(ASHE),
    ]);
  });

  it("keeps waiting while the champion has not settled", async () => {
    const { see, sent } = watching();
    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS - 1);
    await see(assigned(JINX), buildOf(JINX));
    pass(SETTLE_MS - 1);
    expect(await sent()).toEqual([]);

    pass(1);
    expect(await sent()).toEqual(commandsOf(JINX));
  });

  it("imports nothing for the champion on screen when the setting is switched on", async () => {
    const { see, sent, settleOn } = watching();
    await see(assigned(ASHE), buildOf(ASHE), false);
    pass(SETTLE_MS);
    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    expect(await settleOn(JINX)).toEqual(commandsOf(JINX));
  });

  it("imports nothing for a champion the player only hovers or declares", async () => {
    const { see, sent } = watching();
    await see(declared, buildOf(ASHE));
    pass(SETTLE_MS);
    await see(declared, buildOf(ASHE));
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    await see(
      aramDraft({ championId: ASHE, championPickIntent: ASHE }),
      buildOf(ASHE)
    );
    pass(SETTLE_MS);
    expect(await sent()).toEqual(commandsOf(ASHE));
  });

  it("drops an import still waiting for its build once the assignment is withdrawn", async () => {
    const { see, sent } = watching();
    await see(assigned(ASHE), null);
    pass(SETTLE_MS);

    await see(withdrawn, null);
    await see(withdrawn, buildOf(ASHE));
    expect(await sent()).toEqual([]);
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    await see(declared, buildOf(ASHE));
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS - 1);
    expect(await sent()).toEqual([]);
    pass(1);
    expect(await sent()).toEqual(commandsOf(ASHE));
  });

  it("counts the second again when the same champion is assigned back after a short gap", async () => {
    const { see, sent } = watching();
    await see(assigned(ASHE), null);
    pass(BUILD_LATE_MS);
    await see(withdrawn, null);
    pass(SHORT_GAP_MS);
    await see(assigned(ASHE), null);
    await see(assigned(ASHE), buildOf(ASHE));
    expect(await sent()).toEqual([]);

    pass(SETTLE_MS - 1);
    expect(await sent()).toEqual([]);
    pass(1);
    expect(await sent()).toEqual(commandsOf(ASHE));
    pass(SETTLE_MS);
    expect(await sent()).toEqual(commandsOf(ASHE));
  });

  it("imports nothing when the champion assigned back is withdrawn within its second", async () => {
    const { see, sent } = watching();
    await see(assigned(ASHE), null);
    pass(BUILD_LATE_MS);
    await see(withdrawn, null);
    pass(SHORT_GAP_MS);
    await see(assigned(ASHE), null);
    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS / 2);
    await see(withdrawn, buildOf(ASHE));
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);
  });

  it("sends nothing after the import in progress when the assignment was withdrawn meanwhile", async () => {
    const { calls, hold, see, sent, settleOn } = watching();
    expect(await settleOn(ASHE)).toEqual(commandsOf(ASHE));

    const release = hold(JINX);
    await see(assigned(JINX), buildOf(JINX));
    pass(SETTLE_MS);
    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS);
    await see(declared, buildOf(ASHE));
    pass(SETTLE_MS);
    expect(calls).toEqual([...commandsOf(ASHE), `runes ${JINX}`]);

    release();
    expect(await sent()).toEqual([...commandsOf(ASHE), ...commandsOf(JINX)]);
  });

  it("waits on no champion on the Rift, where the lock decides", async () => {
    const { see, sent } = watching();
    await see(withLocal(hovering, { championId: AHRI }), buildOf(AHRI));
    pass(SETTLE_MS);
    expect(await sent()).toEqual([]);

    await see(locked, buildOf(AHRI));
    expect(await sent()).toEqual(commandsOf(AHRI));
  });

  it("sends the champion finally assigned once the import of the previous one has ended", async () => {
    const { calls, hold, see, sent, settleOn } = watching();
    expect(await settleOn(ASHE)).toEqual(commandsOf(ASHE));

    const release = hold(JINX);
    await see(assigned(JINX), buildOf(JINX));
    pass(SETTLE_MS);
    await see(assigned(ASHE), buildOf(ASHE));
    pass(SETTLE_MS);
    expect(calls).toEqual([...commandsOf(ASHE), `runes ${JINX}`]);

    release();
    expect(await sent()).toEqual([
      ...commandsOf(ASHE),
      ...commandsOf(JINX),
      ...commandsOf(ASHE),
    ]);
  });
});
