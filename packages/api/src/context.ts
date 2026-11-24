import type { Session } from "@your-league-coach/auth";
import type { Database } from "@your-league-coach/db";

export type Context = {
  session: Session | null;
  db: Database;
};
