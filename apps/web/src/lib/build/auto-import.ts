import type { DraftMode } from "../draft/request";

export interface AutoImportMemory {
  /** Champion the last automatic import was started for; 0 for none. */
  imported: number;
  sawUnlocked: boolean;
  session: number;
  /** Champion an automatic import is wanted for; 0 for none. */
  target: number;
}

export const NO_AUTO_IMPORT: AutoImportMemory = {
  imported: 0,
  sawUnlocked: false,
  session: 0,
  target: 0,
};

export interface DraftSighting {
  autoImport: boolean;
  /**
   * On the Rift, the champion of the local pick. In ARAM, the assigned
   * champion once it has stopped changing; 0 until then.
   */
  championId: number;
  completed: boolean;
  mode: DraftMode;
  session: number;
}

const nextTarget = (memory: AutoImportMemory, seen: DraftSighting): number => {
  if (seen.mode === "aram") {
    return seen.championId || memory.target;
  }
  const isLockIn =
    seen.mode === "rift" &&
    seen.completed &&
    seen.championId !== 0 &&
    memory.sawUnlocked &&
    memory.target === 0;
  return isLockIn ? seen.championId : memory.target;
};

/**
 * On the Rift an import is wanted once, when the pick goes from unlocked to
 * locked in front of this window: never on a hover, on a lock seen again, or
 * on a pick that was already locked when the window first saw it. In ARAM it
 * is wanted for each champion the player settles on. While the setting is off
 * nothing is wanted, and switching it on imports nothing by itself. Seeing
 * the same thing twice changes nothing.
 */
export const observeDraft = (
  memory: AutoImportMemory,
  seen: DraftSighting
): AutoImportMemory => {
  const current =
    memory.session === seen.session
      ? memory
      : { ...NO_AUTO_IMPORT, session: seen.session };
  const target = nextTarget(current, seen);
  return {
    session: current.session,
    sawUnlocked: current.sawUnlocked || !seen.completed,
    target,
    imported: seen.autoImport ? current.imported : target,
  };
};

/** The champion an automatic import is due for, or 0. */
export const dueAutoImport = (memory: AutoImportMemory): number =>
  memory.target === memory.imported ? 0 : memory.target;

export const markAutoImported = (
  memory: AutoImportMemory
): AutoImportMemory => ({ ...memory, imported: memory.target });

export const isSameMemory = (
  a: AutoImportMemory,
  b: AutoImportMemory
): boolean =>
  a.session === b.session &&
  a.sawUnlocked === b.sawUnlocked &&
  a.target === b.target &&
  a.imported === b.imported;
