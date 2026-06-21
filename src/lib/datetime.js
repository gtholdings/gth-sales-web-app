import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

/**
 * App timezone. Due dates are DATE (no tz) and serverless runs in UTC, so all
 * "today / day boundary" math must be done in Sri Lanka local time.
 */
export const APP_TZ = 'Asia/Colombo';

/** Current instant expressed as a Date in app-local (Colombo) wall-clock time. */
export function appNow() {
  return toZonedTime(new Date(), APP_TZ);
}

/** Today's date in app tz as 'YYYY-MM-DD'. */
export function appTodayYMD() {
  return format(appNow(), 'yyyy-MM-dd');
}

/**
 * Convert a Colombo wall-clock day boundary to a UTC instant, for range
 * filtering on timestamptz columns. e.g. zonedDayStart('2026-06-01') => the
 * UTC instant of Colombo midnight on that day.
 */
export function zonedDayStart(ymd) {
  return fromZonedTime(`${ymd}T00:00:00`, APP_TZ);
}
