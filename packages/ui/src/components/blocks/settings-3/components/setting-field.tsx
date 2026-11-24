import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@your-league-coach/ui/components/field";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

interface SettingFieldProps {
  badge?: {
    label: string;
    variant: ComponentProps<typeof Badge>["variant"];
  };
  children: ReactNode;
  contentClassName?: string;
  description: string;
  /** Marks the row invalid; the control inside carries `aria-invalid`. */
  invalid?: boolean;
  labelFor?: string;
  last?: boolean;
  title: string;
}

// ── Setting Field ──

export function SettingField({
  title,
  description,
  badge,
  children,
  invalid,
  last,
  labelFor,
  contentClassName,
}: SettingFieldProps) {
  return (
    <>
      <Field
        orientation="responsive"
        data-invalid={invalid}
        className="gap-4 px-4 py-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 @md/field-group:max-w-sm">
          <div className="flex flex-wrap items-center gap-2">
            {labelFor ? (
              <FieldLabel htmlFor={labelFor}>{title}</FieldLabel>
            ) : (
              <FieldTitle>{title}</FieldTitle>
            )}

            {badge ? (
              <Badge variant={badge.variant}>{badge.label}</Badge>
            ) : null}
          </div>

          <FieldDescription className="text-xs">{description}</FieldDescription>
        </div>

        <FieldContent
          className={cn("min-w-0 @md/field-group:w-78", contentClassName)}
        >
          {children}
        </FieldContent>
      </Field>

      {last ? null : <FieldSeparator />}
    </>
  );
}
