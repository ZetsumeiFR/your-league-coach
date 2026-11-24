import {
  type Champion,
  type DdragonOptions,
  fetchChampions,
  fetchItems,
  type Item,
} from "@your-league-coach/lol-data/ddragon";

export interface StaticData {
  readonly champions: readonly Champion[];
  readonly items: readonly Item[];
}

export type StaticDataLoader = (ddragonVersion: string) => Promise<StaticData>;

const LOCALE = "en_US";

const fetchStaticData = async (
  version: string,
  options: DdragonOptions
): Promise<StaticData> => {
  const [champions, items] = await Promise.all([
    fetchChampions(version, LOCALE, options),
    fetchItems(version, LOCALE, options),
  ]);
  return { champions, items };
};

/** Keeps the latest Data Dragon version in memory; a failed fetch is retried on the next call. */
export function createStaticDataLoader(
  options: DdragonOptions = {}
): StaticDataLoader {
  let cached: { version: string; data: Promise<StaticData> } | null = null;
  return async (version) => {
    if (cached?.version !== version) {
      cached = { version, data: fetchStaticData(version, options) };
    }
    const entry = cached;
    try {
      return await entry.data;
    } catch (error) {
      if (cached === entry) {
        cached = null;
      }
      throw error;
    }
  };
}
