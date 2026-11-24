import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// React never runs a script it creates on the client, so the pre-paint theme
// script lives in index.html (same storage key and default as below). A
// non-JavaScript type marks the copy next-themes still renders as inert data,
// which keeps React from reporting it.
const INERT_SCRIPT = { type: "text/plain" } as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      scriptProps={INERT_SCRIPT}
      storageKey="vite-ui-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
