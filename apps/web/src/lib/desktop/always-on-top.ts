import { useSyncExternalStore } from "react";

import { desktop } from "./events";

export type WindowCommands = Pick<typeof desktop, "setAlwaysOnTop">;

/**
 * The window starts among the others (tauri.conf.json) and nothing but this
 * module moves it, so the last change the window accepted is where it is.
 */
let isOnTop = false;
let isChanging = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isAlwaysOnTop = (): boolean => isOnTop;

export const useAlwaysOnTop = (): boolean =>
  useSyncExternalStore(subscribe, isAlwaysOnTop);

/**
 * Asks the window to stay above the others, or to stop. The published state
 * follows only once the window has accepted: a refused change rejects with
 * the backend's text and leaves it as it was. Resolves to false, without
 * asking, while an earlier change is still pending.
 */
export const setAlwaysOnTop = async (
  next: boolean,
  commands: WindowCommands = desktop
): Promise<boolean> => {
  if (isChanging) {
    return false;
  }
  isChanging = true;
  try {
    await commands.setAlwaysOnTop(next);
  } finally {
    isChanging = false;
  }
  isOnTop = next;
  for (const listener of listeners) {
    listener();
  }
  return true;
};
