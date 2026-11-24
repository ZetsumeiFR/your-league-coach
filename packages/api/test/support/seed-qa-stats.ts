import { createDb, type Database } from "@your-league-coach/db";
import {
  buildStats,
  championRoleStats,
  collectorState,
  itemVsEnemyStats,
  matchupStats,
  patches,
  synergyStats,
} from "@your-league-coach/db/schema/lol";
import type { Role } from "@your-league-coach/lol-data/roles";
import { sql } from "drizzle-orm";

import {
  ARAM_LOCAL_CHAMPION_ID,
  QA_COUNTER_CHAMPION_ID,
  RANKED_ALLY_CHAMPION_IDS,
  RANKED_ENEMY_CHAMPION_IDS,
  RANKED_ENEMY_MIDDLE_CHAMPION_ID,
  RANKED_LOCAL_CHAMPION_ID,
  RANKED_PICKABLE_MIDDLE_IDS,
} from "../../../../scripts/fake-riot-client/fixtures/ids";

export const QA_CURRENT_PATCH = "15.23";
export const QA_PREVIOUS_PATCH = "15.22";
const CURRENT_DDRAGON_VERSION = "15.23.1";
const PREVIOUS_DDRAGON_VERSION = "15.22.1";
const SR = "sr";
const ARAM = "aram";
const ARAM_ROLE = "ANY";
const MIDDLE: Role = "MIDDLE";
const PREVIOUS_SAMPLE_SHARE = 0.8;

/** Lane order of RANKED_ALLY_CHAMPION_IDS / RANKED_ENEMY_CHAMPION_IDS in the ranked fixture. */
const ALLY_ROLES: readonly Role[] = ["TOP", "JUNGLE", "BOTTOM", "UTILITY"];
const ENEMY_ROLES: readonly Role[] = [
  "TOP",
  "JUNGLE",
  "MIDDLE",
  "BOTTOM",
  "UTILITY",
];

const OTHER_CANDIDATE_WIN_RATES = [
  0.535, 0.53, 0.525, 0.52, 0.515, 0.51, 0.505, 0.5, 0.495, 0.49, 0.485, 0.48,
  0.475, 0.47, 0.465,
] as const;

export const QA_MIDDLE_CANDIDATES = RANKED_PICKABLE_MIDDLE_IDS.map(
  (championId, index) => ({
    championId,
    games: 600 + index * 20,
    winRate:
      championId === QA_COUNTER_CHAMPION_ID
        ? 0.5
        : (OTHER_CANDIDATE_WIN_RATES[index - 1] ?? 0.5),
  })
);

export const QA_LOCAL_BUILD = {
  runePage: "8100:8112-8139-8140-8135|8200:8226-8210|5008-5008-5011",
  spells: [4, 14],
  skillOrder: "QEW|Q>W>E",
  starter: [1056, 2003],
  boots: 3020,
  core: [6655, 4645, 3089],
  situational: [3157, 3165, 3102, 3116],
  penetrationItem: 3135,
} as const;

const counts = (games: number, winRate: number) => ({
  games,
  wins: Math.round(games * winRate),
});

const aggregate = (
  patch: string,
  statsGroup: string,
  games: number,
  winRate: number
) => ({
  patch,
  statsGroup,
  ...counts(
    patch === QA_CURRENT_PATCH
      ? games
      : Math.round(games * PREVIOUS_SAMPLE_SHARE),
    winRate
  ),
});

function championRoleRows(patch: string) {
  const sr = (championId: number, role: string, games: number, wr: number) => ({
    ...aggregate(patch, SR, games, wr),
    championId,
    role,
  });
  return [
    ...QA_MIDDLE_CANDIDATES.map(({ championId, games, winRate }) =>
      sr(championId, MIDDLE, games, winRate)
    ),
    sr(RANKED_LOCAL_CHAMPION_ID, MIDDLE, 900, 0.512),
    ...RANKED_ALLY_CHAMPION_IDS.map((championId, index) =>
      sr(championId, ALLY_ROLES[index] ?? MIDDLE, 800, 0.505)
    ),
    ...RANKED_ENEMY_CHAMPION_IDS.map((championId, index) =>
      sr(championId, ENEMY_ROLES[index] ?? MIDDLE, 800, 0.505)
    ),
    {
      ...aggregate(patch, ARAM, 1500, 0.52),
      championId: ARAM_LOCAL_CHAMPION_ID,
      role: ARAM_ROLE,
    },
  ];
}

