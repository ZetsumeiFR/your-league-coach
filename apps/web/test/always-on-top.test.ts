import { describe, expect, it } from "bun:test";

import {
  isAlwaysOnTop,
  setAlwaysOnTop,
  type WindowCommands,
} from "../src/lib/desktop/always-on-top";

const accepting = () => {
  const asked: boolean[] = [];
  const commands: WindowCommands = {
    setAlwaysOnTop: (alwaysOnTop) => {
      asked.push(alwaysOnTop);
      return Promise.resolve();
    },
  };
  return { asked, commands };
};

describe("always on top", () => {
  it("follows each change the window accepted", async () => {
    const { asked, commands } = accepting();
    expect(await setAlwaysOnTop(true, commands)).toBe(true);
    expect(isAlwaysOnTop()).toBe(true);
    expect(await setAlwaysOnTop(false, commands)).toBe(true);
    expect(isAlwaysOnTop()).toBe(false);
    expect(asked).toEqual([true, false]);
  });

  it("stays as it was when the window refuses, and can be asked again", async () => {
    await setAlwaysOnTop(false, accepting().commands);
    const refusing: WindowCommands = {
      setAlwaysOnTop: () => Promise.reject(new Error("refused by the window")),
    };
    await expect(setAlwaysOnTop(true, refusing)).rejects.toThrow(
      "refused by the window"
    );
    expect(isAlwaysOnTop()).toBe(false);

    expect(await setAlwaysOnTop(true, accepting().commands)).toBe(true);
    expect(isAlwaysOnTop()).toBe(true);
  });

  it("asks nothing while an earlier change is pending", async () => {
    await setAlwaysOnTop(false, accepting().commands);
    const held = Promise.withResolvers<void>();
    const first = setAlwaysOnTop(true, { setAlwaysOnTop: () => held.promise });
    const second = accepting();
    expect(await setAlwaysOnTop(false, second.commands)).toBe(false);
    expect(second.asked).toEqual([]);
    expect(isAlwaysOnTop()).toBe(false);

    held.resolve();
    expect(await first).toBe(true);
    expect(isAlwaysOnTop()).toBe(true);
  });
});
