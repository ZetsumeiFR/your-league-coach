import { expect, test } from "bun:test";
import { parseMatch } from "../src/ingest";
import { RiotPayloadError } from "../src/riot/errors";
import { timelineSchema } from "../src/riot/schemas";
import { exampleItems, item, recorded } from "./match-fixtures";

test("parses ten SR participants with all and only their normal level-ups and completed items", async () => {
  const { match, timeline } = await recorded("SR");
  const parsed = parseMatch({
    match,
    timeline,
    items: exampleItems,
    seedTier: "EMERALD",
  });
  expect(parsed?.participants).toHaveLength(10);
  const events = timeline.info.frames.flatMap((frame) => frame.events);
  for (const [index, player] of match.info.participants.entries()) {
    const participant = parsed?.participants[index];
    const levelUps = events.filter(
      (event) =>
        event.type === "SKILL_LEVEL_UP" &&
        event.levelUpType === "NORMAL" &&
        event.participantId === player.participantId
    );
    expect(participant?.skillOrder).toHaveLength(levelUps.length);
    expect(participant?.skillOrder.length).toBeGreaterThan(0);
    expect(participant?.itemBuildOrder.length).toBeGreaterThan(0);
    expect(participant).not.toHaveProperty("puuid");
  }
  expect(parsed?.participants[0]).toMatchObject({
    bootsId: 3009,
    itemsFinal: [3009, 3742, 3110, 6662, 6610, 3036, 3340],
  });
});

test("nulls all ARAM roles and rejects a remake before ingestion", async () => {
  const { match, timeline } = await recorded("ARAM");
  const input = { match, timeline, items: exampleItems, seedTier: "DIAMOND" };
  expect(parseMatch(input)?.participants.map(({ role }) => role)).toEqual(
    Array.from({ length: 10 }, () => null)
  );
  expect(
    parseMatch({
      ...input,
      match: { ...match, info: { ...match.info, gameDuration: 299 } },
    })
  ).toBeNull();
  expect(() =>
    parseMatch({
      ...input,
      timeline: { ...timeline, metadata: { matchId: "wrong" } },
    })
  ).toThrow(RiotPayloadError);
});

test("replays purchases, sale undo, and purchase undo without treating destruction as sale", async () => {
  const { match } = await recorded("SR");
  const event = (
    type: string,
    timestamp: number,
    fields: Record<string, number>
  ) => ({
    type,
    timestamp,
    participantId: 1,
    ...fields,
  });
  const timeline = timelineSchema.parse({
    metadata: match.metadata,
    info: {
      frames: [
        {
          events: [
            event("ITEM_PURCHASED", 1000, { itemId: 1 }),
            event("ITEM_PURCHASED", 60_000, { itemId: 2 }),
            event("ITEM_PURCHASED", 61_000, { itemId: 3 }),
            event("ITEM_DESTROYED", 62_000, { itemId: 2 }),
            event("ITEM_SOLD", 63_000, { itemId: 2 }),
            event("ITEM_UNDO", 64_000, { beforeId: 0, afterId: 2 }),
            event("ITEM_UNDO", 65_000, { beforeId: 3, afterId: 0 }),
            event("ITEM_PURCHASED", 66_000, { itemId: 4 }),
            event("ITEM_SOLD", 67_000, { itemId: 4 }),
            event("ITEM_PURCHASED", 68_000, { itemId: 5 }),
            event("ITEM_DESTROYED", 69_000, { itemId: 5 }),
            {
              ...event("SKILL_LEVEL_UP", 70_000, { skillSlot: 4 }),
              levelUpType: "EVOLVE",
            },
            {
              ...event("SKILL_LEVEL_UP", 71_000, { skillSlot: 2 }),
              levelUpType: "NORMAL",
            },
          ],
        },
      ],
    },
  });
  const items = new Map([1, 2, 3, 4, 5].map((id) => [id, item(id)]));
  expect(
    parseMatch({ match, timeline, items, seedTier: "EMERALD" })?.participants[0]
  ).toMatchObject({
    starterItems: [1],
    itemBuildOrder: [1, 2, 5],
    skillOrder: [2],
  });
});
