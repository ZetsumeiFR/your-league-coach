import "varlock/auto-load";

// biome-ignore lint/performance/noBarrelFile: env.server is the single server entry that loads varlock before re-exporting ENV
export { ENV } from "./env";

/** Packaged desktop builds serve the frontend from their own origin, not CORS_ORIGIN. */
export const desktopOrigins = ["tauri://localhost", "http://tauri.localhost"];
