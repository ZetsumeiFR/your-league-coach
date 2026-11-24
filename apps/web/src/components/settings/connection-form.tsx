import { useForm } from "@tanstack/react-form";
import { GeneralSettings } from "@your-league-coach/ui/components/blocks/settings-3/components/general-settings";
import { SettingField } from "@your-league-coach/ui/components/blocks/settings-3/components/setting-field";
import { Button } from "@your-league-coach/ui/components/button";
import { FieldError } from "@your-league-coach/ui/components/field";
import { Input } from "@your-league-coach/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@your-league-coach/ui/components/input-group";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import { ButtonIcon } from "@/components/button-icon";
import { appIcons } from "@/components/icons";
import type { Translate } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";
import {
  ACCESS_KEY_ISSUES,
  connectionSchema,
  displayAddress,
  hasExplicitScheme,
  impliedScheme,
  isConnectionConfigured,
  SERVER_URL_ISSUES,
} from "@/lib/settings";
import { useSettings } from "@/lib/settings-store";
import { classifyServerError, client, orpc, queryClient } from "@/utils/orpc";

import { usePersistSettings } from "./use-persist-settings";

const SERVER_URL_ID = "settings-server-url";
const ACCESS_KEY_ID = "settings-access-key";
/** In form order, so the first refused field is the one that takes focus. */
const CONTROL_IDS = [
  ["serverUrl", SERVER_URL_ID],
  ["accessKey", ACCESS_KEY_ID],
] as const;

interface FieldErrors {
  getFieldMeta: (
    field: (typeof CONTROL_IDS)[number][0]
  ) => { errors: unknown[] } | undefined;
}

/** After a refused Save or Test, focus goes to the first field to correct. */
const focusFirstRefusedField = (form: FieldErrors) => {
  const refused = CONTROL_IDS.find(
    ([field]) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0
  );
  if (refused) {
    document.getElementById(refused[1])?.focus();
  }
};

/*
 * Checked on Save and Test only, and nothing runs when a field loses focus.
 * Anything that shows or hides the message on blur does it between the press
 * and the release of a click on a button below the field, which moves that
 * button from under the pointer and loses the click.
 */
const SERVER_URL_VALIDATORS = {
  onSubmit: connectionSchema.shape.serverUrl,
};
const ACCESS_KEY_VALIDATORS = {
  onSubmit: connectionSchema.shape.accessKey,
};

const serverUrlError = (t: Translate, code: string | undefined) => {
  const issue = SERVER_URL_ISSUES.find((known) => known === code);
  return issue ? t(`settings.serverUrl.errors.${issue}`) : undefined;
};

const accessKeyError = (t: Translate, code: string | undefined) => {
  const issue = ACCESS_KEY_ISSUES.find((known) => known === code);
  return issue ? t(`settings.accessKey.errors.${issue}`) : undefined;
};

const selectCanSave = (state: {
  isDefaultValue: boolean;
  isSubmitting: boolean;
}) => !(state.isDefaultValue || state.isSubmitting);

interface ControlProps {
  error: string | undefined;
  onValueChange: (value: string) => void;
  value: string;
}

function ServerUrlControl({ error, onValueChange, value }: ControlProps) {
  const t = useT();
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
    [onValueChange]
  );
  const errorId = `${SERVER_URL_ID}-error`;

  return (
    <>
      <InputGroup className="w-full">
        {hasExplicitScheme(value) ? null : (
          <InputGroupAddon align="inline-start">
            <InputGroupText>{impliedScheme(value)}</InputGroupText>
          </InputGroupAddon>
        )}
        <InputGroupInput
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error !== undefined}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          id={SERVER_URL_ID}
          inputMode="url"
          onChange={handleChange}
          placeholder={t("settings.serverUrl.placeholder")}
          spellCheck={false}
          value={value}
        />
      </InputGroup>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
}

function AccessKeyControl({ error, onValueChange, value }: ControlProps) {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
    [onValueChange]
  );
  const errorId = `${ACCESS_KEY_ID}-error`;

  return (
    <>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error !== undefined}
        autoComplete="off"
        id={ACCESS_KEY_ID}
        onChange={handleChange}
        spellCheck={false}
        type="password"
        value={value}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
}

