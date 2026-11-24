import { SKILL_KEYS, type SkillKey } from "@your-league-coach/lol-data/types";
import { Badge } from "@your-league-coach/ui/components/reui/badge";

import { useT } from "@/i18n/use-t";
import { maxOrder, openingSkills, SKILL_LEVELS } from "@/lib/build/skills";

const OPENING_LEVELS = [1, 2, 3] as const;

/**
 * One cell of the level grid. The small Badge sets its text below the app's
 * smallest size, so the letter carries its own size, in a box of one width
 * for every letter: each level then makes a column as wide as the others.
 */
function LevelCell({ skill }: { skill: SkillKey | null }) {
  return (
    <span className="flex justify-center">
      {skill ? (
        <Badge size="sm">
          <span className="w-3 text-center text-xs">{skill}</span>
        </Badge>
      ) : (
        <Badge aria-hidden="true" size="sm" variant="outline" />
      )}
    </span>
  );
}

export function SkillOrder({ skillOrder }: { skillOrder: SkillKey[] }) {
  const t = useT();
  const opening = openingSkills(skillOrder);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{t("build.skills.title")}</h3>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <dt className="text-muted-foreground text-xs">
          {t("build.skills.opening")}
        </dt>
        <dd className="flex items-center gap-1">
          {OPENING_LEVELS.map((level) => (
            <Badge key={level} variant="outline">
              {opening[level - 1]}
            </Badge>
          ))}
        </dd>
        <dt className="text-muted-foreground text-xs">
          {t("build.skills.maxOrder")}
        </dt>
        <dd className="flex items-center gap-1">
          {maxOrder(skillOrder).map((skill, rank) => (
            <span className="flex items-center gap-1" key={skill}>
              {rank > 0 ? (
                <span
                  aria-hidden="true"
                  className="text-muted-foreground text-xs"
                >
                  &gt;
                </span>
              ) : null}
              <Badge>{skill}</Badge>
            </span>
          ))}
        </dd>
      </dl>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-px">
          <caption className="sr-only">{t("build.skills.grid")}</caption>
          <thead>
            <tr>
              <td />
              {SKILL_LEVELS.map((level) => (
                <th
                  className="text-center font-normal text-muted-foreground text-xs tabular-nums"
                  key={level}
                  scope="col"
                >
                  {level}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SKILL_KEYS.map((skill) => (
              <tr key={skill}>
                <th
                  className="pe-1.5 text-start font-medium text-xs"
                  scope="row"
                >
                  {skill}
                </th>
                {SKILL_LEVELS.map((level) => (
                  <td className="p-0" key={level}>
                    <LevelCell
                      skill={skillOrder[level - 1] === skill ? skill : null}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
