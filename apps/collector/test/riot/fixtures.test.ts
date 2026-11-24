import { expect, it } from "bun:test";
import { file } from "bun";
import { RiotClient } from "../../src/riot/client";
import { RiotRateLimiter } from "../../src/riot/rate-limiter";
import {
  leagueEntriesSchema,
  matchSchema,
  timelineSchema,
} from "../../src/riot/schemas";
import { FakeClock } from "./fake-clock";

const fixture = (name: string): Promise<unknown> =>
  file(new URL(`../fixtures/${name}.json`, import.meta.url)).json();

it.each([
  ["EUW1_SR", 420],
  ["EUW1_ARAM", 450],
] as const)(
  "validates live-recorded match and timeline fields for %s",
  async (id, queue) => {
    const match = matchSchema.parse(await fixture(`match-${id}`));
    const timeline = timelineSchema.parse(await fixture(`timeline-${id}`));

    expect(match.metadata.matchId).toBe(id);
    expect(match.info.queueId).toBe(queue);
    expect(match.info.participants).toHaveLength(10);
    expect(timeline.metadata.matchId).toBe(id);
    const events = timeline.info.frames.flatMap(({ events: frame }) => frame);
    expect(events.some(({ type }) => type === "SKILL_LEVEL_UP")).toBe(true);
    expect(events.some(({ type }) => type === "ITEM_PURCHASED")).toBe(true);
  }
);

it("retains all seven authoritative final item slots for the ten recorded SR participants", async () => {
  const raw = await fixture("match-EUW1_SR");
  const client = new RiotClient({
    apiKey: "test-token",
    limiter: new RiotRateLimiter(new FakeClock()),
    platform: "euw1",
    region: "europe",
    transport: () => Promise.resolve(Response.json(raw)),
  });
  const {
    info: { participants },
  } = await client.match("EUW1_SR");
  expect(participants).toHaveLength(10);
  for (const participant of participants) {
    expect(participant).toMatchObject({
      item0: expect.any(Number),
      item1: expect.any(Number),
      item2: expect.any(Number),
      item3: expect.any(Number),
      item4: expect.any(Number),
      item5: expect.any(Number),
      item6: expect.any(Number),
    });
    expect(participant).not.toHaveProperty("puuid");
  }
  expect(participants[0]).toMatchObject({
    item0: 3009,
    item1: 3742,
    item2: 3110,
    item3: 6662,
    item4: 6610,
    item5: 3036,
    item6: 3340,
  });
});

it("validates the three scrubbed Emerald I seeds", async () => {
  const entries = leagueEntriesSchema.parse(
    await fixture("league-exp-emerald-i")
  );

  expect(entries).toEqual([
    { puuid: "puuid-1" },
    { puuid: "puuid-2" },
    { puuid: "puuid-3" },
  ]);
});
