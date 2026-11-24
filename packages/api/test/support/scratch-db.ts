import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createDb, type Database } from "@your-league-coach/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);

export interface ScratchDatabase {
  readonly db: Database;
  readonly drop: () => Promise<void>;
}

export async function createScratchDatabase(
  baseUrl: string
): Promise<ScratchDatabase> {
  const name = `ylc_api_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = createDb({ DATABASE_URL: baseUrl });
  try {
    await admin.execute(sql.raw(`CREATE DATABASE "${name}"`));
  } finally {
    await admin.$client.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const db = createDb({ DATABASE_URL: url.toString() });
  const drop = async () => {
    await db.$client.end();
    const dropAdmin = createDb({ DATABASE_URL: baseUrl });
    try {
      await dropAdmin.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
    } finally {
      await dropAdmin.$client.end();
    }
  };
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } catch (error) {
    await drop();
    throw error;
  }
  return { db, drop };
}
