import { describe, expect, it } from "bun:test";

import { en } from "../src/i18n/en";
import { fr } from "../src/i18n/fr";
import {
  flattenDictionary,
  resolveLanguage,
  translate,
} from "../src/i18n/translate";

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholdersOf = (text: string) =>
  [...text.matchAll(PLACEHOLDER)].map(([, name]) => name).sort();

describe("dictionaries", () => {
  const english = new Map(flattenDictionary(en));
  const french = new Map(flattenDictionary(fr));

  it("define the same keys in French and English", () => {
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("take the same parameters in French as in English", () => {
    const mismatched = [...english].filter(
      ([key, text]) =>
        placeholdersOf(french.get(key) ?? "").join() !==
        placeholdersOf(text).join()
    );
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it("leave no text empty", () => {
    const empty = [...english, ...french].filter(
      ([, text]) => text.trim() === ""
    );
    expect(empty).toEqual([]);
  });
});

describe("translate", () => {
  it("fills the parameters of a text", () => {
    const text = translate("fr", "home.patch.games", { sr: 2010, aram: 150 });
    expect(text).toContain("2010");
    expect(text).toContain("150");
    expect(text).not.toContain("{");
  });
});

describe("resolveLanguage", () => {
  it("uses an explicit setting whatever the client and the system say", () => {
    expect(resolveLanguage("en", "fr_FR", "fr-FR")).toBe("en");
    expect(resolveLanguage("fr", "en_US", "en-US")).toBe("fr");
  });

  it("follows the League client when the setting is auto", () => {
    expect(resolveLanguage("auto", "fr_FR", "en-US")).toBe("fr");
    expect(resolveLanguage("auto", "en_US", "fr-FR")).toBe("en");
  });

  it("falls back to the system language until the client is known", () => {
    expect(resolveLanguage("auto", null, "fr-CA")).toBe("fr");
    expect(resolveLanguage("auto", null, "de-DE")).toBe("en");
  });
});
