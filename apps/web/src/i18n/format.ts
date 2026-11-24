import type { Language } from "./translate";

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Below two days, hours read better than "yesterday". */
const HOURS_SHOWN_UNTIL = 48;

export const formatNumber = (language: Language, value: number): string =>
  new Intl.NumberFormat(language).format(value);

const ONE_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const POINTS_PER_UNIT = 100;

/** A share between 0 and 1, such as a win rate: "54.2%". */
export const formatPercent = (language: Language, share: number): string =>
  new Intl.NumberFormat(language, { ...ONE_DECIMAL, style: "percent" }).format(
    share
  );

/** A difference between two shares, in signed percentage points: "+4.7". */
export const formatPoints = (language: Language, difference: number): string =>
  new Intl.NumberFormat(language, {
    ...ONE_DECIMAL,
    signDisplay: "exceptZero",
  }).format(difference * POINTS_PER_UNIT);

/** Which of a text's forms a count takes; every language here has these two. */
export const pluralForm = (language: Language, count: number) =>
  new Intl.PluralRules(language).select(count) === "one" ? "one" : "other";

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
