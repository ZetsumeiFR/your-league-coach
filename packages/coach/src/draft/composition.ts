import type { Champion } from "@your-league-coach/lol-data/ddragon";
import type { ChampionId } from "@your-league-coach/lol-data/types";
import { DRAFT_DAMAGE, NEUTRAL_WIN_RATE } from "../constants";

export interface ChampionDamageInfo {
  readonly info: Readonly<Pick<Champion["info"], "attack" | "magic">>;
  readonly key: Champion["key"];
}

function damageShare(attack: number, magic: number): number {
  return attack + magic > 0 ? attack / (attack + magic) : NEUTRAL_WIN_RATE;
}

export function compositionScorer(
  allyIds: readonly ChampionId[],
  championInfo: readonly ChampionDamageInfo[]
): (championId: ChampionId) => { penalty: number; balances: boolean } {
  const neutral = { penalty: 0, balances: false };
  if (allyIds.length < DRAFT_DAMAGE.minimumAllies) {
    return () => neutral;
  }
  const byId = new Map(championInfo.map(({ key, info }) => [key, info]));
  let attack = 0;
  let magic = 0;
  for (const id of allyIds) {
    const info = byId.get(id);
    if (!info) {
      return () => neutral;
    }
    attack += info.attack;
    magic += info.magic;
  }
  const before = damageShare(attack, magic);
  return (championId) => {
    const info = byId.get(championId);
    if (!info) {
      return neutral;
    }
    const after = damageShare(attack + info.attack, magic + info.magic);
    const skewed =
      after < DRAFT_DAMAGE.minimumShare || after > DRAFT_DAMAGE.maximumShare;
    return {
      penalty: skewed ? -DRAFT_DAMAGE.penalty : 0,
      balances:
        !skewed &&
        Math.abs(after - NEUTRAL_WIN_RATE) <
          Math.abs(before - NEUTRAL_WIN_RATE),
    };
  };
}
