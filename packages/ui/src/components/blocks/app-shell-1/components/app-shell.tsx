import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@your-league-coach/ui/components/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@your-league-coach/ui/components/sidebar";
import { cn } from "cn";
import type { ComponentProps, ReactElement, ReactNode } from "react";

interface AppShellProps
  extends Pick<
    ComponentProps<typeof SidebarProvider>,
    "onOpenChange" | "open"
  > {
  actions: ReactNode;
  children: ReactNode;
  /** Root crumb: its label and the link element it renders as. */
  home: { label: string; render: ReactElement };
  page: string;
  sidebar: ReactNode;
  triggerLabel: string;
}

/**
 * ReUI app-shell-1 with its demo content replaced: the sidebar, the crumbs and
 * the page come from the app. `actions` is an extra node at the end of the
 * header, laid out by the caller.
 */
export function AppShell({
  actions,
  children,
  home,
  onOpenChange,
  open,
  page,
  sidebar,
  triggerLabel,
}: AppShellProps) {
  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        "[--sidebar:color-mix(in_oklab,var(--color-sidebar)_60%,transparent)]",
        "[--sidebar-border:transparent]",
        "[--sidebar-width:250px]",
        "[--sidebar-accent:color-mix(in_oklab,var(--color-primary)_5%,transparent)]",
        "[--sidebar-accent-foreground:var(--color-primary)]"
      )}
    >
      {sidebar}
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger
              className="-ml-1 md:hidden"
              aria-label={triggerLabel}
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink render={home.render}>
                    {home.label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{page}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {actions}
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
