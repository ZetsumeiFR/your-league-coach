import { load, type Store } from "@tauri-apps/plugin-store";
import { useSyncExternalStore } from "react";

import { ENV } from "../env";
import { desktop } from "./desktop/events";
import {
  normalizeServerUrl,
  parseStoredSettings,
  SETTING_KEYS,
  type Settings,
} from "./settings";

/** Same file the Rust side reads `lockfilePath` from at startup. */
const STORE_FILE = "settings.json";

const DEFAULT_SETTINGS: Settings = {
  serverUrl: normalizeServerUrl(ENV.VITE_SERVER_URL),
  accessKey: "",
  language: "auto",
  autoImport: false,
  lockfilePath: null,
};

export type SettingsState =
  | { status: "loading" }
  | { status: "ready"; settings: Settings }
  | { status: "error"; detail: string };

let state: SettingsState = { status: "loading" };
let store: Store | null = null;
const listeners = new Set<() => void>();

const publish = (next: SettingsState) => {
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

export const loadSettings = async (): Promise<void> => {
  publish({ status: "loading" });
  try {
    const opened = await load(STORE_FILE, { autoSave: false });
    const entries = await Promise.all(
      SETTING_KEYS.map(async (key) => [key, await opened.get(key)] as const)
    );
    store = opened;
    publish({
      status: "ready",
      settings: parseStoredSettings(
        Object.fromEntries(entries),
        DEFAULT_SETTINGS
      ),
    });
  } catch (error) {
    publish({ status: "error", detail: String(error) });
  }
};

/**
 * Writes the given keys to disk, then publishes them; a failed write leaves
 * the published settings untouched. Every given key is written, even one equal
 * to its default: a default can change between versions, a saved value must
 * not. A new lockfile path is also handed to the running connector, which
 * otherwise reads it only at startup.
 */
export const saveSettings = async (changes: Partial<Settings>) => {
  if (state.status !== "ready" || store === null) {
    throw new Error("Settings cannot be saved before they are loaded");
  }
  const opened = store;
  const previous = state.settings;
  const next = { ...previous, ...changes };
  const givenKeys = SETTING_KEYS.filter((key) => key in changes);
  await Promise.all(givenKeys.map((key) => opened.set(key, next[key])));
  await opened.save();
  if (next.lockfilePath !== previous.lockfilePath) {
    await desktop.setLockfilePath(next.lockfilePath);
  }
  publish({ status: "ready", settings: next });
};

export const getSettings = (): Settings | null =>
  state.status === "ready" ? state.settings : null;

export const useSettingsState = (): SettingsState =>
  useSyncExternalStore(subscribe, getState);

export const useSettings = (): Settings => {
  const current = useSettingsState();
  if (current.status !== "ready") {
    throw new Error("useSettings must render below SettingsGate");
  }
  return current.settings;
};
