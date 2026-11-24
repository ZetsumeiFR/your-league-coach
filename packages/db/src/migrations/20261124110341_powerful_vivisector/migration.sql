CREATE TYPE "build_kind" AS ENUM('starter', 'boots', 'core', 'item', 'rune_page', 'spells', 'skill_order');--> statement-breakpoint
CREATE TYPE "enemy_profile" AS ENUM('ad_heavy', 'ap_heavy', 'heal_heavy', 'tank_heavy', 'balanced');--> statement-breakpoint
CREATE TABLE "build_stats" (
	"patch" text,
	"stats_group" text,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"champion_id" integer,
	"role" text,
	"kind" "build_kind",
	"key" text,
	CONSTRAINT "build_stats_pkey" PRIMARY KEY("patch","stats_group","champion_id","role","kind","key")
);
--> statement-breakpoint
CREATE TABLE "champion_role_stats" (
	"patch" text,
	"stats_group" text,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"champion_id" integer,
	"role" text,
	CONSTRAINT "champion_role_stats_pkey" PRIMARY KEY("patch","stats_group","champion_id","role")
);
--> statement-breakpoint
CREATE TABLE "collector_state" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"api_key_fingerprint" text,
	"last_crawl_at" timestamp with time zone,
	"last_aggregate_at" timestamp with time zone,
	"last_patch_check_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	CONSTRAINT "collector_state_singleton" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "item_vs_enemy_stats" (
	"patch" text,
	"stats_group" text,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"champion_id" integer,
	"role" text,
	"item_id" integer,
	"enemy_profile" "enemy_profile",
	CONSTRAINT "item_vs_enemy_stats_pkey" PRIMARY KEY("patch","stats_group","champion_id","role","item_id","enemy_profile")
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" text,
	"team_id" integer,
	"champion_id" integer,
	"role" text,
	"win" boolean NOT NULL,
	"items_final" integer[] NOT NULL,
	"item_build_order" integer[] NOT NULL,
	"starter_items" integer[] NOT NULL,
	"boots_id" integer,
	"skill_order" integer[] NOT NULL,
	"summoner_spells" integer[] NOT NULL,
	"perk_primary_style" integer NOT NULL,
	"perk_sub_style" integer NOT NULL,
	"perks" integer[] NOT NULL,
	"stat_perks" integer[] NOT NULL,
	CONSTRAINT "match_participants_pkey" PRIMARY KEY("match_id","team_id","champion_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" text PRIMARY KEY,
	"patch" text NOT NULL,
	"queue_id" integer NOT NULL,
	"stats_group" text NOT NULL,
	"seed_tier" text,
	"game_creation" timestamp with time zone NOT NULL,
	"duration_s" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchup_stats" (
	"patch" text,
	"stats_group" text,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"champion_id" integer,
	"role" text,
	"opponent_champion_id" integer,
	"opponent_role" text,
	CONSTRAINT "matchup_stats_pkey" PRIMARY KEY("patch","stats_group","champion_id","role","opponent_champion_id","opponent_role")
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"patch" text PRIMARY KEY,
	"ddragon_version" text NOT NULL,
	"provisional" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_players" (
	"id" serial PRIMARY KEY,
	"puuid" text NOT NULL UNIQUE,
	"tier" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seed_queue_progress" (
	"seed_player_id" integer,
	"queue_id" integer,
	"crawled_until" timestamp with time zone,
	CONSTRAINT "seed_queue_progress_pkey" PRIMARY KEY("seed_player_id","queue_id")
);
--> statement-breakpoint
CREATE TABLE "synergy_stats" (
	"patch" text,
	"stats_group" text,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"champion_id" integer,
	"role" text,
	"ally_champion_id" integer,
	"ally_role" text,
	CONSTRAINT "synergy_stats_pkey" PRIMARY KEY("patch","stats_group","champion_id","role","ally_champion_id","ally_role")
);
--> statement-breakpoint
CREATE INDEX "matches_patch_stats_group_idx" ON "matches" ("patch","stats_group");--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("match_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_patch_patches_patch_fkey" FOREIGN KEY ("patch") REFERENCES "patches"("patch");--> statement-breakpoint
ALTER TABLE "seed_queue_progress" ADD CONSTRAINT "seed_queue_progress_seed_player_id_seed_players_id_fkey" FOREIGN KEY ("seed_player_id") REFERENCES "seed_players"("id") ON DELETE CASCADE;