function matchupRows() {
  const matchup = (
    championId: number,
    opponentChampionId: number,
    opponentRole: Role,
    games: number,
    winRate: number
  ) => ({
    ...aggregate(QA_CURRENT_PATCH, SR, games, winRate),
    championId,
    role: MIDDLE,
    opponentChampionId,
    opponentRole,
  });
  return [
    // Champion A: the known counter of the lane opponent, and ahead of every other enemy too.
    ...RANKED_ENEMY_CHAMPION_IDS.map((enemyId, index) =>
      matchup(
        QA_COUNTER_CHAMPION_ID,
        enemyId,
        ENEMY_ROLES[index] ?? MIDDLE,
        400,
        enemyId === RANKED_ENEMY_MIDDLE_CHAMPION_ID ? 0.56 : 0.55
      )
    ),
    matchup(61, RANKED_ENEMY_MIDDLE_CHAMPION_ID, MIDDLE, 300, 0.46),
    matchup(4, RANKED_LOCAL_CHAMPION_ID, MIDDLE, 300, 0.55),
    matchup(134, RANKED_LOCAL_CHAMPION_ID, MIDDLE, 300, 0.54),
  ];
}

function synergyRows() {
  const [top, , bottom] = RANKED_ALLY_CHAMPION_IDS;
  const synergy = (allyChampionId: number, allyRole: Role, wr: number) => ({
    ...aggregate(QA_CURRENT_PATCH, SR, 300, wr),
    championId: QA_COUNTER_CHAMPION_ID,
    role: MIDDLE,
    allyChampionId,
    allyRole,
  });
  return [synergy(top, "TOP", 0.54), synergy(bottom, "BOTTOM", 0.53)];
}

type BuildKind = (typeof buildStats.$inferInsert)["kind"];

function buildRows() {
  const local = (kind: BuildKind, key: string, games: number, wr: number) => ({
    ...aggregate(QA_CURRENT_PATCH, SR, games, wr),
    championId: RANKED_LOCAL_CHAMPION_ID,
    role: MIDDLE,
    kind,
    key,
  });
  const aram = (kind: BuildKind, key: string, games: number, wr: number) => ({
    ...aggregate(QA_CURRENT_PATCH, ARAM, games, wr),
    championId: ARAM_LOCAL_CHAMPION_ID,
    role: ARAM_ROLE,
    kind,
    key,
  });
  const build = QA_LOCAL_BUILD;
  return [
    local("rune_page", build.runePage, 600, 0.52),
    local(
      "rune_page",
      "8100:8112-8139-8140-8106|8300:8345-8347|5008-5008-5011",
      200,
      0.5
    ),
    local("spells", build.spells.join("-"), 700, 0.52),
    local("spells", "4-12", 150, 0.49),
    local("skill_order", build.skillOrder, 700, 0.52),
    local("skill_order", "QWE|Q>E>W", 150, 0.5),
    local("starter", build.starter.join("-"), 800, 0.51),
    local("boots", String(build.boots), 650, 0.52),
    local("boots", "3158", 200, 0.5),
    local("core", build.core.join("-"), 500, 0.53),
    local("core", "6655-3157-3089", 250, 0.51),
    ...build.core.map((id) => local("item", String(id), 600, 0.52)),
    local("item", "3157", 400, 0.56),
    local("item", "3165", 300, 0.55),
    local("item", "3102", 250, 0.545),
    local("item", "3116", 200, 0.54),
    local("item", String(build.penetrationItem), 150, 0.47),
    aram(
      "rune_page",
      "8000:8008-9111-9104-8014|8100:8139-8135|5005-5008-5011",
      1000,
      0.52
    ),
    aram("spells", "4-32", 1200, 0.52),
    aram("skill_order", "WQE|W>Q>E", 1100, 0.52),
    aram("starter", "1055-2003", 900, 0.51),
    aram("boots", "3006", 1000, 0.52),
    aram("core", "6672-3031-3046", 700, 0.53),
    aram("item", "3072", 300, 0.55),
    aram("item", "3036", 300, 0.54),
    aram("item", "3033", 300, 0.53),
  ];
}

