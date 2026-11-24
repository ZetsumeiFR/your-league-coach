import { FieldGroup } from "@your-league-coach/ui/components/field";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@your-league-coach/ui/components/reui/frame";
import type { ReactNode } from "react";

interface GeneralSettingsProps {
  children: ReactNode;
  description: string;
  footer: ReactNode;
  title: string;
}

/**
 * ReUI settings-3 with its demo rows replaced: the frame, its row list and its
 * footer bar are as shipped; the rows and the footer buttons come from the
 * caller, which owns the form state.
 */
export function GeneralSettings({
  children,
  description,
  footer,
  title,
}: GeneralSettingsProps) {
  return (
    <Frame className="w-full max-w-3xl">
      <FrameHeader className="px-2! py-2.5!">
        <FrameTitle>{title}</FrameTitle>
        <FrameDescription>{description}</FrameDescription>
      </FrameHeader>

      <FramePanel className="p-0">
        <FieldGroup className="gap-0">{children}</FieldGroup>
      </FramePanel>

      <FrameFooter className="flex flex-row justify-end gap-3">
        {footer}
      </FrameFooter>
    </Frame>
  );
}
