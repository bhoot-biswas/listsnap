/** Where a conversation falls in the list: by the seller's calendar day, not by hours ago. */
export type ChatGroup = "today" | "yesterday" | "week" | "older";

const DAY = 86_400_000;

/** Days from `date` to `now` in that time zone; 0 is the same calendar day. */
export function daysBetween(date: Date, now: Date, timeZone: string): number {
  // en-CA writes dates as YYYY-MM-DD, which parses as that day's UTC midnight
  const day = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone }).format(d));
  return Math.round((day(now) - day(date)) / DAY);
}

export function chatGroup(date: Date, now: Date, timeZone: string): ChatGroup {
  const days = daysBetween(date, now, timeZone);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? "week" : "older";
}
