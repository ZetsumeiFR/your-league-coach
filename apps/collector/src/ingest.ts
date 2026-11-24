import type { Database } from "@your-league-coach/db";
import { matches, matchParticipants } from "@your-league-coach/db/schema/lol";
import type { Item } from "@your-league-coach/lol-data/ddragon";
import { classifyItem } from "@your-league-coach/lol-data/items";
import { toPatch } from "@your-league-coach/lol-data/patch";
import { queueToStatsGroup } from "@your-league-coach/lol-data/queues";
import { ROLES } from "@your-league-coach/lol-data/roles";
import { RiotPayloadError } from "./riot/errors";
import type { RiotMatch, RiotTimeline } from "./riot/schemas";

// Ignore remakes and isolate purchases from the opening shopping window.
export const MIN_MATCH_DURATION_S = 300;
const STARTER_WINDOW_MS = 60_000;
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
  const purchases: Purchase[] = [];
  const sold: Purchase[] = [];
  for (const event of events) {
    if (event.type === "ITEM_PURCHASED") {
      purchases.push({ id: event.itemId, timestamp: event.timestamp });
    } else if (event.type === "ITEM_SOLD") {
      const removed = removePurchase(purchases, event.itemId);
      if (removed) {
        sold.push(removed);
      }
    } else if (event.type === "ITEM_UNDO") {
      removePurchase(purchases, event.beforeId);
      if (event.afterId > 0) {
        const restored = removePurchase(sold, event.afterId);
        if (restored) {
          purchases.push(restored);
        }
      }
    }
  }
  return purchases.sort((a, b) => a.timestamp - b.timestamp);
};

const parseBuild = (
  events: readonly Event[],
  items: ReadonlyMap<number, Item>
) => {
  const itemBuildOrder: number[] = [];
  const starterItems: number[] = [];
  let bootsId: number | null = null;
  for (const { id, timestamp } of replayPurchases(events)) {
    if (timestamp < STARTER_WINDOW_MS) {
      starterItems.push(id);
    }
    const item = items.get(id);
    const kind = item ? classifyItem(item) : "other";
    if (kind === "boots") {
      bootsId = id;
    }
    if (kind === "legendary" || kind === "boots") {
      itemBuildOrder.push(id);
    }
  }
  return { itemBuildOrder, starterItems, bootsId };
};

const parseParticipant = (
  participant: Participant,
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
    summonerSpells: [participant.summoner1Id, participant.summoner2Id],
    perkPrimaryStyle: perks.styles[0]?.style ?? 0,
    perkSubStyle: perks.styles[1]?.style ?? 0,
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
    participants: participants.map((participant) =>
      parseParticipant(
        participant,
        matchId,
        statsGroup === "aram",
        events.filter(
          (event) => event.participantId === participant.participantId
        ),
        items
      )
    ),
  };
};

export const ingestMatch = async (
  db: Database,
  input: IngestInput
): Promise<boolean> => {
  const parsed = parseMatch(input);
  if (!parsed) {
    return false;
  }
  return await db.transaction(async (tx) => {
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
