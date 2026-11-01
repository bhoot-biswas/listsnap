import "server-only";

/**
 * SQL for counting by the Dhaka day (UTC+6 all year, see lib/dhaka-day.ts). Timestamps
 * are stored in UTC; shifting them six hours gives the date a seller in Bangladesh sees.
 */

/** The Dhaka date a timestamp column falls on, as YYYY-MM-DD. */
export const dhakaDate = (column: string) => `DATE_FORMAT(${column} + INTERVAL 6 HOUR, '%Y-%m-%d')`;

/** The UTC moment the Dhaka day `daysAgo` days back began (0 is today). */
export const dhakaDayStart = (daysAgo = 0) =>
  `(TIMESTAMP(DATE(UTC_TIMESTAMP() + INTERVAL 6 HOUR)) - INTERVAL 6 HOUR - INTERVAL ${Math.trunc(daysAgo)} DAY)`;
