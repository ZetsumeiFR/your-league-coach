import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@your-league-coach/ui/components/empty";
import type { ComponentType, ReactNode } from "react";

interface PanelNoticeProps {
  action?: ReactNode;
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}

export function PanelNotice({
  action,
  description,
  icon: Icon,
  title,
}: PanelNoticeProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
