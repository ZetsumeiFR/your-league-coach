import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@your-league-coach/ui/components/collapsible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@your-league-coach/ui/components/item";
import {
  Badge,
  type BadgeProps,
} from "@your-league-coach/ui/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@your-league-coach/ui/components/reui/frame";
import { Separator } from "@your-league-coach/ui/components/separator";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface PreferenceItem {
  badge?: { label: string; variant: BadgeProps["variant"] };
  /** The row's control; it carries its own accessible name. */
  control: ReactNode;
  description: string;
  id: string;
  title: string;
}

// ── Preference row ──

function PreferenceRow({ item }: { item: PreferenceItem }) {
  return (
    <Item className="px-4">
      {/* Content */}
      <ItemContent>
        <ItemTitle className="gap-2">
          {item.title}
          {item.badge ? (
            <Badge variant={item.badge.variant}>{item.badge.label}</Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription>{item.description}</ItemDescription>
      </ItemContent>

      {/* Actions */}
      <ItemActions>{item.control}</ItemActions>
    </Item>
  );
}

// ── Main component ──

/**
 * One collapsible section of ReUI settings-9, adapted: the rows come from
 * props and each row's control is a node the caller wires to its own state.
 * The page heading and the list of sections are left to the route.
 */
export function PreferenceSection({
  items,
  title,
}: {
  items: PreferenceItem[];
  title: string;
}) {
  return (
    <Frame stacked dense spacing="sm">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full">
          <FrameHeader className="flex grow flex-row items-center justify-between gap-2 px-4 py-2">
            <FrameTitle>{title}</FrameTitle>
            <ChevronRightIcon
              className="text-muted-foreground mr-2 size-4 transition-transform in-data-open:rotate-90"
              aria-hidden="true"
            />
          </FrameHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <FramePanel className="p-0!">
            {items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Separator />}
                <PreferenceRow item={item} />
              </div>
            ))}
          </FramePanel>
        </CollapsibleContent>
      </Collapsible>
    </Frame>
  );
}
