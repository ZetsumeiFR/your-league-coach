import type { Database } from "@your-league-coach/db";
import {
  collectorState,
  matches,
  matchParticipants,
  seedPlayers,
} from "@your-league-coach/db/schema/lol";
import type { Item } from "@your-league-coach/lol-data/ddragon";
import { classifyItem } from "@your-league-coach/lol-data/items";
import { toPatch } from "@your-league-coach/lol-data/patch";
import { queueToStatsGroup } from "@your-league-coach/lol-data/queues";
import { ROLES } from "@your-league-coach/lol-data/roles";
import { eq } from "drizzle-orm";
import { RiotPayloadError } from "./riot/errors";
import type { RiotMatch, RiotTimeline } from "./riot/schemas";

// Ignore remakes and isolate purchases from the opening shopping window.
export const MIN_MATCH_DURATION_S = 300;
const STARTER_WINDOW_MS = 60_000;
const MAX_COMPLETED_ITEMS = 6;
const PARTICIPANT_COUNT = 10;
type Event = RiotTimeline["info"]["frames"][number]["events"][number];
type Participant = RiotMatch["info"]["participants"][number];
interface Purchase {
  readonly id: number;
  readonly timestamp: number;
}

const removePurchase = (purchases: Purchase[], id: number) => {
  const index = purchases.findLastIndex((purchase) => purchase.id === id);
  return index < 0 ? undefined : purchases.splice(index, 1)[0];
};

const replayPurchases = (events: readonly Event[]) => {
  const history: Purchase[] = [];
  const purchases: Purchase[] = [];
  const sold: Purchase[] = [];
  const undone = new Set<Purchase>();
  for (const event of events) {
    if (event.type === "ITEM_PURCHASED") {
      const purchase = { id: event.itemId, timestamp: event.timestamp };
      history.push(purchase);
      purchases.push(purchase);
    } else if (event.type === "ITEM_SOLD") {
      const removed = removePurchase(purchases, event.itemId);
      if (removed) {
        sold.push(removed);
      }
    } else if (event.type === "ITEM_UNDO") {
      const cancelled = removePurchase(purchases, event.beforeId);
      if (cancelled) {
        undone.add(cancelled);
      }
      if (event.afterId > 0) {
        const restored = removePurchase(sold, event.afterId);
        if (restored) {
          purchases.push(restored);
        }
      }
    }
  }
  return {
    history: history.filter((purchase) => !undone.has(purchase)),
    retained: new Set(purchases),
  };
};

const parseBuild = (
  events: readonly Event[],
  items: ReadonlyMap<number, Item>
) => {
  const itemBuildOrder: number[] = [];
  const starterItems: number[] = [];
  let bootsId: number | null = null;
  const { history, retained } = replayPurchases(events);
  for (const purchase of history) {
    const { id, timestamp } = purchase;
    if (timestamp < STARTER_WINDOW_MS) {
      starterItems.push(id);
    }
    const item = items.get(id);
    const kind = item ? classifyItem(item) : "other";
    if (kind === "boots") {
      bootsId = id;
    }
    // Keep the first six completed purchases remaining after undos and sales.
    if (
      retained.has(purchase) &&
      itemBuildOrder.length < MAX_COMPLETED_ITEMS &&
      (kind === "legendary" || kind === "boots")
    ) {
      itemBuildOrder.push(id);
    }
  }
  return { itemBuildOrder, starterItems, bootsId };
};

export const skipMalformedRunePage = async (
  db: Database,
  match: RiotMatch,
  now = Date.now
) => {
  if (match.info.participants.every(({ perks }) => perks !== null)) {
    return false;
  }
  await db.update(collectorState).set({
    lastError: "Skipped match: malformed rune page",
    lastErrorAt: new Date(now()),
  });
  return true;
};

