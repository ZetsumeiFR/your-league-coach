import { sentinel } from "../lcu/accounts";
import allGameData from "./allgamedata.json";

const armorItems = [3047, 3075, 3110].map((itemID, slot) => ({
  count: 1,
  displayName: sentinel,
  itemID,
  slot,
}));

/** What the Live Client reports; `armored` gives every enemy three armor items. */
export const liveGameData = (armored: boolean) => ({
  ...allGameData,
  allPlayers: allGameData.allPlayers.map((player) =>
    armored && player.team === "CHAOS"
      ? { ...player, items: armorItems }
      : player
  ),
});
