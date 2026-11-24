import { translate } from "@/i18n/translate";
import { useLanguage, useT } from "@/i18n/use-t";

/**
 * Riot's required notice (https://developer.riotgames.com/policies/general).
 * In another language than English the translation comes first and Riot's own
 * English wording follows, marked as the official text.
 */
export function LegalNotice() {
  const t = useT();
  const language = useLanguage();

  return (
    <footer className="flex max-w-prose flex-col gap-2 text-muted-foreground text-xs">
      <h2 className="sr-only">{t("legal.title")}</h2>
      <p>{t("legal.notice")}</p>
      {language === "en" ? null : (
        <p>
          {t("legal.official")}{" "}
          <span lang="en">{translate("en", "legal.notice")}</span>
        </p>
      )}
    </footer>
  );
}
