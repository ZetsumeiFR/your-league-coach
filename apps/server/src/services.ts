import { createDb } from "@your-league-coach/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