/**
 * Server URL and access key. They are saved together, on Save only, so a
 * half-typed address is never used for requests. "Test connection" asks the
 * server with the values in the form, saved or not.
 */
export function ConnectionForm() {
  const t = useT();
  const settings = useSettings();
  const persist = usePersistSettings();
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm({
    defaultValues: {
      serverUrl: displayAddress(settings.serverUrl),
      accessKey: settings.accessKey,
    },
    onSubmit: async ({ formApi, value }) => {
      const connection = connectionSchema.parse(value);
      if (!(await persist(connection))) {
        return;
      }
      formApi.reset({
        serverUrl: displayAddress(connection.serverUrl),
        accessKey: connection.accessKey,
      });
      // Answers cached from the previous server must not be shown for this one.
      await queryClient.resetQueries({ queryKey: orpc.key() });
      toast.success(t("settings.saved"));
    },
  });

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await form.handleSubmit();
      focusFirstRefusedField(form);
    },
    [form]
  );
  const handleReset = useCallback(() => form.reset(), [form]);

  const handleTest = useCallback(async () => {
    const parsed = connectionSchema.safeParse(form.state.values);
    if (!parsed.success) {
      await form.validateAllFields("submit");
      focusFirstRefusedField(form);
      return;
    }
    const connection = parsed.data;
    if (!isConnectionConfigured(connection)) {
      toast.error(t("settings.test.missing"));
      return;
    }
    setIsTesting(true);
    try {
      const { patch } = await client.coach.meta(undefined, {
        context: { connection },
      });
      toast.success(
        patch
          ? t("settings.test.success", { patch })
          : t("settings.test.successNoPatch")
      );
    } catch (error) {
      const failure = classifyServerError(error);
      toast.error(
        t(`settings.test.${failure}`, {
          host: new URL(connection.serverUrl).host,
        })
      );
    } finally {
      setIsTesting(false);
    }
  }, [form, t]);

  return (
    <form noValidate onSubmit={handleSubmit}>
      <GeneralSettings
        description={t("settings.connection.description")}
        footer={
          <form.Subscribe selector={selectCanSave}>
            {(canSave) => (
              <>
                <Button
                  disabled={!canSave}
                  onClick={handleReset}
                  type="button"
                  variant="outline"
                >
                  {t("settings.reset")}
                </Button>
                <Button disabled={!canSave} type="submit">
                  {t("settings.save")}
                </Button>
              </>
            )}
          </form.Subscribe>
        }
        title={t("settings.connection.title")}
      >
        <form.Field name="serverUrl" validators={SERVER_URL_VALIDATORS}>
          {(field) => {
            const error = serverUrlError(
              t,
              field.state.meta.errors[0]?.message
            );
            return (
              <SettingField
                description={t("settings.serverUrl.description")}
                invalid={error !== undefined}
                labelFor={SERVER_URL_ID}
                title={t("settings.serverUrl.title")}
              >
                <ServerUrlControl
                  error={error}
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </SettingField>
            );
          }}
        </form.Field>

        <form.Field name="accessKey" validators={ACCESS_KEY_VALIDATORS}>
          {(field) => {
            const error = accessKeyError(
              t,
              field.state.meta.errors[0]?.message
            );
            return (
              <SettingField
                description={t("settings.accessKey.description")}
                invalid={error !== undefined}
                labelFor={ACCESS_KEY_ID}
                title={t("settings.accessKey.title")}
              >
                <AccessKeyControl
                  error={error}
                  onValueChange={field.handleChange}
                  value={field.state.value}
                />
              </SettingField>
            );
          }}
        </form.Field>

        <SettingField
          description={t("settings.test.description")}
          last
          title={t("settings.test.title")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              aria-busy={isTesting}
              disabled={isTesting}
              onClick={handleTest}
              type="button"
              variant="outline"
            >
              <ButtonIcon
                className={isTesting ? "animate-spin" : undefined}
                icon={isTesting ? appIcons.loading : appIcons.refresh}
              />
              {t("settings.test.action")}
            </Button>
          </div>
        </SettingField>
      </GeneralSettings>
    </form>
  );
}
