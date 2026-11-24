import { RANKED_LOCAL_CHAMPION_ID } from "../ids";

export const sentinel = "SENTINEL_NAME_DO_NOT_SHOW";
export const summoner = {
  displayName: sentinel,
  gameName: sentinel,
  internalName: sentinel,
  puuid: "synthetic-local-puuid",
  summonerId: 123,
  tagLine: sentinel,
};
export const regionLocale = { locale: "fr_FR" };
export const championMastery = [
  { championId: RANKED_LOCAL_CHAMPION_ID, championPoints: 42_000 },
];
export const matchHistory = {
  games: {
    games: [
      {
        participantIdentities: [
          {
            participantId: 2,
            player: { summonerId: 999, summonerName: sentinel },
          },
          { participantId: 1, player: summoner },
        ],
        participants: [
          { championId: 2, participantId: 2, stats: { win: false } },
          {
            championId: RANKED_LOCAL_CHAMPION_ID,
            participantId: 1,
            stats: { win: true },
          },
        ],
      },
    ],
  },
};
