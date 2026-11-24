import {
  SidebarContent,
  SidebarHeader,
  Sidebar as SidebarRoot,
  useSidebar,
} from "@your-league-coach/ui/components/sidebar";
import { cn } from "cn";
import type { ReactNode } from "react";

import { type NavItem, NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";

interface RailLabels {
  collapse: string;
  expand: string;
}

/*
 * Keyboard focus shows what the block shows on hover: the bar bends into an
 * arrow and the label slides in. As shipped, focus on the toggle was invisible.
 */
const RAIL_FOCUS_BAR = "group-focus-visible/rail:bg-foreground/60";
const RAIL_FOCUS_LABEL =
  "group-focus-visible/rail:translate-x-0 group-focus-visible/rail:opacity-100";

function SidebarRailToggle({ labels }: { labels: RailLabels }) {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === "expanded";
  const label = isExpanded ? labels.collapse : labels.expand;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={toggleSidebar}
      style={{
        left: isExpanded ? "var(--sidebar-width)" : "var(--sidebar-width-icon)",
      }}
      className={cn(
        "group/rail fixed top-1/2 z-30 flex h-12 w-7 -translate-y-1/2 cursor-pointer items-center pl-2 outline-none",
        "transition-[left] duration-200 ease-linear"
      )}
    >
      <span className="flex flex-col items-center">
        {/* Top half - pivots at its bottom (the bar's center) */}
        <span
          aria-hidden="true"
          className={cn(
            "bg-foreground/40 block h-2 w-0.5 rounded-t-full",
            "origin-bottom transition-all duration-100 ease-linear",
            isExpanded
              ? "group-hover/rail:bg-foreground/60 group-hover/rail:rotate-40"
              : "group-hover/rail:bg-foreground/60 group-hover/rail:-rotate-40",
            RAIL_FOCUS_BAR,
            isExpanded
              ? "group-focus-visible/rail:rotate-40"
              : "group-focus-visible/rail:-rotate-40"
          )}
        />
        {/* Bottom half - pivots at its top (the bar's center) */}
        <span
          aria-hidden="true"
          className={cn(
            "bg-foreground/40 block h-2 w-0.5 rounded-b-full",
            "origin-top transition-all duration-100 ease-linear",
            isExpanded
              ? "group-hover/rail:bg-foreground/60 group-hover/rail:-rotate-40"
              : "group-hover/rail:bg-foreground/60 group-hover/rail:rotate-40",
            RAIL_FOCUS_BAR,
            isExpanded
              ? "group-focus-visible/rail:-rotate-40"
              : "group-focus-visible/rail:rotate-40"
          )}
        />
      </span>

      {/* Label slides in beside the arrow on hover */}
      <span
        className={cn(
          "border-border bg-foreground text-background absolute left-full -ml-2 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-xs shadow-black/5",
          "pointer-events-none transition-all duration-200 ease-out",
          "-translate-x-0.5 opacity-0",
          "group-hover/rail:translate-x-0 group-hover/rail:opacity-100",
          RAIL_FOCUS_LABEL
        )}
      >
        {label}
      </span>
    </button>
  );
}

interface AppSidebarProps {
  brand: ReactNode;
  nav: NavItem[];
  navLabel: string;
  railLabels: RailLabels;
  secondary: NavItem[];
}

/**
 * ReUI app-shell-1 sidebar, adapted: the workspace switcher, pinned resources
 * and user menu are gone (the app has no accounts) and the rows come from props.
 */
export function AppSidebar({
  brand,
  nav,
  navLabel,
  railLabels,
  secondary,
}: AppSidebarProps) {
  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader>{brand}</SidebarHeader>

      <SidebarContent>
        <NavMain label={navLabel} items={nav} />
        <div className="mt-auto">
          <NavSecondary items={secondary} />
        </div>
      </SidebarContent>

      <SidebarRailToggle labels={railLabels} />
    </SidebarRoot>
  );
}
