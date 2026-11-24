import { z } from "zod";
import { ROLES } from "./roles";

export type ChampionId = number;
export type ItemId = number;

const championIdSchema = z.number().int().nonnegative();
const itemIdSchema = z.number().int().positive();
const roleSchema = z.enum(ROLES);

/** Machine-readable explanation; the UI translates each code (no free text from the engines). */
export const REASON_CODES = [
  "strong_on_patch",
  "counters_enemy",
  "countered_by_enemy",
  "synergy_with_ally",
  "in_your_pool",
  "threat_to_role",
  "high_win_rate",
  "anti_heal",
  "anti_shield",
  "armor_vs_ad",
  "magic_resist_vs_ap",
  "armor_penetration",
  "tenacity_vs_cc",
  "anti_tank",
  "enemy_item_counter",
] as const;
export const reasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

/** `championId` / `itemId` name the champion or item the reason refers to (e.g. "counters Darius"). */
export const reasonSchema = z.object({
  code: reasonCodeSchema,
  championId: championIdSchema.optional(),
  itemId: itemIdSchema.optional(),
});
export type Reason = z.infer<typeof reasonSchema>;

/** Champion id 0 means "none" (LCU convention). */
const draftMemberSchema = z.object({
  cellId: z.number().int(),
  championId: championIdSchema,
  championPickIntent: championIdSchema,
  assignedPosition: roleSchema.nullable(),
});

export const draftStateSchema = z.object({
  queueId: z.number().int(),
  localPlayerCellId: z.number().int(),
  myTeam: z.array(draftMemberSchema),
  theirTeam: z.array(
    z.object({ cellId: z.number().int(), championId: championIdSchema })
  ),
  bans: z.object({
    myTeamBans: z.array(championIdSchema),
    theirTeamBans: z.array(championIdSchema),
  }),
  currentAction: z.enum(["ban", "pick", "none"]),
  isLocalPlayersTurn: z.boolean(),
  /** Empty means the LCU did not provide the list: engines must not filter on it. */
  pickableChampionIds: z.array(championIdSchema),
  localPick: z.object({ championId: championIdSchema, completed: z.boolean() }),
});
export type DraftState = z.infer<typeof draftStateSchema>;

export const playerPoolEntrySchema = z.object({
  championId: championIdSchema,
  masteryPoints: z.number().int().nonnegative(),
  recentGames: z.number().int().nonnegative(),
  recentWins: z.number().int().nonnegative(),
});
export type PlayerPoolEntry = z.infer<typeof playerPoolEntrySchema>;

/** Number of games behind a blended statistic, per patch. */
export const blendSourcesSchema = z.object({
  currentGames: z.number().int().nonnegative(),
  previousGames: z.number().int().nonnegative(),
});
export type BlendSources = z.infer<typeof blendSourcesSchema>;

export const pickSuggestionSchema = z.object({
  championId: championIdSchema,
  score: z.number(),
  components: z.object({
    strength: z.number(),
    matchup: z.number(),
    synergy: z.number(),
    pool: z.number(),
  }),
  winRate: z.number().min(0).max(1),
  sampleGames: z.number().int().nonnegative(),
  reasons: z.array(reasonSchema),
});
export type PickSuggestion = z.infer<typeof pickSuggestionSchema>;

export const banSuggestionSchema = z.object({
  championId: championIdSchema,
  score: z.number(),
  winRate: z.number().min(0).max(1),
  sampleGames: z.number().int().nonnegative(),
  reasons: z.array(reasonSchema),
});
export type BanSuggestion = z.infer<typeof banSuggestionSchema>;

export const SKILL_KEYS = ["Q", "W", "E", "R"] as const;
export const skillKeySchema = z.enum(SKILL_KEYS);
export type SkillKey = z.infer<typeof skillKeySchema>;

export const buildAdjustmentSchema = z.object({
  action: z.enum(["add", "replace_boots", "replace_core"]),
  itemId: itemIdSchema,
  reason: reasonSchema,
});
export type BuildAdjustment = z.infer<typeof buildAdjustmentSchema>;

export const buildRecommendationSchema = z.object({
  championId: championIdSchema,
  role: roleSchema.nullable(),
  patch: z.string(),
  runes: z.object({
    primaryStyleId: z.number().int(),
    subStyleId: z.number().int(),
    selectedPerkIds: z.array(z.number().int()),
  }),
  spells: z.tuple([z.number().int(), z.number().int()]),
  /** Skill chosen at each champion level, in order (up to 18 entries). */
  skillOrder: z.array(skillKeySchema),
  starter: z.array(itemIdSchema),
  boots: itemIdSchema.nullable(),
  core: z.array(itemIdSchema),
  situational: z.array(itemIdSchema),
  adjustments: z.array(buildAdjustmentSchema),
  sampleGames: z.number().int().nonnegative(),
  sources: blendSourcesSchema,
});
export type BuildRecommendation = z.infer<typeof buildRecommendationSchema>;
