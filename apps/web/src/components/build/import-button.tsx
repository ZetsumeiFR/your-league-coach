import type { BuildRecommendation } from "@your-league-coach/lol-data/types";
import { Button } from "@your-league-coach/ui/components/button";
import { Field, FieldLabel } from "@your-league-coach/ui/components/field";
import { Switch } from "@your-league-coach/ui/components/switch";
import { type MouseEvent, useCallback, useId } from "react";

import { ButtonIcon } from "@/components/button-icon";
import { appIcons } from "@/components/icons";
import { usePersistSettings } from "@/components/settings/use-persist-settings";
import { useT } from "@/i18n/use-t";
import { useImportState } from "@/lib/desktop/import";
import { useSettings } from "@/lib/settings-store";

import { useImportBuild } from "./use-import-build";

export function AutoImportSwitch() {
  const t = useT();
  const { autoImport } = useSettings();
  const persist = usePersistSettings();
  const switchId = useId();
  const setAutoImport = useCallback(
    (checked: boolean) => persist({ autoImport: checked }),
    [persist]
  );

  // A Field fills its container: the wrapper keeps it as wide as its label.
  return (
    <div className="w-fit">
      <Field orientation="horizontal">
        <Switch
          checked={autoImport}
          id={switchId}
          onCheckedChange={setAutoImport}
        />
        <FieldLabel htmlFor={switchId}>
          {t("settings.autoImport.title")}
        </FieldLabel>
      </Field>
    </div>
  );
}

export function ImportButton({ build }: { build: BuildRecommendation }) {
  const t = useT();
  const { isImporting } = useImportState();
  const importBuild = useImportBuild();
  const handleClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      // `detail` counts the clicks of a double click: only its first one imports.
      const isRepeatedClick = event.detail > 1;
      if (!isRepeatedClick) {
        await importBuild(build);
      }
    },
    [build, importBuild]
  );

  return (
    <Button
      aria-busy={isImporting}
      disabled={isImporting}
      onClick={handleClick}
      size="sm"
    >
      <ButtonIcon
        className={isImporting ? "animate-spin" : undefined}
        icon={isImporting ? appIcons.loading : appIcons.import}
      />
      {t("build.import.action")}
    </Button>
  );
}
