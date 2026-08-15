/**
 * temporal — date and timestamp primitives, hand-rolled on purpose.
 *
 * Zod's built-in date/datetime helpers have moved between major versions. This
 * corpus is meant to outlive a zod upgrade, so the exact accepted grammar lives
 * here in ~30 lines we own, and is asserted by tests. Two rules matter:
 *
 *   1. A calendar date must be a real day. `2026-02-30` matches the regex and
 *      is still not a date; `new Date()` silently rolls it over to March 2nd,
 *      which would put a fabricated deadline into the ground truth.
 *   2. A timestamp must carry an offset (`Z` or `+05:30`). Half this corpus is
 *      IST and half the tooling that will read it runs in UTC. An offset-less
 *      timestamp is not a point in time, and thread ordering would depend on
 *      whose laptop parsed it.
 */

import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** True if `value` is `YYYY-MM-DD` AND names a day that exists. */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  // Day 0 of month m+1 is the last day of month m. UTC avoids local-DST drift.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= lastDay;
}

/** True if `value` is an ISO 8601 timestamp with an explicit offset, and parses. */
export function isTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP.test(value)) return false;
  if (!isCalendarDate(value.slice(0, 10))) return false;
  return !Number.isNaN(Date.parse(value));
}

/** `YYYY-MM-DD`, restricted to days that exist. Used by `deadline.resolved`. */
export const IsoDateSchema = z
  .string()
  .refine(isCalendarDate, { message: "must be a real calendar date in YYYY-MM-DD form" });

/** ISO 8601 instant with a required UTC offset. Used by `message.ts`. */
export const IsoTimestampSchema = z.string().refine(isTimestamp, {
  message: "must be an ISO 8601 timestamp with an explicit offset (e.g. 2026-03-04T18:20:00+05:30)",
});
