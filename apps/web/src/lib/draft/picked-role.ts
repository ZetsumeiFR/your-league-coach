import { ROLES, type Role } from "@your-league-coach/lol-data/roles";
import { useSyncExternalStore } from "react";

/** Session storage: the choice lasts as long as the app window, not longer. */
const STORAGE_KEY = "ylc.draft.role";

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const readPickedRole = (): Role | null => {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  return ROLES.find((role) => role === stored) ?? null;
};

export const pickRole = (role: Role) => {
  sessionStorage.setItem(STORAGE_KEY, role);
  for (const listener of listeners) {
    listener();
  }
};

export const usePickedRole = (): Role | null =>
  useSyncExternalStore(subscribe, readPickedRole);