function itemVsEnemyRows() {
  const row = (
    itemId: number,
    enemyProfile: (typeof itemVsEnemyStats.$inferInsert)["enemyProfile"],
    games: number,
    wr: number
  ) => ({
    ...aggregate(QA_CURRENT_PATCH, SR, games, wr),
    championId: RANKED_LOCAL_CHAMPION_ID,
    role: MIDDLE,
    itemId,
    enemyProfile,
  });
  return [
    ...(
      ["ad_heavy", "ap_heavy", "heal_heavy", "tank_heavy", "balanced"] as const
    ).map((profile) => row(QA_LOCAL_BUILD.penetrationItem, profile, 300, 0.57)),
    row(3157, "ad_heavy", 300, 0.56),
    row(3165, "heal_heavy", 250, 0.55),
  ];
}

/** Empties patches, raw matches and every aggregate table (destructive: QA and test databases only). */
export async function resetStats(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE ${championRoleStats}, ${matchupStats}, ${synergyStats}, ${buildStats}, ${itemVsEnemyStats}, ${patches} CASCADE`
  );
}

export async function seedPatches(db: Database, now: Date): Promise<void> {
  await db.insert(patches).values([
    {
      patch: QA_PREVIOUS_PATCH,
      ddragonVersion: PREVIOUS_DDRAGON_VERSION,
      detectedAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000),
      isCurrent: false,
    },
    {
      patch: QA_CURRENT_PATCH,
      ddragonVersion: CURRENT_DDRAGON_VERSION,
      detectedAt: now,
      isCurrent: true,
    },
  ]);
}

export async function seedQaStats(
  db: Database,
  now: Date = new Date()
): Promise<void> {
  await resetStats(db);
  await seedPatches(db, now);
  await db
    .insert(championRoleStats)
    .values([
      ...championRoleRows(QA_CURRENT_PATCH),
      ...championRoleRows(QA_PREVIOUS_PATCH),
    ]);
  await db.insert(matchupStats).values(matchupRows());
  await db.insert(synergyStats).values(synergyRows());
  await db.insert(buildStats).values(buildRows());
  await db.insert(itemVsEnemyStats).values(itemVsEnemyRows());
  const heartbeat = {
    lastCrawlAt: now,
    lastAggregateAt: now,
    lastError: null,
    lastErrorAt: null,
  };
  await db
    .insert(collectorState)
    .values({ id: 1, ...heartbeat })
    .onConflictDoUpdate({ target: collectorState.id, set: heartbeat });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);
const QA_DATABASE_SUFFIX = "-qa";

/** Refuses remote hosts always, and local databases not named `*-qa` unless forced. */
export function assertQaDatabase(databaseUrl: string, forceLocal: boolean) {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to seed QA stats on non-local host "${url.hostname}"`
    );
  }
  if (!(name.endsWith(QA_DATABASE_SUFFIX) || forceLocal)) {
    throw new Error(
      `Refusing to seed database "${name}": its name must end with "${QA_DATABASE_SUFFIX}" (or pass --force-local)`
    );
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertQaDatabase(databaseUrl, process.argv.includes("--force-local"));
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    await seedQaStats(db);
  } finally {
    await db.$client.end();
  }
  process.stdout.write(
    `Seeded QA stats: patch ${QA_CURRENT_PATCH} (previous ${QA_PREVIOUS_PATCH})\n`
  );
}
