type Formatter = { relativeTime(date: Date | number, now?: Date | number): string };

/**
 * "5 minutes ago" in the UI language. The browser's Bangla data says "পূর্বে" for seconds
 * and years but "আগে" for the rest, and spells hours "ঘন্টা", so one list read
 * "৫৯ সেকেন্ড পূর্বে" next to "২ মিনিট আগে". Bangla times here always say আগে and ঘণ্টা,
 * as the rest of the app does; other languages are left as they are.
 */
export function relativeTime(format: Formatter, date: Date | number, now?: Date | number): string {
  return format.relativeTime(date, now).replace("পূর্বে", "আগে").replace("ঘন্টা", "ঘণ্টা");
}
