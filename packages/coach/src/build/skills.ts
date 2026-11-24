import { SKILL_KEYS, type SkillKey } from "@your-league-coach/lol-data/types";

const OPENING_LEVELS = 3;
const MAX_LEVEL = 18;
const MAX_BASIC_RANK = 5;
const ULTIMATE_LEVELS = [6, 11, 16];

function isBasicSkill(key: string): key is Exclude<SkillKey, "R"> {
  return key !== "R" && SKILL_KEYS.some((skill) => skill === key);
}

/** Expands the aggregate's `QEW|Q>E>W` key using standard rank gates. */
export function expandSkillOrder(key: string): SkillKey[] | null {
  const [openingKey = "", priorityKey = "", ...extra] = key.split("|");
  const opening = [...openingKey];
  const priority = priorityKey.split(">");
  if (
    extra.length > 0 ||
    opening.length !== OPENING_LEVELS ||
    !opening.every(isBasicSkill) ||
    opening[0] === opening[1] ||
    priority.length !== OPENING_LEVELS ||
    !priority.every(isBasicSkill) ||
    new Set(priority).size !== OPENING_LEVELS
  ) {
    return null;
  }

  const order: SkillKey[] = [...opening];
  for (let level = OPENING_LEVELS + 1; level <= MAX_LEVEL; level += 1) {
    if (ULTIMATE_LEVELS.includes(level)) {
      order.push("R");
      continue;
    }
    const rankCap = Math.min(Math.ceil(level / 2), MAX_BASIC_RANK);
    const next = priority.find(
      (skill) => order.filter((picked) => picked === skill).length < rankCap
    );
    if (!next) {
      return null;
    }
    order.push(next);
  }
  return order;
}
