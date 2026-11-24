import {
  type PreferenceItem,
  PreferenceSection,
} from "@your-league-coach/ui/components/blocks/settings-9/components/workspace-preferences";
import { Input } from "@your-league-coach/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@your-league-coach/ui/components/select";
import { Switch } from "@your-league-coach/ui/components/switch";
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

function LanguageSelect({
  onChange,
  value,
}: {
  onChange: (language: LanguageSetting) => void;
  value: LanguageSetting;
}) {
  const t = useT();
  const handleChange = useCallback(
    (next: LanguageSetting | null) => {
      if (next !== null) {
        onChange(next);
      }
    },
    [onChange]
  );

  return (
    <Select onValueChange={handleChange} value={value}>
      <SelectTrigger aria-label={t("settings.language.title")} className="w-40">
        <SelectValue>{t(`settings.language.${value}`)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {LANGUAGE_SETTINGS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`settings.language.${option}`)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

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
    (next: LanguageSetting) => persist({ language: next }),
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

  const items: PreferenceItem[] = [
    {
      id: "language",
      title: t("settings.language.title"),
      description: t("settings.language.description"),
      badge:
        settings.language === "auto"
          ? {
              label: t("settings.language.detected", {
                language: t(`settings.language.${language}`),
              }),
              variant: "info-light",
            }
          : undefined,
      control: (
        <LanguageSelect onChange={setLanguage} value={settings.language} />
      ),
    },
    {
      id: "auto-import",
      title: t("settings.autoImport.title"),
      description: t("settings.autoImport.description"),
      control: (
        <Switch
          aria-label={t("settings.autoImport.title")}
          checked={settings.autoImport}
          onCheckedChange={setAutoImport}
        />
      ),
    },
    {
      id: "lockfile",
      title: t("settings.lockfile.title"),
      description: t("settings.lockfile.description"),
      control: (
        <LockfileInput
          onCommit={setLockfilePath}
          value={settings.lockfilePath}
        />
      ),
    },
  ];

  return (
    <PreferenceSection items={items} title={t("settings.preferences.title")} />
  );
}
