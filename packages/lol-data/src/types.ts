import { z } from "zod";
import { lcuPositionSchema, ROLES } from "./roles";

export type ChampionId = number;
export type ItemId = number;

const championIdSchema = z.number().int().nonnegative();
const itemIdSchema = z.number().int().positive();
const roleSchema = z.enum(ROLES);

/** Reason codes without a parameter. The UI translates each one; engines never emit free text. */
export const PLAIN_REASON_CODES = [
  "strong_on_patch",
  "in_your_pool",
  "balances_damage",
  "anti_heal",
  "armor_vs_ad",
  "mr_vs_ap",
  "tenacity_vs_cc",
  "frontline_missing",
  "penetration_vs_tanks",
] as const;
export type PlainReasonCode = (typeof PLAIN_REASON_CODES)[number];

/** Reason kinds that carry a champion id: "counters:122" reads "counters champion 122". */
export const PARAM_REASON_KINDS = [
  "counters",
  "countered_by",
  "synergy",
] as const;
export type ParamReasonKind = (typeof PARAM_REASON_KINDS)[number];
export type ParamReasonCode = `${ParamReasonKind}:${number}`;

export type ReasonCode = PlainReasonCode | ParamReasonCode;

const PARAM_REASON_PATTERN = /^([a-z_]+):([1-9]\d*)$/;

const isPlainReasonCode = (value: string): value is PlainReasonCode =>
  (PLAIN_REASON_CODES as readonly string[]).includes(value);

const isParamReasonKind = (value: string): value is ParamReasonKind =>
  (PARAM_REASON_KINDS as readonly string[]).includes(value);

export const reasonCode = (
  kind: ParamReasonKind,
  championId: ChampionId
): ParamReasonCode => `${kind}:${championId}`;

export type ParsedReasonCode =
  | { kind: PlainReasonCode }
  | { kind: ParamReasonKind; championId: ChampionId };

/** Returns null when `code` is not one of the allowed literals or `<kind>:<positive int>` forms. */
export const parseReasonCode = (code: string): ParsedReasonCode | null => {
  if (isPlainReasonCode(code)) {
    return { kind: code };
  }
  const match = PARAM_REASON_PATTERN.exec(code);
  const [, kind, id] = match ?? [];
  if (kind && id && isParamReasonKind(kind)) {
    return { kind, championId: Number(id) };
  }
  return null;
};

export const reasonCodeSchema = z.custom<ReasonCode>(
  (value) => typeof value === "string" && parseReasonCode(value) !== null,
  { message: "Invalid reason code" }
);

