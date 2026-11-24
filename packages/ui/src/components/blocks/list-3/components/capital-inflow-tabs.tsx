"use client";

import { Frame, FramePanel } from "@your-league-coach/ui/components/reui/frame";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@your-league-coach/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";

interface CapitalInflowTabsProps {
  actions?: ReactNode;
  children?: ReactNode;
  info: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    text: ReactNode;
  };
  list?: { busy: boolean; label: string; rows: ReactNode };
  title: string;
}

/**
 * ReUI list-3 with its demo content replaced: the frame, the header and the
 * row list are as shipped. The title, the hint behind the icon, the rows
 * (`InflowRow` elements) and whatever precedes the list come from the caller.
 * The period tabs are gone, because this list shows one ranking at a time;
 * `actions` takes their place at the end of the header.
 */
export function CapitalInflowTabs({
  actions,
  children,
  info,
  list,
  title,
}: CapitalInflowTabsProps) {
  return (
    <div className="w-full max-w-md">
      <Frame className="@container w-full">
        <FramePanel className="p-4!">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="text-foreground text-base font-medium">
                  {title}
                </h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex shrink-0 rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                          aria-label={info.label}
                        />
                      }
                    >
                      <info.icon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-56 px-2.5 py-1.5 text-xs leading-5"
                    >
                      {info.text}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {actions}
            </div>

            {/* Content */}
            <div>
              {children}
              {list ? (
                <ul
                  aria-busy={list.busy}
                  aria-label={list.label}
                  className="flex flex-col"
                >
                  {list.rows}
                </ul>
              ) : null}
            </div>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
