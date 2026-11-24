import { Item, ItemMedia } from "@your-league-coach/ui/components/item";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@your-league-coach/ui/components/sidebar";
import { cn } from "cn";
import type { ReactElement, ReactNode } from "react";

import { useSidebarLink } from "./use-sidebar-link";

function BrandTile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Item
      className={cn(
        "p-0",
        "bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center",
        className
      )}
      aria-hidden="true"
    >
      <ItemMedia variant="icon" className="size-auto">
        {children}
      </ItemMedia>
    </Item>
  );
}

function SidebarLogo({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center",
        className
      )}
    >
      <BrandTile className="absolute top-1/2 left-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-75">
        {children}
      </BrandTile>
    </span>
  );
}

interface SidebarBrandProps {
  mark: ReactNode;
  name: string;
  render: ReactElement;
}

/**
 * Top row of the ReUI app-shell-1 sidebar. It keeps the trigger row of the
 * block's workspace switcher (logo tile and name) without the menu: the app
 * has a single workspace.
 */
export function SidebarBrand({ mark, name, render }: SidebarBrandProps) {
  const link = useSidebarLink(name);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="h-9"
          tooltip={link.tooltip}
          render={render}
          onClick={link.closeSheet}
        >
          <SidebarLogo className="transition-[margin] duration-300 ease-in-out in-data-[state=collapsed]:-ml-1">
            {mark}
          </SidebarLogo>
          <div className="truncate font-semibold">{name}</div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
