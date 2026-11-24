import type { Database } from "@your-league-coach/db";

export interface Context {
  accessKey: string | null;
  db: Database;
  expectedAccessKey: string;
}
