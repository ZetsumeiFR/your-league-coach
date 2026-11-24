import type { SkillKey } from "@your-league-coach/lol-data/types";

export const SKILL_LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
] as const;

type BasicSkill = Exclude<SkillKey, "R">;

const BASIC_SKILLS = ["Q", "W", "E"] as const satisfies readonly BasicSkill[];
const OPENING_LEVELS = 3;
const MAX_BASIC_RANK = 5;

export const openingSkills = (order: readonly SkillKey[]): SkillKey[] =>
  order.slice(0, OPENING_LEVELS);

/**
 * The basic skills in the order they reach their last rank. A skill the order
 * never maxes comes after those it does: the one with more points first, then
 * the one taken first.
 */
export const maxOrder = (order: readonly SkillKey[]): BasicSkill[] => {
  const ranked = BASIC_SKILLS.map((skill) => {
    const levels = order.flatMap((taken, index) =>
      taken === skill ? [index] : []
    );
    return {
      skill,
      maxedAt: levels[MAX_BASIC_RANK - 1] ?? order.length,
      points: levels.length,
      firstAt: levels[0] ?? order.length,
    };
  });
  return ranked
    .toSorted(
      (a, b) =>
        a.maxedAt - b.maxedAt || b.points - a.points || a.firstAt - b.firstAt
    )
    .map(({ skill }) => skill);
};
