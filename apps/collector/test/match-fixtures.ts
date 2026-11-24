import type { Item } from "@your-league-coach/lol-data/ddragon";
import { file } from "bun";
import { matchSchema, timelineSchema } from "../src/riot/schemas";

const fixture = (name: string): Promise<unknown> =>
  file(new URL(`./fixtures/${name}.json`, import.meta.url)).json();

export const recorded = async (mode: "SR" | "ARAM") => {
  const [match, timeline] = await Promise.all([
    fixture(`match-EUW1_${mode}`),
    fixture(`timeline-EUW1_${mode}`),
  ]);
  return {
    match: matchSchema.parse(match),
    timeline: timelineSchema.parse(timeline),
  };
};

export const item = (id: number, fields: Partial<Item> = {}): Item => ({
  id,
  name: `Item ${id}`,
  into: [],
  from: [],
  goldTotal: 2600,
  depth: 3,
  onSummonersRift: true,
  onHowlingAbyss: true,
  tags: [],
  ...fields,
});

const completed = [3742, 6695, 3089, 4645, 6610, 3156, 2504, 3031, 3157];
export const exampleItems = new Map(
  [
    ...completed.map((id) => item(id)),
    item(3009, { tags: ["Boots"], depth: 2 }),
  ].map((value) => [value.id, value])
);
