import { describe, expect, it } from "bun:test";
import type { DraftState } from "@your-league-coach/lol-data/types";

import {
  aramChampionId,
  createAutoImporter,
  type DraftSighting,
  sightingOf,
} from "../src/lib/build/auto-import";
import {
  type BuildImport,
  type ImportCommands,
  importBuild,
} from "../src/lib/desktop/import";
import { locked, withLocal } from "./support/ranked-drafts";

const AHRI = 103;
const ASHE = 22;
const JINX = 222;

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

/**
 * A League client that records the commands it receives, named after the
 * champion of their import. `send` is the app's own import, on that client.
 */
const client = () => {
  const calls: string[] = [];
  const held = new Map<number, Promise<null>>();
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
    send: (build: Build) =>
      importBuild(
        {
          blocks: [{ type: "Core", items: [{ id: 6655, count: 1 }] }],
          build,
          session: 1,
          title: `YLC ${build.championId}`,
        },
        commandsFor(build.championId)
      ),
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
const aram = (championId: number, autoImport = true): DraftSighting => ({
  autoImport,
  championId,
  completed: false,
  mode: "aram",
  session: 1,
});

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

  it("imports for each champion the player settles on, back to an earlier one included", async () => {
    expect(
      await importsOf([aram(0), aram(ASHE), aram(ASHE), aram(JINX), aram(ASHE)])
    ).toEqual([0, ASHE, 0, JINX, ASHE]);
  });

  it("keeps waiting while the champion has not settled", async () => {
    expect(await importsOf([aram(ASHE), aram(0), aram(0)])).toEqual([
      ASHE,
      0,
      0,
    ]);
  });

  it("imports nothing for the champion on screen when the setting is switched on", async () => {
    expect(
      await importsOf([aram(ASHE, false), aram(ASHE), aram(JINX)])
    ).toEqual([0, 0, JINX]);
  });

  it("imports nothing for a champion the player only hovers or declares", async () => {
    const { calls, send } = client();
    const importer = createAutoImporter<Build>();
    const see = (draft: DraftState) =>
      importer.update({
        build: buildOf(ASHE),
        seen: sightingOf(draft, {
          autoImport: true,
          session: 1,
          settledAramChampionId: aramChampionId(draft),
        }),
        send,
      });

    const declared = aramDraft({ championId: 0, championPickIntent: ASHE });
    expect(aramChampionId(declared)).toBe(0);
    await see(declared);
    await see(declared);
    expect(calls).toEqual([]);

    await see(aramDraft({ championId: ASHE, championPickIntent: ASHE }));
    expect(calls).toEqual(commandsOf(ASHE));
  });

  it("waits on no champion on the Rift, where the lock decides", () => {
    expect(aramChampionId(withLocal(locked, { championId: AHRI }))).toBe(0);
  });

  it("sends the champion finally assigned once the import of the previous one has ended", async () => {
    const { calls, hold, send } = client();
    const importer = createAutoImporter<Build>();
    const settleOn = (championId: number) =>
      importer.update({
        build: buildOf(championId),
        seen: aram(championId),
        send,
      });
    await settleOn(ASHE);
    expect(calls).toEqual(commandsOf(ASHE));

    const release = hold(JINX);
    const importingJinx = settleOn(JINX);
    const backToAshe = settleOn(ASHE);
    expect(calls.slice(3)).toEqual([`runes ${JINX}`]);

    release();
    await Promise.all([importingJinx, backToAshe]);
    expect(calls.slice(3)).toEqual([...commandsOf(JINX), ...commandsOf(ASHE)]);
  });
});
