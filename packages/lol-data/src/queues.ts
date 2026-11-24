export const QUEUES = {
  RANKED_SOLO: 420,
  RANKED_FLEX: 440,
  NORMAL_DRAFT: 400,
  ARAM: 450,
} as const;

export type StatsGroup = "sr" | "aram";

export const queueToStatsGroup = (queueId: number): StatsGroup | null => {
  switch (queueId) {
    case QUEUES.RANKED_SOLO:
    case QUEUES.RANKED_FLEX:
    case QUEUES.NORMAL_DRAFT:
      return "sr";
    case QUEUES.ARAM:
      return "aram";
    default:
      return null;
  }
};
