import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@your-league-coach/api/routers/index";

import type { Connection } from "@/lib/settings";
import { getSettings } from "@/lib/settings-store";

/** A call may name its own connection: the settings form tests one before saving it. */
interface CoachClientContext {
  connection?: Connection;
}

const connectionOf = ({ connection }: CoachClientContext): Connection => {
  const active = connection ?? getSettings();
  if (active === null) {
    throw new Error("The server cannot be called before settings are loaded");
  }
  return active;
};

export const queryClient = new QueryClient();

const link = new RPCLink<CoachClientContext>({
  url: ({ context }) => `${connectionOf(context).serverUrl}/rpc`,
  headers: ({ context }) => ({
    Authorization: `Bearer ${connectionOf(context).accessKey}`,
  }),
});

export const client: RouterClient<AppRouter, CoachClientContext> =
  createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

export type ServerFailure = "unauthorized" | "unreachable" | "failed";

/** A rejected request that is not an oRPC error never got an answer from the server. */
export const classifyServerError = (error: unknown): ServerFailure => {
  if (error instanceof ORPCError) {
    return error.code === "UNAUTHORIZED" ? "unauthorized" : "failed";
  }
  return "unreachable";
};

/** One more try covers a network blip; a refused key or a server error will not change. */
const MAX_UNREACHABLE_RETRIES = 1;

export const retryUnreachableOnce = (
  failures: number,
  error: unknown
): boolean =>
  classifyServerError(error) === "unreachable" &&
  failures < MAX_UNREACHABLE_RETRIES;
