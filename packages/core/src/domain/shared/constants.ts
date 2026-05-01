/**
 * Time-unit building blocks. Multiply by the count of seconds/minutes/hours
 * you actually need (e.g. `30 * MS_PER_DAY` for a 30-day TTL) instead of
 * stacking inline `* 60 * 60 * 1000` arithmetic at every call site.
 *
 * Naming follows the rest of the codebase — TTLs / backoffs / windows
 * already end in `_MS`, so callers can keep that convention while sourcing
 * the unit factor from here.
 */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
