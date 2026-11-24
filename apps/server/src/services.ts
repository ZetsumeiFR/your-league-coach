import { createStaticDataLoader } from "@your-league-coach/api/stats/static-data";
import { createDb } from "@your-league-coach/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const staticData = createStaticDataLoader();
