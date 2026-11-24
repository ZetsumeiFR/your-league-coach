import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  // The QA mock belongs to the dev server. `command` is "build" for every
  // build, whatever NODE_ENV, the mode or the flag say, so this is false there
  // and the bundler drops the mock together with its fixtures.
  const mockIpc =
    command === "serve" &&
    loadEnv(mode, process.cwd()).VITE_YLC_MOCK_IPC === "1";

  return {
    define: {
      __YLC_MOCK_IPC__: JSON.stringify(mockIpc),
    },
    server: {
      port: 3001,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      varlockVitePlugin({ ssrInjectMode: "auto-load" }),
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
    ],
  };
});
