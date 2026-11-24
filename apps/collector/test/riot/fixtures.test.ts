import { expect, it } from "bun:test";
import { file } from "bun";
import {
  leagueEntriesSchema,
  matchSchema,
  timelineSchema,
} from "../../src/riot/schemas";

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
