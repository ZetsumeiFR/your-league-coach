import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const buildKind = pgEnum("build_kind", [
  "starter",
  "boots",
  "core",
  "item",
  "rune_page",
  "spells",
  "skill_order",
]);

export const enemyProfile = pgEnum("enemy_profile", [
  "ad_heavy",
  "ap_heavy",
  "heal_heavy",
  "tank_heavy",
  "balanced",
]);

export const patches = pgTable("patches", {
  patch: text("patch").primaryKey(),
  ddragonVersion: text("ddragon_version").notNull(),
  provisional: boolean("provisional").default(false).notNull(),
  detectedAt: timestamptz("detected_at").defaultNow().notNull(),
  isCurrent: boolean("is_current").default(false).notNull(),
});

export const collectorState = pgTable(
  "collector_state",
  {
    id: integer("id").primaryKey().default(1),
    apiKeyFingerprint: text("api_key_fingerprint"),
    lastCrawlAt: timestamptz("last_crawl_at"),
    lastAggregateAt: timestamptz("last_aggregate_at"),
    lastPatchCheckAt: timestamptz("last_patch_check_at"),
    lastError: text("last_error"),
    lastErrorAt: timestamptz("last_error_at"),
  },
  (table) => [check("collector_state_singleton", sql`${table.id} = 1`)]
);

// `seed_players.puuid` is the only PUUID column in the whole schema.
export const seedPlayers = pgTable("seed_players", {
  id: serial("id").primaryKey(),
  puuid: text("puuid").notNull().unique(),
  tier: text("tier"),
  addedAt: timestamptz("added_at").defaultNow().notNull(),
});

export const seedQueueProgress = pgTable(
  "seed_queue_progress",
  {
    seedPlayerId: integer("seed_player_id")
      .notNull()
      .references(() => seedPlayers.id, { onDelete: "cascade" }),
    queueId: integer("queue_id").notNull(),
    crawledUntil: timestamptz("crawled_until"),
  },
  (table) => [primaryKey({ columns: [table.seedPlayerId, table.queueId] })]
);

export const matches = pgTable(
  "matches",
  {
    matchId: text("match_id").primaryKey(),
    patch: text("patch")
      .notNull()
      .references(() => patches.patch),
    queueId: integer("queue_id").notNull(),
    statsGroup: text("stats_group").notNull(),
    seedTier: text("seed_tier"),
    gameCreation: timestamptz("game_creation").notNull(),
    durationS: integer("duration_s").notNull(),
    ingestedAt: timestamptz("ingested_at").defaultNow().notNull(),
  },
  (table) => [
    index("matches_patch_stats_group_idx").on(table.patch, table.statsGroup),
  ]
);

// Raw participant rows deliberately carry no PUUID and no player name.
export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull(),
    championId: integer("champion_id").notNull(),
    role: text("role"),
    win: boolean("win").notNull(),
    itemsFinal: integer("items_final").array().notNull(),
    itemBuildOrder: integer("item_build_order").array().notNull(),
    starterItems: integer("starter_items").array().notNull(),
    bootsId: integer("boots_id"),
    skillOrder: integer("skill_order").array().notNull(),
    summonerSpells: integer("summoner_spells").array().notNull(),
    perkPrimaryStyle: integer("perk_primary_style").notNull(),
    perkSubStyle: integer("perk_sub_style").notNull(),
    perks: integer("perks").array().notNull(),
    statPerks: integer("stat_perks").array().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.teamId, table.championId] }),
  ]
);

const aggregateColumns = () => ({
  patch: text("patch").notNull(),
  statsGroup: text("stats_group").notNull(),
  games: integer("games").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// `role` is "ANY" for ARAM rows in every aggregate table.
export const championRoleStats = pgTable(
  "champion_role_stats",
  {
    ...aggregateColumns(),
    championId: integer("champion_id").notNull(),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.patch, table.statsGroup, table.championId, table.role],
    }),
  ]
);

export const matchupStats = pgTable(
  "matchup_stats",
  {
    ...aggregateColumns(),
    championId: integer("champion_id").notNull(),
    role: text("role").notNull(),
    opponentChampionId: integer("opponent_champion_id").notNull(),
    opponentRole: text("opponent_role").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.patch,
        table.statsGroup,
        table.championId,
        table.role,
        table.opponentChampionId,
        table.opponentRole,
      ],
    }),
  ]
);

export const synergyStats = pgTable(
  "synergy_stats",
  {
    ...aggregateColumns(),
    championId: integer("champion_id").notNull(),
    role: text("role").notNull(),
    allyChampionId: integer("ally_champion_id").notNull(),
    allyRole: text("ally_role").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.patch,
        table.statsGroup,
        table.championId,
        table.role,
        table.allyChampionId,
        table.allyRole,
      ],
    }),
  ]
);

export const buildStats = pgTable(
  "build_stats",
  {
    ...aggregateColumns(),
    championId: integer("champion_id").notNull(),
    role: text("role").notNull(),
    kind: buildKind("kind").notNull(),
    key: text("key").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.patch,
        table.statsGroup,
        table.championId,
        table.role,
        table.kind,
        table.key,
      ],
    }),
  ]
);

export const itemVsEnemyStats = pgTable(
  "item_vs_enemy_stats",
  {
    ...aggregateColumns(),
    championId: integer("champion_id").notNull(),
    role: text("role").notNull(),
    itemId: integer("item_id").notNull(),
    enemyProfile: enemyProfile("enemy_profile").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.patch,
        table.statsGroup,
        table.championId,
        table.role,
        table.itemId,
        table.enemyProfile,
      ],
    }),
  ]
);
