import { sentinel, summoner } from "./accounts";

export const runePages = [
  {
    current: false,
    id: 101,
    isDeletable: true,
    name: sentinel,
    primaryStyleId: 8000,
    selectedPerkIds: [],
    subStyleId: 8100,
  },
  {
    current: true,
    id: 102,
    isDeletable: true,
    name: sentinel,
    primaryStyleId: 8000,
    selectedPerkIds: [],
    subStyleId: 8100,
  },
];
export const runeInventory = { ownedPageCount: 3 };
export const itemSets = {
  accountId: summoner.summonerId,
  itemSets: [
    { associatedChampions: [], blocks: [], title: sentinel, uid: "user-set" },
  ],
};
export const selection = { spell1Id: 4, spell2Id: 14 };
