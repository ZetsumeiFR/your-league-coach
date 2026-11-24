import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@your-league-coach/api/routers/index";
import { toast } from "sonner";

import { getCoachSettings } from "@/lib/settings";

const TRAILING_SLASH = /\/$/;

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });
}

export const queryClient = createQueryClient();

export const link = new RPCLink({
  url: () => `${getCoachSettings().serverUrl.replace(TRAILING_SLASH, "")}/rpc`,
  headers: () => ({ Authorization: `Bearer ${getCoachSettings().accessKey}` }),
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
