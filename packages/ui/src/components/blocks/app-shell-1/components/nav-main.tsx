import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@your-league-coach/ui/components/sidebar";
import type { ReactElement, ReactNode } from "react";

import { useSidebarLink } from "./use-sidebar-link";

export interface NavItem {
  icon: ReactNode;
  id: string;
  isActive: boolean;
  label: string;
  /** Link element the row renders as, such as a router `<Link to="/draft" />`. */
  render: ReactElement;
}

function LeafNavItem({ item }: { item: NavItem }) {
  const link = useSidebarLink(item.label);

  return (
    <SidebarMenuItem>
      {/* Sidebar */}
      <SidebarMenuButton
        tooltip={link.tooltip}
        isActive={item.isActive}
        render={item.render}
        onClick={link.closeSheet}
      >
        {item.icon}
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NavMain({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <SidebarGroup>
      {/* Sidebar */}
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1!">
          {items.map((item) => (
            <LeafNavItem key={item.id} item={item} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
