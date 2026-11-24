import { useSidebar } from "@your-league-coach/ui/components/sidebar";
import { useCallback } from "react";

/**
 * What a sidebar link needs to work in the narrow-window sheet as well as in
 * the rail. The sheet gets no tooltip: its labels are always visible, and a
 * tooltip there, even hidden, takes the first Escape meant to close the sheet.
 * A click on the link closes the sheet.
 */
export const useSidebarLink = (label: string) => {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeSheet = useCallback(() => setOpenMobile(false), [setOpenMobile]);
  return { closeSheet, tooltip: isMobile ? undefined : label };
};
