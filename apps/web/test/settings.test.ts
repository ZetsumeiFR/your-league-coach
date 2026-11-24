import { describe, expect, it } from "bun:test";

import {
  connectionSchema,
  displayAddress,
  normalizeServerUrl,
  parseStoredSettings,
  type Settings,
} from "../src/lib/settings";

const ACCESS_KEY = "k".repeat(32);

const saveServerUrl = (serverUrl: string) => {
  const parsed = connectionSchema.safeParse({
    serverUrl,
    accessKey: ACCESS_KEY,
  });
  return parsed.success
    ? { url: parsed.data.serverUrl }
    : { issue: parsed.error.issues[0]?.message };
};

describe("server URL", () => {
  it.each([
    ["coach.example.com", "https://coach.example.com"],
    ["https://coach.example.com/", "https://coach.example.com"],
    ["https://coach.example.com/api", "https://coach.example.com/api"],
    ["localhost:3000", "http://localhost:3000"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["https://localhost:3000", "https://localhost:3000"],
    ["  coach.example.com  ", "https://coach.example.com"],
    ["//coach.example.com", "https://coach.example.com"],
    ["HTTPS://Coach.Example.COM:443/api/", "https://coach.example.com/api"],
    ["https://[2001:db8::1]:8443", "https://[2001:db8::1]:8443"],
    ["", ""],
  ])("saves %p as %p", (typed, saved) => {
    expect(saveServerUrl(typed)).toEqual({ url: saved });
  });

  it.each([
    ["http://example.com", "insecure"],
    ["http://localhost.example.com", "insecure"],
    ["http://127.0.0.1.example.com:3000", "insecure"],
    ["http://192.168.1.10:3000", "insecure"],
    ["http://[::1]:3000", "insecure"],
    ["https://my_server.example.com", "invalid"],
    [`https://${"a".repeat(64)}.example.com`, "invalid"],
    ["https://coach.example.com.", "invalid"],
    ["https:\\\\coach.example.com", "invalid"],
    ["https://coach.example.com/a b", "invalid"],
    ["ftp://coach.example.com", "invalid"],
    ["https://", "invalid"],
    ["https://coach.example.com?key=1", "invalid"],
    ["https://coach.example.com#top", "invalid"],
    ["https://user:secret@coach.example.com", "credentials"],
  ])("refuses %p as %p", (typed, issue) => {
    expect(saveServerUrl(typed)).toEqual({ issue });
  });

  it("refuses an address longer than 2048 characters", () => {
    const path = "a".repeat(2048);
    expect(saveServerUrl(`https://coach.example.com/${path}`)).toEqual({
      issue: "invalid",
    });
  });

  it.each([
    "https://coach.example.com",
    "https://coach.example.com/api",
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
  ])("shows %p in a form that saves back unchanged", (saved) => {
    expect(normalizeServerUrl(displayAddress(saved))).toBe(saved);
  });
});

describe("access key", () => {
  it("is trimmed", () => {
    const parsed = connectionSchema.parse({
      serverUrl: "",
      accessKey: `  ${ACCESS_KEY}\n`,
    });
    expect(parsed.accessKey).toBe(ACCESS_KEY);
  });

  it("accepts 512 characters and refuses more", () => {
    const save = (accessKey: string) =>
      connectionSchema.safeParse({ serverUrl: "", accessKey });
    expect(save("k".repeat(512)).success).toBe(true);
    expect(save("k".repeat(513)).error?.issues[0]?.message).toBe("length");
  });

  it.each(["clé-secrète", "line\nbreak", "tab\tkey"])(
    "refuses %p, which a request header cannot carry",
    (accessKey) => {
      const parsed = connectionSchema.safeParse({ serverUrl: "", accessKey });
      expect(parsed.error?.issues[0]?.message).toBe("characters");
    }
  );
});

describe("stored settings", () => {
  const defaults: Settings = {
    serverUrl: "https://default.example.com",
    accessKey: "",
    language: "auto",
    autoImport: false,
    lockfilePath: null,
  };

  it("keeps valid stored values", () => {
    const stored = {
      serverUrl: "https://coach.example.com",
      accessKey: ACCESS_KEY,
      language: "fr",
      autoImport: true,
      lockfilePath: "C:\\Riot Games\\League of Legends\\lockfile",
    };
    expect(parseStoredSettings(stored, defaults)).toEqual(stored);
  });

  it("uses the default for a key that was never saved", () => {
    expect(parseStoredSettings({}, defaults)).toEqual(defaults);
  });

  it("uses the default for a stored value that is no longer acceptable", () => {
    const stored = {
      serverUrl: "http://example.com",
      language: "de",
      autoImport: "yes",
      lockfilePath: 42,
    };
    expect(parseStoredSettings(stored, defaults)).toEqual(defaults);
  });

  it("reads a blank lockfile path as automatic detection", () => {
    const parsed = parseStoredSettings({ lockfilePath: "   " }, defaults);
    expect(parsed.lockfilePath).toBeNull();
  });
});
