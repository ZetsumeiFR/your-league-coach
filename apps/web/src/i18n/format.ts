import type { Language } from "./translate";

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Below two days, hours read better than "yesterday". */
const HOURS_SHOWN_UNTIL = 48;

export const formatNumber = (language: Language, value: number): string =>
  new Intl.NumberFormat(language).format(value);

export const formatTimeAgo = (
  language: Language,
  date: Date,
  now: Date
): string => {
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const minutes = Math.round((date.getTime() - now.getTime()) / MINUTE_MS);
  if (Math.abs(minutes) < MINUTES_PER_HOUR) {
    return format.format(minutes, "minute");
  }
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (Math.abs(hours) < HOURS_SHOWN_UNTIL) {
    return format.format(hours, "hour");
  }
  return format.format(Math.round(hours / HOURS_PER_DAY), "day");
};
