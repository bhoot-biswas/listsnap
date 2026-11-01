/**
 * Bangladesh is UTC+6 all year, with no daylight saving, so its calendar day is the UTC
 * clock moved on six hours. Stats count days the way sellers do, from midnight in Dhaka;
 * the daily limits keep their own 6 AM reset (midnight UTC).
 */
export const DHAKA_OFFSET_MS = 6 * 3_600_000;

/** The Dhaka date, as YYYY-MM-DD, `daysAgo` days before `now`. */
export function dhakaDay(now: Date | number = Date.now(), daysAgo = 0): string {
  return new Date(Number(now) + DHAKA_OFFSET_MS - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
