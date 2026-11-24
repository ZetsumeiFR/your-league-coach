import { readBearerToken } from "@your-league-coach/api/access-key";
import type { Context as ApiContext } from "@your-league-coach/api/context";
import type { Context as HonoContext } from "hono";

import { ENV } from "./env.server";
import { db } from "./services";

export interface CreateContextOptions {
  context: HonoContext;
}

export function createContext({ context }: CreateContextOptions): ApiContext {
  return {
    db,
    accessKey: readBearerToken(context.req.header("Authorization")),
    expectedAccessKey: ENV.COACH_ACCESS_KEY,
  };
}

export type Context = ReturnType<typeof createContext>;
