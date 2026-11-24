import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@your-league-coach/ui/components/sidebar";

import type { NavItem } from "./nav-main";
import { useSidebarLink } from "./use-sidebar-link";

function SecondaryNavItem({ item }: { item: NavItem }) {
  const link = useSidebarLink(item.label);

  return (
    <SidebarMenuItem>
      {/* Sidebar */}
      <SidebarMenuButton
        size="sm"
        tooltip={link.tooltip}
        isActive={item.isActive}
        render={item.render}
        onClick={link.closeSheet}
        className="[&_svg]:size-3.5"
      >
        {item.icon}
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NavSecondary({ items }: { items: NavItem[] }) {
  return (
    <SidebarGroup>
      {/* Sidebar */}
      <SidebarMenu>
        {items.map((item) => (
          <SecondaryNavItem key={item.id} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
