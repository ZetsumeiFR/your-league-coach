import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { coachRouter } from "./coach";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => "OK"),
  coach: coachRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
