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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@your-league-coach/ui/components/select";
import { Separator } from "@your-league-coach/ui/components/separator";
import { Switch } from "@your-league-coach/ui/components/switch";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

// ── Types ──

export interface SelectOption {
  label: string;
  value: string;
}

export interface PreferenceBadge {
  label: string;
  variant: BadgeProps["variant"];
}

interface PreferenceBase {
  badge?: PreferenceBadge;
  description: string;
  id: string;
  title: string;
}

/**
 * A row and its control. `select` and `switch` are the block's own controls,
 * driven by the caller's state; `custom` carries a control the block has no
 * markup for.
 */
export type PreferenceItem =
  | (PreferenceBase & {
      control: "select";
      onValueChange: (value: string) => void;
      options: SelectOption[];
      value: string;
    })
  | (PreferenceBase & {
      checked: boolean;
      control: "switch";
      onCheckedChange: (checked: boolean) => void;
    })
  | (PreferenceBase & { children: ReactNode; control: "custom" });

export interface PreferenceSection {
  id: string;
  items: PreferenceItem[];
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
            <Badge variant={item.badge.variant} size="sm">
              {item.badge.label}
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription>{item.description}</ItemDescription>
      </ItemContent>

      {/* Actions */}
      <ItemActions>
        {item.control === "select" && (
          <Select
            value={item.value}
            onValueChange={(value) => {
              if (value !== null) {
                item.onValueChange(value);
              }
            }}
          >
            <SelectTrigger className="w-40" aria-label={item.title}>
              <SelectValue>
                {getOptionLabel(item.options, item.value)}
              </SelectValue>
            </SelectTrigger>

            <SelectContent>
              <SelectGroup>
                {item.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        {item.control === "switch" && (
          <Switch
            checked={item.checked}
            onCheckedChange={item.onCheckedChange}
            aria-label={item.title}
          />
        )}
        {item.control === "custom" && item.children}
      </ItemActions>
    </Item>
  );
}

// ── Get Option Label ──

function getOptionLabel(options: SelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

// ── Main component ──

interface WorkspacePreferencesProps {
  description: string;
  sections: PreferenceSection[];
  title: string;
}

/**
 * ReUI settings-9 with its demo data replaced: the heading text and the
 * sections come from props, and each select or switch reads and reports its
 * value through the row instead of holding demo state.
 */
export function WorkspacePreferences({
  description,
  sections,
  title,
}: WorkspacePreferencesProps) {
  return (
    <div className="w-full max-w-2xl space-y-5">
      {/* Heading */}
      <div className="space-y-0.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      {sections.map((section) => (
        <Frame key={section.id} stacked dense spacing="sm">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full">
              <FrameHeader className="flex grow flex-row items-center justify-between gap-2 px-4 py-2">
                <FrameTitle>{section.title}</FrameTitle>
                <ChevronRightIcon
                  className="text-muted-foreground mr-2 size-4 transition-transform in-data-open:rotate-90"
                  aria-hidden="true"
                />
              </FrameHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <FramePanel className="p-0!">
                {section.items.map((item, index) => (
                  <div key={item.id}>
                    {index > 0 && <Separator />}
                    <PreferenceRow item={item} />
                  </div>
                ))}
              </FramePanel>
            </CollapsibleContent>
          </Collapsible>
        </Frame>
      ))}
    </div>
  );
}
