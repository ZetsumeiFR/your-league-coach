import {
  type PreferenceSection,
  WorkspacePreferences,
} from "@your-league-coach/ui/components/blocks/settings-9/components/workspace-preferences";
import { Input } from "@your-league-coach/ui/components/input";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/use-t";
import {
  LANGUAGE_SETTINGS,
  type LanguageSetting,
  lockfilePathSchema,
} from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";

import { usePersistSettings } from "./use-persist-settings";

/** Target of the "set the lockfile path" link on the home screen. */
export const LOCKFILE_INPUT_ID = "settings-lockfile";

const isLanguageSetting = (value: string): value is LanguageSetting =>
  LANGUAGE_SETTINGS.some((option) => option === value);

/** A path is applied when the field loses focus or on Enter, not on each keystroke. */
function LockfileInput({
  onCommit,
  value,
}: {
  onCommit: (path: string | null) => void;
  value: string | null;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value ?? "");
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    []
  );
  const handleBlur = useCallback(() => {
    const path = lockfilePathSchema.parse(draft);
    setDraft(path ?? "");
    if (path !== value) {
      onCommit(path);
    }
  }, [draft, onCommit, value]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    },
    []
  );

  return (
    <Input
      aria-label={t("settings.lockfile.title")}
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      className="w-64 max-w-full"
      id={LOCKFILE_INPUT_ID}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={t("settings.lockfile.placeholder")}
      spellCheck={false}
      value={draft}
    />
  );
}

/** Preferences take effect as soon as they change; there is nothing to save. */
export function Preferences() {
  const t = useT();
  const language = useLanguage();
  const settings = useSettings();
  const persist = usePersistSettings();

  const setLanguage = useCallback(
    (value: string) => {
      if (isLanguageSetting(value)) {
        persist({ language: value });
      }
    },
    [persist]
  );
  const setAutoImport = useCallback(
    (autoImport: boolean) => persist({ autoImport }),
    [persist]
  );
  const setLockfilePath = useCallback(
    async (lockfilePath: string | null) => {
      if (await persist({ lockfilePath })) {
        toast.success(t("settings.lockfile.saved"));
      }
    },
    [persist, t]
  );

  const sections: PreferenceSection[] = [
    {
      id: "general",
      title: t("settings.preferences.general"),
      items: [
        {
          id: "language",
          title: t("settings.language.title"),
          description:
            settings.language === "auto"
              ? t("settings.language.descriptionDetected", {
                  language: t(`settings.language.${language}`),
                })
              : t("settings.language.description"),
          control: "select",
          options: LANGUAGE_SETTINGS.map((option) => ({
            label: t(`settings.language.${option}`),
            value: option,
          })),
          value: settings.language,
          onValueChange: setLanguage,
        },
        {
          id: "auto-import",
          title: t("settings.autoImport.title"),
          description: t("settings.autoImport.description"),
          control: "switch",
          checked: settings.autoImport,
          onCheckedChange: setAutoImport,
        },
        {
          id: "lockfile",
          title: t("settings.lockfile.title"),
          description: t("settings.lockfile.description"),
          control: "custom",
          children: (
            <LockfileInput
              onCommit={setLockfilePath}
              value={settings.lockfilePath}
            />
          ),
        },
      ],
    },
  ];

  return (
    <WorkspacePreferences
      description={t("settings.preferences.description")}
      sections={sections}
      title={t("settings.preferences.title")}
    />
  );
}
