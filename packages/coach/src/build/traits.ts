import type { Champion } from "@your-league-coach/lol-data/ddragon";
import { ENEMY_BUILD_THRESHOLDS, FRONTLINE_DEFENSE_RATING } from "../constants";

export type ChampionTrait =
  | "heal"
  | "shield"
  | "hard_cc"
  | "tank"
  | "true_damage";
export type CompositionChampion = Readonly<
  Pick<Champion, "id" | "info" | "tags">
>;

// Curated from Riot's champion kits (leagueoflegends.com/en-us/champions).
// Heal means substantial combat sustain; hard_cc means roots or stronger,
// not slows or silences. Missing entries still get Data Dragon-derived traits.
export const CHAMPION_TRAITS: Readonly<
  Partial<Record<string, readonly ChampionTrait[]>>
> = {
  Aatrox: ["heal", "hard_cc"],
  Ahri: ["hard_cc", "true_damage"],
  Alistar: ["heal", "hard_cc", "tank"],
  Amumu: ["hard_cc", "tank", "true_damage"],
  Annie: ["shield", "hard_cc"],
  Ashe: ["hard_cc"],
  Blitzcrank: ["shield", "hard_cc"],
  Braum: ["shield", "hard_cc", "tank"],
  Briar: ["heal", "hard_cc"],
  Camille: ["shield", "hard_cc", "true_damage"],
  Chogath: ["hard_cc", "tank", "true_damage"],
  DrMundo: ["heal", "tank"],
  Fiora: ["heal", "hard_cc", "true_damage"],
  Irelia: ["heal", "hard_cc"],
  Janna: ["heal", "shield", "hard_cc"],
  Karma: ["shield", "hard_cc"],
  Kled: ["hard_cc"],
  Leona: ["hard_cc", "tank"],
  Lulu: ["shield", "hard_cc"],
  Lux: ["shield", "hard_cc"],
  Malphite: ["shield", "hard_cc", "tank"],
  Maokai: ["heal", "hard_cc", "tank"],
  Milio: ["heal", "shield", "hard_cc"],
  Morgana: ["shield", "hard_cc"],
  Nami: ["heal", "hard_cc"],
  Nautilus: ["shield", "hard_cc", "tank"],
  Nidalee: ["heal"],
  Nunu: ["heal", "shield", "hard_cc", "tank"],
  Olaf: ["heal", "shield", "true_damage"],
  Ornn: ["hard_cc", "tank"],
  Rammus: ["hard_cc", "tank"],
  Rell: ["shield", "hard_cc", "tank"],
  Renata: ["shield", "hard_cc"],
  Sejuani: ["hard_cc", "tank"],
  Senna: ["heal", "shield", "hard_cc"],
  Seraphine: ["heal", "shield", "hard_cc"],
  Shen: ["shield", "hard_cc", "tank"],
  Sion: ["shield", "hard_cc", "tank"],
  Sona: ["heal", "shield", "hard_cc"],
  Soraka: ["heal", "hard_cc"],
  Swain: ["heal", "hard_cc"],
  Sylas: ["heal", "hard_cc"],
  TahmKench: ["heal", "shield", "hard_cc", "tank"],
  Taric: ["heal", "shield", "hard_cc", "tank"],
  Thresh: ["shield", "hard_cc", "tank"],
  Vayne: ["hard_cc", "true_damage"],
  Vladimir: ["heal"],
  Volibear: ["heal", "shield", "hard_cc"],
  Warwick: ["heal", "hard_cc"],
  Yuumi: ["heal", "shield"],
  Zac: ["heal", "hard_cc", "tank"],
};

export type EnemyProfileLabel =
  | "ad_heavy"
  | "ap_heavy"
  | "heal_heavy"
  | "tank_heavy"
  | "balanced";

export interface EnemyProfile {
  readonly adShare: number;
  readonly apShare: number;
  readonly hardCc: number;
  readonly healers: number;
  readonly label: EnemyProfileLabel;
  /** Live equipment is independent of the collector's composition label. */
  readonly resistanceItems: number;
  readonly tanks: number;
}

function traitsOf(champion: CompositionChampion): readonly ChampionTrait[] {
  return Object.hasOwn(CHAMPION_TRAITS, champion.id)
    ? (CHAMPION_TRAITS[champion.id] ?? [])
    : [];
}

export function isTank(champion: CompositionChampion): boolean {
  return (
    traitsOf(champion).includes("tank") ||
    champion.tags.includes("Tank") ||
    (champion.info.defense >= FRONTLINE_DEFENSE_RATING &&
      champion.tags.includes("Fighter"))
  );
}

function profileLabel({
  adShare,
  apShare,
  healers,
  tanks,
}: Omit<EnemyProfile, "label" | "resistanceItems">): EnemyProfileLabel {
  const thresholds = ENEMY_BUILD_THRESHOLDS;
  if (healers >= thresholds.healers) {
    return "heal_heavy";
  }
  if (tanks >= thresholds.tanks) {
    return "tank_heavy";
  }
  if (adShare >= thresholds.damageShare) {
    return "ad_heavy";
  }
  return apShare >= thresholds.damageShare ? "ap_heavy" : "balanced";
}

/**
 * Counts champions, not spells. The stronger Data Dragon attack/magic rating
 * gets one vote; equal ratings split a vote. Missing champions do not vote.
 */
export function computeEnemyProfile(
  enemies: readonly (CompositionChampion | null | undefined)[]
): EnemyProfile {
  let adVotes = 0;
  let known = 0;
  let healers = 0;
  let hardCc = 0;
  let tanks = 0;
  for (const enemy of enemies) {
    if (!enemy) {
      continue;
    }
    known += 1;
    const { attack, magic } = enemy.info;
    if (attack >= magic) {
      adVotes += attack === magic ? 0.5 : 1;
    }
    const traits = traitsOf(enemy);
    healers += Number(traits.includes("heal"));
    hardCc += Number(traits.includes("hard_cc"));
    tanks += Number(isTank(enemy));
  }
  const counts = {
    adShare: known === 0 ? 0 : adVotes / known,
    apShare: known === 0 ? 0 : (known - adVotes) / known,
    healers,
    hardCc,
    tanks,
  };
  return { ...counts, label: profileLabel(counts), resistanceItems: 0 };
}
