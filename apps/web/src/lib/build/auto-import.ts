import type { DraftState } from "@your-league-coach/lol-data/types";

import { type DraftMode, draftMode } from "../draft/request";
import { assignedChampionId } from "./request";

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
   * On the Rift, the champion of the local pick. In ARAM, the champion
   * assigned to the local player once it has stopped changing; 0 until then.
   */
  championId: number;
  completed: boolean;
  mode: DraftMode;
  session: number;
}

/**
 * The champion an automatic import waits on in ARAM: the one the client has
 * assigned to the local player, never one they hover or declare. 0 on the
 * Rift, where the lock decides, and while none is assigned.
 */
export const aramChampionId = (draft: DraftState): number =>
  draftMode(draft.queueId) === "aram" ? assignedChampionId(draft) : 0;

export const sightingOf = (
  draft: DraftState,
  {
    autoImport,
    session,
    settledAramChampionId,
  }: {
    autoImport: boolean;
    session: number;
    /** `aramChampionId` of the draft, once it has stopped changing. */
    settledAramChampionId: number;
  }
): DraftSighting => {
  const mode = draftMode(draft.queueId);
  return {
    autoImport,
    championId:
      mode === "aram" ? settledAramChampionId : draft.localPick.championId,
    completed: draft.localPick.completed,
    mode,
    session,
  };
};

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
const observeDraft = (
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
 * sent right after.
 */
export const createAutoImporter = <
  Build extends { championId: number },
>(): AutoImporter<Build> => {
  let memory = NO_AUTO_IMPORT;
  let view: AutoImportView<Build> | null = null;
  let isSending = false;
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
        if (next.seen) {
          memory = observeDraft(memory, next.seen);
        }
      });
      return sendDue();
    },
  };
};
