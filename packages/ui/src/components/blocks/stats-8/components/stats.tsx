import { Item, ItemMedia } from "@your-league-coach/ui/components/item";
import {
  Badge,
  type BadgeProps,
} from "@your-league-coach/ui/components/reui/badge";
import { Frame, FramePanel } from "@your-league-coach/ui/components/reui/frame";
import type { ReactNode } from "react";

export interface StatCard {
  badge?: { color: BadgeProps["variant"]; icon?: ReactNode; text: string };
  detail: ReactNode;
  icon: ReactNode;
  /** Text color class that tints the icon tile, such as `text-success`. */
  iconColor: string;
  id: string;
  title: string;
  value: ReactNode;
}

/**
 * ReUI stats-8, adapted: the tiles come from props, the value is any node (a
 * state word or a figure the caller formats) and the last line is free text
 * instead of a date range.
 */
export function Stats({ cards }: { cards: StatCard[] }) {
  return (
    <div className="@container grid w-full grow grid-cols-1 gap-4 @2xl:grid-cols-3">
      {cards.map((card) => (
        <Frame key={card.id}>
          <FramePanel className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <Item
                className={`border-background bg-muted flex size-10.5 items-center justify-center border-2 p-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-5 ${card.iconColor}`}
              >
                <ItemMedia variant="icon" className="size-auto">
                  {card.icon}
                </ItemMedia>
              </Item>
              {card.badge ? (
                <Badge variant={card.badge.color}>
                  {card.badge.icon}
                  {card.badge.text}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-sm font-medium">
                {card.title}
              </div>
              <div className="text-foreground text-3xl font-bold tracking-tight">
                {card.value}
              </div>
            </div>

            <div className="text-muted-foreground text-xs">{card.detail}</div>
          </FramePanel>
        </Frame>
      ))}
    </div>
  );
}
