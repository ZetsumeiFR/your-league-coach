import { z } from "zod";

const id = z.string().min(1);
export const puuidSchema = z.object({ puuid: id });
export const leagueEntriesSchema = z.array(
  z.union([puuidSchema, z.object({ summonerId: id })])
);
export const apexLeagueSchema = z.object({ entries: leagueEntriesSchema });
export const matchIdsSchema = z.array(id);

const participantSchema = z.object({
  participantId: z.int(),
  championId: z.int(),
  champLevel: z.int(),
  teamId: z.int(),
  teamPosition: z.string(),
  win: z.boolean(),
  summoner1Id: z.int(),
  summoner2Id: z.int(),
  item0: z.int().nonnegative(),
  item1: z.int().nonnegative(),
  item2: z.int().nonnegative(),
  item3: z.int().nonnegative(),
  item4: z.int().nonnegative(),
  item5: z.int().nonnegative(),
  item6: z.int().nonnegative(),
  perks: z.object({
    statPerks: z.object({
      defense: z.int(),
      flex: z.int(),
      offense: z.int(),
    }),
    styles: z.array(
      z.object({
        style: z.int(),
        selections: z.array(z.object({ perk: z.int() })),
      })
    ),
  }),
});

export const matchSchema = z.object({
  metadata: z.object({ matchId: id }),
  info: z.object({
    gameCreation: z.int(),
    gameDuration: z.int(),
    gameVersion: z.string().regex(/^\d+\.\d+(?:\.\d+)*$/),
    queueId: z.int(),
    participants: z.array(participantSchema).min(1),
  }),
});

const eventSchema = z.object({ type: z.string(), timestamp: z.int() });
const relevantEventSchema = z.discriminatedUnion("type", [
  eventSchema.extend({
    type: z.literal("SKILL_LEVEL_UP"),
    participantId: z.int(),
    levelUpType: z.string(),
    skillSlot: z.int(),
  }),
  eventSchema.extend({
    type: z.enum(["ITEM_PURCHASED", "ITEM_SOLD"]),
    participantId: z.int(),
    itemId: z.int(),
  }),
  eventSchema.extend({
    type: z.literal("ITEM_UNDO"),
    participantId: z.int(),
    beforeId: z.int(),
    afterId: z.int(),
  }),
]);
const isRelevant = (type: string): boolean =>
  type === "SKILL_LEVEL_UP" ||
  type === "ITEM_PURCHASED" ||
  type === "ITEM_SOLD" ||
  type === "ITEM_UNDO";

export const timelineSchema = z.object({
  metadata: z.object({ matchId: id }),
  info: z.object({
    frames: z.array(
      z.object({
        events: z
          .array(z.looseObject({ type: z.string() }))
          .transform((events) => events.filter(({ type }) => isRelevant(type)))
          .pipe(z.array(relevantEventSchema)),
      })
    ),
  }),
});

export type LeagueEntry = z.infer<typeof puuidSchema>;
export type RiotMatch = z.infer<typeof matchSchema>;
export type RiotTimeline = z.infer<typeof timelineSchema>;
