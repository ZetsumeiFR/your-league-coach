import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@your-league-coach/ui/components/empty";
import { Frame, FramePanel } from "@your-league-coach/ui/components/reui/frame";
import { IconStack } from "@your-league-coach/ui/components/reui/icon-stack";
import type { ComponentType, ReactNode } from "react";

interface IdleStateProps {
  action?: ReactNode;
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}

export function IdleState({
  action,
  description,
  icon: Icon,
  title,
}: IdleStateProps) {
  return (
    <Frame>
      <FramePanel>
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia>
              <IconStack aria-hidden="true" className="h-24 w-22 text-primary">
                <Icon className="size-5 text-primary" />
              </IconStack>
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          {action ? (
            <EmptyContent className="flex-row justify-center gap-2">
              {action}
            </EmptyContent>
          ) : null}
        </Empty>
      </FramePanel>
    </Frame>
  );
}
