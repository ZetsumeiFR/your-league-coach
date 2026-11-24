import { expect, test } from "bun:test";

import { RPCHandler } from "@orpc/server/fetch";
import { createDb } from "@your-league-coach/db";

import type { Context } from "../src/context";
import { logProcedureErrors } from "../src/error-log";
import { appRouter } from "../src/routers/index";
import { rankedDrafts } from "./support/ranked-draft";

const ACCESS_KEY = "k".repeat(40);
const SENTINEL_PUUID = "SENTINEL_PUUID_DO_NOT_LOG";
const SENTINEL_NAME = "SENTINEL_NAME_DO_NOT_LOG";

const context: Context = {
  db: createDb({
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  }),
  accessKey: ACCESS_KEY,
  expectedAccessKey: ACCESS_KEY,
  staticData: () => Promise.reject(new Error("static data is not used")),
};

test("a rejected request is logged with its issue paths, never its values", async () => {
  const lines: string[] = [];
  const handler = new RPCHandler(appRouter, {
    clientInterceptors: [logProcedureErrors((line) => lines.push(line))],
  });
  const [, locked] = await rankedDrafts();
  const { response } = await handler.handle(
    new Request("http://localhost/rpc/coach/suggestPicks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        json: {
          queueId: 420,
          role: SENTINEL_NAME,
          puuid: SENTINEL_PUUID,
          summonerName: SENTINEL_NAME,
          draft: { ...locked, queueId: SENTINEL_PUUID },
          pool: [],
        },
      }),
    }),
    { prefix: "/rpc", context }
  );

  expect(response?.status).toBe(400);
  expect(lines).toEqual([
    "rpc coach.suggestPicks failed: BAD_REQUEST 400; issues at role, draft.queueId",
  ]);
  const logged = lines.join("\n");
  expect(logged).not.toContain(SENTINEL_PUUID);
  expect(logged).not.toContain(SENTINEL_NAME);
});
