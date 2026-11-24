import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { useSyncExternalStore } from "react";

import { desktop, type ItemSetBlock, NO_FREE_PAGE } from "./events";

export const IMPORT_PARTS = ["runes", "spells", "items"] as const;
export type ImportPart = (typeof IMPORT_PARTS)[number];

export type PartOutcome =
  | { part: ImportPart; status: "done" }
  | { part: "runes"; status: "no-free-page" }
  | { detail: string; part: ImportPart; status: "failed" };

const SEVERITY: Record<PartOutcome["status"], number> = {
  done: 0,
  "no-free-page": 1,
  failed: 2,
};

/**
 * The outcomes in the order to announce them: the last announcement stays in
 * front of the others, so what went wrong comes last.
 */
export const announcementOrder = (outcomes: PartOutcome[]): PartOutcome[] =>
  outcomes.toSorted((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);

export interface BuildImport {
  blocks: ItemSetBlock[];
  build: Pick<BuildRecommendation, "championId" | "runes" | "spells">;
  /** Champion select the import belongs to. */
  session: number;
  /** Name of the rune page and of the item set, such as "YLC Ahri". */
  title: string;
}

export type ImportCommands = Pick<
  typeof desktop,
  "importItemSet" | "importRunes" | "setSpells"
>;

export interface ImportState {
  isImporting: boolean;
  /** Champion select whose last import found no free rune page. */
  noFreePageSession: number | null;
}

let state: ImportState = { isImporting: false, noFreePageSession: null };
const listeners = new Set<() => void>();

const publish = (next: ImportState) => {
  state = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getState = () => state;

export const useImportState = (): ImportState =>
  useSyncExternalStore(subscribe, getState);

const attempt = async (
  part: ImportPart,
  run: () => Promise<unknown>
): Promise<PartOutcome> => {
  try {
    await run();
    return { part, status: "done" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return part === "runes" && detail === NO_FREE_PAGE
      ? { part, status: "no-free-page" }
      : { part, status: "failed", detail };
  }
};

/**
 * Sends runes, spells and items to the League client, one after the other. A
 * part that fails does not stop the next ones. Resolves to null without
 * sending anything while another import is running.
 */
export const importBuild = async (
  { blocks, build, session, title }: BuildImport,
  commands: ImportCommands = desktop
): Promise<PartOutcome[] | null> => {
  if (state.isImporting) {
    return null;
  }
  publish({ isImporting: true, noFreePageSession: null });
  const [spell1Id, spell2Id] = build.spells;
  const runes = await attempt("runes", () =>
    commands.importRunes({ name: title, ...build.runes })
  );
  const spells = await attempt("spells", () =>
    commands.setSpells(spell1Id, spell2Id)
  );
  const items = await attempt("items", () =>
    commands.importItemSet({ blocks, championId: build.championId, title })
  );
  publish({
    isImporting: false,
    noFreePageSession: runes.status === "no-free-page" ? session : null,
  });
  return [runes, spells, items];
};