const parseParticipant = (
  participant: Participant & {
    readonly perks: NonNullable<Participant["perks"]>;
  },
  matchId: string,
  isAram: boolean,
  events: readonly Event[],
  items: ReadonlyMap<number, Item>
): typeof matchParticipants.$inferInsert => {
  const { perks, teamPosition } = participant;
  const skillOrder = events.flatMap((event) =>
    event.type === "SKILL_LEVEL_UP" &&
    event.levelUpType === "NORMAL" &&
    event.skillSlot >= 1 &&
    event.skillSlot <= 4
      ? [event.skillSlot]
      : []
  );
  return {
    matchId,
    championId: participant.championId,
    teamId: participant.teamId,
    role: isAram ? null : (ROLES.find((role) => role === teamPosition) ?? null),
    win: participant.win,
    itemsFinal: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ],
    ...parseBuild(events, items),
    skillOrder,
    summonerSpells: [participant.summoner1Id, participant.summoner2Id].sort(
      (a, b) => a - b
    ),
    perkPrimaryStyle: perks.styles[0].style,
    perkSubStyle: perks.styles[1].style,
    perks: perks.styles.flatMap(({ selections }) =>
      selections.map(({ perk }) => perk)
    ),
    statPerks: [
      perks.statPerks.offense,
      perks.statPerks.flex,
      perks.statPerks.defense,
    ],
  };
};

interface IngestInput {
  readonly items: ReadonlyMap<number, Item>;
  readonly match: RiotMatch;
  readonly seedTier: string | null;
  readonly timeline: RiotTimeline;
}

export const parseMatch = ({
  match,
  timeline,
  items,
  seedTier,
}: IngestInput) => {
  const { matchId } = match.metadata;
  const { gameCreation, gameDuration, gameVersion, queueId, participants } =
    match.info;
  const statsGroup = queueToStatsGroup(queueId);
  if (!statsGroup || gameDuration < MIN_MATCH_DURATION_S) {
    return null;
  }
  if (
    matchId !== timeline.metadata.matchId ||
    participants.length !== PARTICIPANT_COUNT ||
    new Set(participants.map(({ participantId }) => participantId)).size !==
      PARTICIPANT_COUNT ||
    new Set(
      participants.map(({ teamId, championId }) => `${teamId}:${championId}`)
    ).size !== PARTICIPANT_COUNT
  ) {
    throw new RiotPayloadError("match/timeline consistency");
  }
  const events = timeline.info.frames
    .flatMap((frame) => frame.events)
    .sort((a, b) => a.timestamp - b.timestamp);
  const parsedParticipants: (typeof matchParticipants.$inferInsert)[] = [];
  for (const participant of participants) {
    if (!participant.perks) {
      return null;
    }
    parsedParticipants.push(
      parseParticipant(
        { ...participant, perks: participant.perks },
        matchId,
        statsGroup === "aram",
        events.filter(
          (event) => event.participantId === participant.participantId
        ),
        items
      )
    );
  }
  return {
    match: {
      matchId,
      patch: toPatch(gameVersion),
      queueId,
      statsGroup,
      seedTier,
      gameCreation: new Date(gameCreation),
      durationS: gameDuration,
    },
    participants: parsedParticipants,
  };
};

export const ingestMatch = async (
  db: Database,
  input: IngestInput,
  {
    seedId,
    now = Date.now,
  }: { readonly seedId?: number; readonly now?: () => number } = {}
): Promise<boolean> => {
  if (await skipMalformedRunePage(db, input.match, now)) {
    return false;
  }
  const parsed = parseMatch(input);
  if (!parsed) {
    return false;
  }
  return await db.transaction(async (tx) => {
    if (seedId !== undefined) {
      const [seed] = await tx
        .select({ tier: seedPlayers.tier })
        .from(seedPlayers)
        .where(eq(seedPlayers.id, seedId))
        .for("share");
      if (!seed) {
        return false;
      }
      parsed.match.seedTier = seed.tier;
    }
    const [inserted] = await tx
      .insert(matches)
      .values(parsed.match)
      .onConflictDoNothing({ target: matches.matchId })
      .returning({ id: matches.matchId });
    if (!inserted) {
      return false;
    }
    await tx.insert(matchParticipants).values(parsed.participants);
    return true;
  });
};
