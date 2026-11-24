import type { DraftState } from "@your-league-coach/lol-data/types";

import { type DraftMode, draftMode } from "../draft/request";
import { assignedChampionId } from "./request";

/**
 * How long an ARAM assignment has to last, without a break, before its build
 * is imported: rerolls and bench swaps come in bursts.
 */
const ARAM_SETTLE_MS = 1000;

interface AutoImportMemory {
  /** Champion whose automatic import has run to its end; 0 for none. */
  imported: number;
  sawUnlocked: boolean;
  session: number;
  /** Champion an automatic import is wanted for; 0 for none. */
  target: number;
}

const NO_AUTO_IMPORT: AutoImportMemory = {
  imported: 0,
  sawUnlocked: false,
  session: 0,
  target: 0,
};

export interface DraftSighting {
  autoImport: boolean;
  /**
   * On the Rift, the champion of the local pick. In ARAM, the champion the
   * client has assigned to the local player, never one they hover or declare;
   * 0 while none is assigned.
   */
  championId: number;
  completed: boolean;
  mode: DraftMode;
  session: number;
}

/** The ARAM assignment in front of the window; champion 0 for none. */
interface Assignment {
  championId: number;
  /** Whether it has lasted `ARAM_SETTLE_MS` without a break. */
  hasLasted: boolean;
  session: number;
}

const NO_ASSIGNMENT: Assignment = {
  championId: 0,
  hasLasted: false,
  session: 0,
};

export const sightingOf = (
  draft: DraftState,
  { autoImport, session }: { autoImport: boolean; session: number }
): DraftSighting => {
  const mode = draftMode(draft.queueId);
  return {
    autoImport,
    championId:
      mode === "aram" ? assignedChampionId(draft) : draft.localPick.championId,
    completed: draft.localPick.completed,
    mode,
    session,
  };
};

const nextTarget = (
  memory: AutoImportMemory,
  seen: DraftSighting,
  hasAssignmentLasted: boolean
): number => {
  if (seen.mode === "aram") {
    // Nothing is kept from earlier sightings: an import that was waiting goes
    // with its assignment, and only an assignment that has lasted makes one
    // due again.
    return hasAssignmentLasted ? seen.championId : 0;
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
 * is wanted for the champion assigned to the player, once that assignment has
 * lasted and for as long as it goes on. While the setting is off nothing is
 * wanted, and switching it on imports nothing by itself. Seeing the same
 * thing twice changes nothing.
 */
const observeDraft = (
  memory: AutoImportMemory,
  seen: DraftSighting,
  hasAssignmentLasted: boolean
): AutoImportMemory => {
  const current =
    memory.session === seen.session
      ? memory
      : { ...NO_AUTO_IMPORT, session: seen.session };
  const target = nextTarget(current, seen, hasAssignmentLasted);
  const isSkippedWhileOff = !seen.autoImport && target !== 0;
  return {
    session: current.session,
    sawUnlocked: current.sawUnlocked || !seen.completed,
    target,
    imported: isSkippedWhileOff ? target : current.imported,
  };
};

/** The champion an automatic import is due for, or 0. */
const dueAutoImport = (memory: AutoImportMemory): number =>
  memory.target === memory.imported ? 0 : memory.target;

/** An import that ends after its champion select does not count in the next one. */
const markAutoImported = (
  memory: AutoImportMemory,
  session: number,
  championId: number
): AutoImportMemory =>
  memory.session === session ? { ...memory, imported: championId } : memory;

export interface AutoImportView<Build> {
  /** The build at hand, for whatever champion; null while there is none. */
  build: Build | null;
  /** What the window sees of the draft; null outside champion select. */
  seen: DraftSighting | null;
  /**
   * Sends a build to the League client. Resolves to null when it sent nothing
   * because another import was running.
   */
  send: (build: Build) => Promise<object | null>;
}

export interface AutoImporter<Build> {
  /** The champion to have a build at hand for, or 0. */
  dueChampionId: () => number;
  /**
   * Sends the build that is due if it was held back by another import: to
   * call when an import ends.
   */
  retry: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  /**
   * Takes in what the window sees now and sends the build that is due, once
   * it is at hand. Settles when nothing more is being sent.
   */
  update: (view: AutoImportView<Build>) => Promise<void>;
}

/**
 * Decides when a build is imported by itself and sends it, one import at a
 * time. A champion counts as imported once its own import has run to its end:
 * when the champion changes while another one is being sent, the new one is
 * sent right after. In ARAM it times the assignment itself: nothing is due
 * before the assignment in front of the window has lasted `ARAM_SETTLE_MS`.
 */
export const createAutoImporter = <
  Build extends { championId: number },
>(): AutoImporter<Build> => {
  let memory = NO_AUTO_IMPORT;
  let view: AutoImportView<Build> | null = null;
  let isSending = false;
  let assignment = NO_ASSIGNMENT;
  let settling: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const dueChampionId = () => (view?.seen ? dueAutoImport(memory) : 0);

  const change = (apply: () => void) => {
    const dueBefore = dueChampionId();
    apply();
    if (dueChampionId() !== dueBefore) {
      for (const listener of listeners) {
        listener();
      }
    }
  };

  const observe = () => {
    if (view?.seen) {
      memory = observeDraft(memory, view.seen, assignment.hasLasted);
    }
  };

  const sendDue = async (): Promise<void> => {
    const championId = dueChampionId();
    const build = view?.build ?? null;
    if (
      isSending ||
      view === null ||
      championId === 0 ||
      build?.championId !== championId
    ) {
      return;
    }
    const { session } = memory;
    isSending = true;
    let sent: object | null;
    try {
      sent = await view.send(build);
    } finally {
      isSending = false;
    }
    if (sent === null) {
      return;
    }
    change(() => {
      memory = markAutoImported(memory, session, championId);
    });
    // The champion may have changed while this one was being sent.
    await sendDue();
  };

  /**
   * Starts the wait again on every change of assignment: another champion,
   * none, or the same champion back after a gap. What an earlier assignment
   * had lasted counts for nothing.
   */
  const followAssignment = (seen: DraftSighting | null) => {
    const championId = seen?.mode === "aram" ? seen.championId : 0;
    const session = seen?.session ?? 0;
    const isSame =
      championId === assignment.championId && session === assignment.session;
    if (isSame) {
      return;
    }
    clearTimeout(settling);
    assignment = { championId, hasLasted: false, session };
    if (championId === 0) {
      return;
    }
    settling = setTimeout(() => {
      change(() => {
        assignment = { ...assignment, hasLasted: true };
        observe();
      });
      sendDue();
    }, ARAM_SETTLE_MS);
  };

  return {
    dueChampionId,
    retry: sendDue,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (next) => {
      change(() => {
        view = next;
        followAssignment(next.seen);
        observe();
      });
      return sendDue();
    },
  };
};
