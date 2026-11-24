import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  championIconUrl,
  fetchChampions,
  fetchVersions,
  type Locale,
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

const useChampions = () => {
  const version = useDdragonVersion();
  const locale = ddragonLocale(useLanguage());
  const { data } = useQuery({
    ...championsQuery(version ?? "", locale),
    enabled: version !== null,
  });
  return { champions: data, version };
};

/** What a screen shows of a champion: its name in the app's language and its icon. */
export interface ChampionCard {
  iconUrl: string;
  name: string;
}
export type FindChampion = (championId: number) => ChampionCard | null;

/** Null for an id Data Dragon does not know, and for every id until it has answered. */
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
