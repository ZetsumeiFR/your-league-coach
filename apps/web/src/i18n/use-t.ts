import { useCallback } from "react";

import { useDesktop } from "../lib/desktop/store";
import { useSettings } from "../lib/settings-store";
import {
  type Language,
  resolveLanguage,
  type Translate,
  translate,
} from "./translate";

export const useLanguage = (): Language => {
  const { language } = useSettings();
  const { locale } = useDesktop();
  return resolveLanguage(language, locale, navigator.language);
};

export const useT = (): Translate => {
  const language = useLanguage();
  return useCallback(
    (key, params) => translate(language, key, params),
    [language]
  );
};
