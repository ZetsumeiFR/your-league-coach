import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { spawn } from "bun";

const ACCESS_KEY = "SENTINEL_KEY_DO_NOT_LOG_0123456789abcdef";
const WRONG_KEY = "SENTINEL_WRONG_KEY_DO_NOT_LOG_0123456789";
const SENTINEL_PUUID = "SENTINEL_PUUID_DO_NOT_LOG";
const SENTINEL_NAME = "SENTINEL_NAME_DO_NOT_LOG";
const SENTINEL_HEADER = "SENTINEL_HEADER_DO_NOT_LOG";
const SENTINELS = [
  ACCESS_KEY,
  WRONG_KEY,
  SENTINEL_PUUID,
  SENTINEL_NAME,
  SENTINEL_HEADER,
];
const QUERY = `?puuid=${SENTINEL_PUUID}&summonerName=${SENTINEL_NAME}`;
const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
const SERVER_ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const REQUESTS = [
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
] as const;

const getFreePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error("Could not reserve a TCP port")));
        return;
      }
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });

const waitForServer = async (
  origin: string,
  serverProcess: Bun.Subprocess
): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    let lastError: unknown;

    let poll: () => void;
    const schedulePoll = () => {
      if (Date.now() >= deadline) {
        reject(
          new Error("Server did not become ready before the deadline", {
            cause: lastError,
          })
        );
        return;
      }
      setTimeout(poll, 25);
    };
    poll = () => {
      if (serverProcess.exitCode !== null) {
        reject(
          new Error(
            `Server exited before becoming ready with code ${serverProcess.exitCode}`
          )
        );
        return;
      }
      fetch(`${origin}/`, {
        signal: AbortSignal.timeout(250),
      })
        .then(async (response) => {
          await response.text();
          if (response.ok) {
            resolve();
          } else {
            schedulePoll();
          }
        })
        .catch((error: unknown) => {
          lastError = error;
          schedulePoll();
        });
    };

    poll();
  });

test("real server access logs exclude request secrets", async () => {
  const port = await getFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const serverProcess = spawn([process.execPath, SERVER_ENTRY], {
    cwd: SERVER_DIR,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      NODE_ENV: "test",
      COACH_ACCESS_KEY: ACCESS_KEY,
      CORS_ORIGIN: "http://localhost:3001",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      PORT: String(port),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = new Response(serverProcess.stdout).text();
  const stderr = new Response(serverProcess.stderr).text();
  const statuses: number[] = [];
  let output = "";

  try {
    await waitForServer(origin, serverProcess);
    statuses.push(
      ...(await Promise.all(
        REQUESTS.map(async ({ path, key, json }) => {
          const response = await fetch(`${origin}${path}${QUERY}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${key}`,
              "x-sentinel-header": SENTINEL_HEADER,
            },
            body: JSON.stringify({ json }),
          });
          await response.text();
          return response.status;
        })
      ))
    );
  } finally {
    serverProcess.kill();
    const [serverOutput, serverErrors] = await Promise.all([stdout, stderr]);
    await serverProcess.exited;
    output = `${serverOutput}\n${serverErrors}`;
  }

  expect(statuses).toEqual(REQUESTS.map(({ status }) => status));
  for (const sentinel of SENTINELS) {
    expect(output).not.toContain(sentinel);
  }
  for (const { status, path } of REQUESTS) {
    expect(output).toMatch(new RegExp(`^POST ${path} ${status} \\d+ms$`, "m"));
  }
});
