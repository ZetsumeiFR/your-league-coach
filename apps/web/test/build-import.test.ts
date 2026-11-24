import { describe, expect, it } from "bun:test";

import { NO_FREE_PAGE } from "../src/lib/desktop/events";
import {
  announcementOrder,
  type BuildImport,
  type ImportCommands,
  importBuild,
  type PartOutcome,
} from "../src/lib/desktop/import";

const request: BuildImport = {
  blocks: [{ type: "Core", items: [{ id: 6655, count: 1 }] }],
  build: {
    championId: 103,
    runes: {
      primaryStyleId: 8100,
      subStyleId: 8200,
      selectedPerkIds: [8112, 8139, 8140, 8135, 8226, 8210, 5008, 5008, 5011],
    },
    spells: [4, 14],
  },
  session: 7,
  title: "YLC Ahri",
};

type Call = [command: keyof ImportCommands, ...args: unknown[]];

const recorder = (
  failures: Partial<Record<keyof ImportCommands, unknown>> = {}
) => {
  const calls: Call[] = [];
  const run = (command: keyof ImportCommands, ...args: unknown[]) => {
    calls.push([command, ...args]);
    return command in failures
      ? Promise.reject(failures[command])
      : Promise.resolve(null);
  };
  const commands: ImportCommands = {
    importRunes: (page) => run("importRunes", page),
    setSpells: (spell1Id, spell2Id) => run("setSpells", spell1Id, spell2Id),
    importItemSet: (set) => run("importItemSet", set),
  };
  return { calls, commands };
};

describe("build import", () => {
  it("sends runes, then spells, then items, each once", async () => {
    const { calls, commands } = recorder();
    expect(await importBuild(request, commands)).toEqual([
      { part: "runes", status: "done" },
      { part: "spells", status: "done" },
      { part: "items", status: "done" },
    ]);
    expect(calls).toEqual([
      ["importRunes", { name: "YLC Ahri", ...request.build.runes }],
      ["setSpells", 4, 14],
      [
        "importItemSet",
        { blocks: request.blocks, championId: 103, title: "YLC Ahri" },
      ],
    ]);
  });

  it("reports a missing rune page slot apart from a failure, and still sends the rest", async () => {
    const { calls, commands } = recorder({ importRunes: NO_FREE_PAGE });
    expect(await importBuild(request, commands)).toEqual([
      { part: "runes", status: "no-free-page" },
      { part: "spells", status: "done" },
      { part: "items", status: "done" },
    ]);
    expect(calls.map(([command]) => command)).toEqual([
      "importRunes",
      "setSpells",
      "importItemSet",
    ]);
  });

  it("reports each failed part with the backend's text", async () => {
    const { commands } = recorder({
      importRunes: "LCU HTTP status 500 Internal Server Error",
      setSpells: new Error("LCU disconnected"),
      importItemSet: NO_FREE_PAGE,
    });
    expect(await importBuild(request, commands)).toEqual([
      {
        part: "runes",
        status: "failed",
        detail: "LCU HTTP status 500 Internal Server Error",
      },
      { part: "spells", status: "failed", detail: "LCU disconnected" },
      { part: "items", status: "failed", detail: NO_FREE_PAGE },
    ]);
  });

  it("sends nothing while another import is running", async () => {
    const first = recorder();
    const held = Promise.withResolvers<null>();
    const running = importBuild(request, {
      ...first.commands,
      importRunes: () => held.promise,
    });
    const second = recorder();
    expect(await importBuild(request, second.commands)).toBeNull();
    expect(second.calls).toEqual([]);

    held.resolve(null);
    expect(await running).toHaveLength(3);
    const third = recorder();
    expect(await importBuild(request, third.commands)).toHaveLength(3);
  });

  it("announces what went wrong last, a failure after a missing slot", () => {
    const announced = (outcomes: PartOutcome[]) =>
      announcementOrder(outcomes).map(({ part, status }) => [part, status]);

    expect(
      announced([
        { part: "runes", status: "done" },
        { part: "spells", status: "done" },
        { part: "items", status: "done" },
      ])
    ).toEqual([
      ["runes", "done"],
      ["spells", "done"],
      ["items", "done"],
    ]);
    expect(
      announced([
        { part: "runes", status: "failed", detail: "LCU disconnected" },
        { part: "spells", status: "done" },
        { part: "items", status: "done" },
      ])
    ).toEqual([
      ["spells", "done"],
      ["items", "done"],
      ["runes", "failed"],
    ]);
    expect(
      announced([
        { part: "runes", status: "no-free-page" },
        { part: "spells", status: "failed", detail: "LCU disconnected" },
        { part: "items", status: "done" },
      ])
    ).toEqual([
      ["items", "done"],
      ["runes", "no-free-page"],
      ["spells", "failed"],
    ]);
  });
});
