import { expect, test } from "bun:test";

const VARLOCK_KEYS = [
  "__VARLOCK_ENV",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
] as const;
const initialEnv = { ...process.env };
const initialLoadedEnv = Reflect.get(globalThis, "__varlockLoadedEnv");
const hadLoadedEnv = Object.hasOwn(globalThis, "__varlockLoadedEnv");

test("privacy suite restores Varlock-created environment keys", () => {
  for (const key of VARLOCK_KEYS) {
    if (key in initialEnv) {
      expect(process.env[key]).toBe(initialEnv[key]);
    } else {
      expect(Object.hasOwn(process.env, key)).toBe(false);
    }
  }
  expect(Object.hasOwn(globalThis, "__varlockLoadedEnv")).toBe(hadLoadedEnv);
  expect(Reflect.get(globalThis, "__varlockLoadedEnv")).toBe(initialLoadedEnv);
});
