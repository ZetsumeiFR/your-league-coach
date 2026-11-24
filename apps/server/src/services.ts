import { createAuth } from "@your-league-coach/auth";
import { createDb } from "@your-league-coach/db";

import { ENV, desktopOrigins } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db, desktopOrigins);
