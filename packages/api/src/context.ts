import type { Database } from "@your-league-coach/db";

import type { StaticDataLoader } from "./stats/static-data";

export interface Context {
  accessKey: string | null;
  db: Database;
  expectedAccessKey: string;
  staticData: StaticDataLoader;
}
