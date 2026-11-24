import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { loadSettings } from "./lib/settings-store";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";

// Browser QA only. The constant comes from vite.config.ts: true in the dev
// server started with VITE_YLC_MOCK_IPC=1, false in every build, which drops
// this branch together with the mock and its fixtures.
if (__YLC_MOCK_IPC__) {
  const { installDesktopMock } = await import("./lib/desktop/mock");
  installDesktopMock();
}

loadSettings();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  context: { orpc, queryClient },
  Wrap({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
