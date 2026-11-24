import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@your-league-coach/db";
import { file } from "bun";

const migrations = new URL(
  "../../../packages/db/src/migrations/",
  import.meta.url
);
const schemaMigration = "20261124110341_powerful_vivisector/migration.sql";
const stateMigration = "20261124110907_seed_collector_state/migration.sql";

export const withTestDatabase = async (
  run: (db: Database, databaseUrl: string) => Promise<void>
) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new TypeError("Missing test database URL");
  }
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const admin = createDb({ DATABASE_URL: databaseUrl });
  const db = createDb({ DATABASE_URL: url.href });
  try {
    await admin.$client.query(`create schema "${schema}"`);
    await db.$client.query(
      await file(new URL(schemaMigration, migrations)).text()
    );
    await db.$client.query(
      await file(new URL(stateMigration, migrations)).text()
    );
    await run(db, url.href);
  } finally {
    await db.$client.end();
    try {
      await admin.$client.query(`drop schema if exists "${schema}" cascade`);
    } finally {
      await admin.$client.end();
    }
  }
};
