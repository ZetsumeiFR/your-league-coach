import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  championIconUrl,
  fetchChampions,
  fetchItems,
  fetchRunes,
  fetchSummonerSpells,
  fetchVersions,
  itemIconUrl,
  type Locale,
  runeIconUrl,
  spellIconUrl,
} from "@your-league-coach/lol-data/ddragon";
import { useEffect, useMemo, useRef } from "react";
import { ddragonLocale } from "@/i18n/translate";
import { useLanguage } from "@/i18n/use-t";

import { desktop } from "./desktop/events";
import { useServerStatus } from "./server-status";

const LATEST_VERSION_FRESH_FOR_MS = 6 * 60 * 60_000;

/** Static data of one Data Dragon version and locale never changes: fetch it once. */
const ddragonQuery =
  <Data>(
    resource: string,
    fetchResource: (version: string, locale: Locale) => Promise<Data>
  ) =>
  (version: string, locale: Locale) =>
    queryOptions({
      queryKey: ["ddragon", version, locale, resource],
      queryFn: () => fetchResource(version, locale),
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    });

export const championsQuery = ddragonQuery("champions", fetchChampions);
const itemsQuery = ddragonQuery("items", fetchItems);
const runesQuery = ddragonQuery("runes", fetchRunes);
const spellsQuery = ddragonQuery("spells", fetchSummonerSpells);

/**
 * The version the server's statistics use. Without an answer from the server
 * (not set up, unreachable, no patch yet) the latest published version stands
 * in, so champion data is still available.
 */
export const useDdragonVersion = (): string | null => {
  const { status } = useServerStatus();
  const serverVersion =
    status.kind === "online" ? status.meta.ddragonVersion : null;
  const latest = useQuery({
    queryKey: ["ddragon", "latest-version"],
    queryFn: async () => {
      const [version] = await fetchVersions();
      return version;
    },
    enabled: status.kind !== "pending" && serverVersion === null,
    staleTime: LATEST_VERSION_FRESH_FOR_MS,
  });
  return serverVersion ?? latest.data ?? null;
};

/** One resource, in the version the statistics use and the app's language. */
const useStaticData = <Data>(query: ReturnType<typeof ddragonQuery<Data>>) => {
  const version = useDdragonVersion();
  const locale = ddragonLocale(useLanguage());
  const { data } = useQuery({
    ...query(version ?? "", locale),
    enabled: version !== null,
  });
  return { data, version };
};

const useChampions = () => {
  const { data, version } = useStaticData(championsQuery);
  return { champions: data, version };
};

/**
 * What a screen shows of a champion, an item, a rune or a summoner spell: its
 * name in the app's language and its icon.
 */
export interface AssetCard {
  iconUrl: string;
  name: string;
}
/** Null for an id Data Dragon does not know, and for every id until it has answered. */
export type FindAsset = (id: number) => AssetCard | null;
export type ChampionCard = AssetCard;
export type FindChampion = FindAsset;

export const useChampionLookup = (): FindChampion => {
  const { champions, version } = useChampions();
  return useMemo(() => {
    const cards = new Map(
      (champions ?? []).map(({ id, key, name }) => [
        key,
        { name, iconUrl: championIconUrl(version ?? "", id) },
      ])
    );
    return (championId) => cards.get(championId) ?? null;
  }, [champions, version]);
};

export const useItemLookup = (): FindAsset => {
  const { data: items, version } = useStaticData(itemsQuery);
  return useMemo(() => {
    const cards = new Map(
      (items ?? []).map(({ id, name }) => [
        id,
        { name, iconUrl: itemIconUrl(version ?? "", id) },
      ])
    );
    return (itemId) => cards.get(itemId) ?? null;
  }, [items, version]);
};

export const useSpellLookup = (): FindAsset => {
  const { data: spells, version } = useStaticData(spellsQuery);
  return useMemo(() => {
    const cards = new Map(
      (spells ?? []).map(({ id, key, name }) => [
        key,
        { name, iconUrl: spellIconUrl(version ?? "", id) },
      ])
    );
    return (spellId) => cards.get(spellId) ?? null;
  }, [spells, version]);
};

/** Runes and rune trees share one range of ids, so one lookup finds both. */
export const useRuneLookup = (): FindAsset => {
  const { data: trees } = useStaticData(runesQuery);
  return useMemo(() => {
    const cards = new Map<number, AssetCard>();
    for (const tree of trees ?? []) {
      cards.set(tree.id, { name: tree.name, iconUrl: runeIconUrl(tree.icon) });
      for (const rune of tree.slots.flatMap((slot) => slot.runes)) {
        cards.set(rune.id, {
          name: rune.name,
          iconUrl: runeIconUrl(rune.icon),
        });
      }
    }
    return (runeId) => cards.get(runeId) ?? null;
  }, [trees]);
};

/**
 * Hands the live connector the champion id -> numeric key catalog it needs to
 * read a game, once per Data Dragon version.
 */
export const useChampionCatalogSync = () => {
  const { champions, version } = useChampions();
  const sentVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!(version && champions) || sentVersion.current === version) {
      return;
    }
    sentVersion.current = version;
    const championIds = Object.fromEntries(
      champions.map(({ id, key }) => [id, key])
    );
    desktop.setChampionIds(championIds).catch(() => {
      // Refused or not delivered: forget the version so the next change of
      // version or data sends it again. Until then the connector reports
      // "waiting_for_catalog", which the in-game screen shows.
      sentVersion.current = null;
    });
  }, [version, champions]);
};
