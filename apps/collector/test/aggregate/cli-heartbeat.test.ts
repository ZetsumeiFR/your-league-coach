import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { collectorState } from "@your-league-coach/db/schema/lol";
import { spawn } from "bun";
import { withTestDatabase } from "../test-database";

test.skipIf(!process.env.DATABASE_URL)(
  "an expired one-shot QA deadline exits 1 and persists a sanitized interruption",
  async () => {
    await withTestDatabase(async (db, databaseUrl) => {
      const child = spawn(
        [
          process.execPath,
          "--preload",
          "./test/aggregate/qa-timeout-preload.ts",
          "src/index.ts",
          "--once",
          "seed",
          "--limit",
          "1",
        ],
        {
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            RIOT_API_KEY: "fixture-key",
          },
          stdin: "ignore",
          stderr: "pipe",
          stdout: "pipe",
          timeout: 3000,
        }
      );
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        child.stdout.text(),
        child.stderr.text(),
      ]);

      expect(status).toBe(1);
      expect(stdout).toContain("Riot requests: 1");
      expect(stderr.trim()).toBe("Collector interrupted");
      expect(await db.select().from(collectorState)).toMatchObject([
        { lastError: "seed job interrupted", lastErrorAt: expect.any(Date) },
      ]);
    });
  }
);