/** Champion id 0 means "none" (LCU convention). */
const draftMemberSchema = z.object({
  cellId: z.number().int(),
  championId: championIdSchema,
  championPickIntent: championIdSchema,
  /** Raw LCU position; use lcuPositionToRole to normalize. */
  assignedPosition: lcuPositionSchema,
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

const MAX_POOL_ENTRIES = 200;
const MAX_ALLIES = 4;
const MAX_ENEMIES = 5;
const MAX_OWNED_ITEMS = 10;
const MAX_ENEMY_ITEMS = 50;

const requestChampionIdSchema = z.number().int().positive();

/** Request envelopes of the coach API. Unknown keys (names, puuids) are stripped by zod. */
export const draftInputSchema = z.object({
  queueId: z.number().int(),
  role: roleSchema.nullable(),
  draft: draftStateSchema,
  pool: z.array(playerPoolEntrySchema).max(MAX_POOL_ENTRIES),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export const buildInputSchema = z.object({
  queueId: z.number().int(),
  role: roleSchema.nullable(),
  championId: requestChampionIdSchema,
  allies: z.array(requestChampionIdSchema).max(MAX_ALLIES),
  enemies: z.array(requestChampionIdSchema).max(MAX_ENEMIES),
});
export type BuildInput = z.infer<typeof buildInputSchema>;

export const nextItemsInputSchema = z.object({
  queueId: z.number().int(),
  role: roleSchema.nullable(),
  championId: requestChampionIdSchema,
  ownedItems: z.array(itemIdSchema).max(MAX_OWNED_ITEMS),
  enemyChampions: z.array(requestChampionIdSchema).max(MAX_ENEMIES),
  /** Every visible enemy item, flattened across enemies. */
  enemyItems: z.array(itemIdSchema).max(MAX_ENEMY_ITEMS),
});
export type NextItemsInput = z.infer<typeof nextItemsInputSchema>;

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
  reasons: z.array(reasonCodeSchema),
});
export type PickSuggestion = z.infer<typeof pickSuggestionSchema>;

export const banSuggestionSchema = z.object({
  championId: championIdSchema,
  score: z.number(),
  winRate: z.number().min(0).max(1),
  sampleGames: z.number().int().nonnegative(),
  reasons: z.array(reasonCodeSchema),
});
export type BanSuggestion = z.infer<typeof banSuggestionSchema>;

/** A revealed enemy and the role the engine assumed for it: the client never reports enemy positions. */
export const enemyRoleSchema = z.object({
  championId: requestChampionIdSchema,
  role: roleSchema,
});
export type EnemyRole = z.infer<typeof enemyRoleSchema>;

/**
 * The patch blended in when `sources.previousGames` is above zero. Null when
 * the server knows no older patch, absent from a server that does not report it.
 */
const previousPatchSchema = z.string().nullish();

/** Patch label and blend provenance are stated once per response, not per row. */
export const pickSuggestionsSchema = z.object({
  patch: z.string(),
  previousPatch: previousPatchSchema,
  sources: blendSourcesSchema,
  /** One entry per revealed enemy champion, as the lane-opponent weighting used them. Absent from a server that does not report it. */
  enemyRoles: z.array(enemyRoleSchema).optional(),
  suggestions: z.array(pickSuggestionSchema),
});
export type PickSuggestions = z.infer<typeof pickSuggestionsSchema>;

export const banSuggestionsSchema = z.object({
  patch: z.string(),
  previousPatch: previousPatchSchema,
  sources: blendSourcesSchema,
  suggestions: z.array(banSuggestionSchema),
});
export type BanSuggestions = z.infer<typeof banSuggestionsSchema>;

export const SKILL_KEYS = ["Q", "W", "E", "R"] as const;
export const skillKeySchema = z.enum(SKILL_KEYS);
export type SkillKey = z.infer<typeof skillKeySchema>;

/** Composition rule ids; each is also the reason code its adjustment reports. */
export const BUILD_RULE_IDS = [
  "anti_heal",
  "armor_vs_ad",
  "mr_vs_ap",
  "tenacity_vs_cc",
  "frontline_missing",
  "penetration_vs_tanks",
] as const;
export const buildRuleIdSchema = z.enum(BUILD_RULE_IDS);
export type BuildRuleId = z.infer<typeof buildRuleIdSchema>;

export const buildAdjustmentSchema = z.object({
  ruleId: buildRuleIdSchema,
  reasonCode: reasonCodeSchema,
  /** The base-build item this adjustment swaps out; absent when the item is simply added. */
  replaced: itemIdSchema.optional(),
  added: itemIdSchema,
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

export const nextItemSchema = z.object({
  itemId: itemIdSchema,
  reasons: z.array(reasonCodeSchema),
});
export type NextItem = z.infer<typeof nextItemSchema>;

export const nextItemsSchema = z.object({
  patch: z.string(),
  sources: blendSourcesSchema,
  items: z.array(nextItemSchema),
});
export type NextItems = z.infer<typeof nextItemsSchema>;

const gameCountSchema = z.number().int().nonnegative();

export const coachMetaSchema = z.object({
  /** Null until the collector has detected a patch. */
  patch: z.string().nullable(),
  ddragonVersion: z.string().nullable(),
  /** Matches behind the current patch's aggregates, per stats group. */
  statsGroups: z.object({ sr: gameCountSchema, aram: gameCountSchema }),
  collector: z.object({
    lastCrawlAt: z.date().nullable(),
    lastAggregateAt: z.date().nullable(),
    lastError: z.string().nullable(),
    lastErrorAt: z.date().nullable(),
  }),
});
export type CoachMeta = z.infer<typeof coachMetaSchema>;
