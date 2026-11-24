import type { Locale } from "@your-league-coach/lol-data/ddragon";

import type { LcuLocale } from "../lib/desktop/events";
import type { LanguageSetting } from "../lib/settings";
import { type Dictionary, en } from "./en";
import { fr } from "./fr";

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

type DictionaryNode = string | { [key: string]: DictionaryNode };

type Leaves<Node> = {
  [Key in keyof Node & string]: Node[Key] extends string
    ? Key
    : `${Key}.${Leaves<Node[Key]>}`;
}[keyof Node & string];

/** Dot path of a text in the dictionaries, such as `home.client.title`. */
export type TranslationKey = Leaves<Dictionary>;
export type TranslationParams = Record<string, string | number>;
export type Translate = (
  key: TranslationKey,
  params?: TranslationParams
) => string;

export const flattenDictionary = (
  node: DictionaryNode,
  prefix = ""
): [path: string, text: string][] =>
  typeof node === "string"
    ? [[prefix, node]]
    : Object.entries(node).flatMap(([key, child]) =>
        flattenDictionary(child, prefix === "" ? key : `${prefix}.${key}`)
      );

const TEXTS: Record<Language, ReadonlyMap<string, string>> = {
  en: new Map(flattenDictionary(en)),
  fr: new Map(flattenDictionary(fr)),
};

const PLACEHOLDER = /\{(\w+)\}/g;

export const translate = (
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {}
): string => {
  const text = TEXTS[language].get(key) ?? key;
  return text.replace(PLACEHOLDER, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder
  );
};

/**
 * An explicit setting wins. "auto" follows the League client once it has told
 * us its locale, and the system language until then.
 */
export const resolveLanguage = (
  setting: LanguageSetting,
  clientLocale: LcuLocale | null,
  systemLanguage: string
): Language => {
  if (setting !== "auto") {
    return setting;
  }
  if (clientLocale !== null) {
    return clientLocale === "fr_FR" ? "fr" : "en";
  }
  return systemLanguage.toLowerCase().startsWith("fr") ? "fr" : "en";
};

const DDRAGON_LOCALES: Record<Language, Locale> = { en: "en_US", fr: "fr_FR" };

export const ddragonLocale = (language: Language): Locale =>
  DDRAGON_LOCALES[language];
