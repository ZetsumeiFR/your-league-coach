import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import { fileURLToPath } from "node:url";

import type { Hono } from "hono";

const ACCESS_KEY = "SENTINEL_KEY_DO_NOT_LOG_0123456789abcdef";
const WRONG_KEY = "SENTINEL_WRONG_KEY_DO_NOT_LOG_0123456789";
const SENTINEL_PUUID = "SENTINEL_PUUID_DO_NOT_LOG";
const SENTINEL_NAME = "SENTINEL_NAME_DO_NOT_LOG";
const SENTINELS = [ACCESS_KEY, WRONG_KEY, SENTINEL_PUUID, SENTINEL_NAME];
const QUERY = `?puuid=${SENTINEL_PUUID}&summonerName=${SENTINEL_NAME}`;

let app: Hono;
const captured: string[] = [];
const restores: (() => void)[] = [];
const previousEnv = { ...process.env };
// Varlock exposes no reset API; restore its process globals with the environment.
const previousVarlockGlobals = new Map(
  Object.getOwnPropertyNames(globalThis)
    .filter((key) => key.toLowerCase().includes("varlock"))
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);

// Spies go in before the app is imported, so loggers that bind console or the
// streams at module load write into the capture too.
beforeAll(async () => {
  captureOutput();
  Object.assign(process.env, {
    NODE_ENV: "test",
    COACH_ACCESS_KEY: ACCESS_KEY,
    CORS_ORIGIN: "http://localhost:3001",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  });
  // varlock resolves apps/server/.env.schema from the working directory.
  const cwd = process.cwd();
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  try {
    ({ default: app } = await import("../src/index"));
  } finally {
    process.chdir(cwd);
  }
});

function captureOutput() {
  const record = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const spy = spyOn(console, method).mockImplementation(record);
    restores.push(() => spy.mockRestore());
  }
  for (const stream of [process.stdout, process.stderr]) {
    const spy = spyOn(stream, "write").mockImplementation((chunk) => {
      record(chunk);
      return true;
    });
    restores.push(() => spy.mockRestore());
  }
}

beforeEach(() => {
  captured.length = 0;
});

afterAll(() => {
  for (const restore of restores.splice(0)) {
    restore();
  }
  for (const key of Object.keys(process.env)) {
    if (!(key in previousEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, previousEnv);
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (
      key.toLowerCase().includes("varlock") &&
      !previousVarlockGlobals.has(key)
    ) {
      Reflect.deleteProperty(globalThis, key);
    }
  }
  for (const [key, descriptor] of previousVarlockGlobals) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    }
  }
});

const send = (path: string, authorization: string, json: unknown) =>
  app.request(`${path}${QUERY}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify({ json }),
  });

test.each([
  {
    status: 400,
    path: "/rpc/coach/suggestPicks",
    key: ACCESS_KEY,
    json: {
      queueId: 420,
      role: SENTINEL_NAME,
      puuid: SENTINEL_PUUID,
      summonerName: SENTINEL_NAME,
      draft: { queueId: SENTINEL_PUUID },
      pool: [],
    },
  },
  {
    status: 401,
    path: "/rpc/coach/meta",
    key: WRONG_KEY,
    json: { puuid: SENTINEL_PUUID, summonerName: SENTINEL_NAME },
  },
  {
    status: 200,
    path: "/rpc/healthCheck",
    key: ACCESS_KEY,
    json: { puuid: SENTINEL_PUUID, summonerName: SENTINEL_NAME },
  },
])(
  "a $status response logs method, path and status only",
  async ({ status, path, key, json }) => {
    const response = await send(path, `Bearer ${key}`, json);
    await response.text();
    const output = captured.join("\n");

    expect(response.status).toBe(status);
    expect(output).toMatch(new RegExp(`^POST ${path} ${status} \\d+ms$`, "m"));
    for (const sentinel of SENTINELS) {
      expect(output).not.toContain(sentinel);
    }
  }
);
