import { QUEUES } from "@your-league-coach/lol-data/queues";

// Personal key budget per routing host: https://developer.riotgames.com/docs/portal#web-apis_rate-limiting
export const PERSONAL_LIMITS = { perSecond: 20, perTwoMinutes: 100 } as const;
export const SECOND_MS = 1000;
export const TWO_MINUTES_MS = 120 * SECOND_MS;

// Keep recent admissions by count, not by the windows Riot has announced so far.
export const REQUEST_HISTORY_CAPACITY = 1000;

// Shares of the crawl budget, not limits on individual HTTP requests.
export const CRAWL_QUEUE_WEIGHTS = [
  [QUEUES.RANKED_SOLO, 60],
  [QUEUES.ARAM, 20],
  [QUEUES.RANKED_FLEX, 10],
  [QUEUES.NORMAL_DRAFT, 10],
] as const;

export const SERVER_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
export const RATE_LIMIT_RETRIES = 3;
export const DEFAULT_RETRY_AFTER_MS = SECOND_MS;
export const REQUEST_TIMEOUT_MS = 10 * SECOND_MS;
