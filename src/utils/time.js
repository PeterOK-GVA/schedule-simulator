/**
 * Time conversion utilities for the schedule simulator.
 *
 * Conventions:
 *  - All times are stored as UTC minutes-of-day (0-1439).
 *  - Day-of-week values are 1-7 (Monday=1, Sunday=7).
 *  - UTC offsets are passed in HOURS (e.g. 8 for HKG, -5 for EST).
 *    Fractional offsets are supported (India UTC+5.5, Chatham UTC+12.75).
 *
 * Day-change principle (see design notes):
 *  Day-change is a CALENDAR-DATE DELTA, not a time-of-day delta.
 *  Never infer it by comparing STD and STA clock times at two airports —
 *  they are measured against different clocks and cannot be subtracted.
 *  Zulu and Local deltas are INDEPENDENT reference frames.
 */

export const DAY_MINS  = 24 * 60;        // 1440
export const WEEK_MINS = 7 * DAY_MINS;   // 10080

/** Minutes → "HH:MM" string, wrapping within a single day */
export function toHHMM(mins) {
  const t = ((mins % DAY_MINS) + DAY_MINS) % DAY_MINS;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Parse "HH:MM" string → minutes, or null if invalid */
export function parseHHMM(str) {
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]), mm = parseInt(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * UTC minutes → local minutes, wrapped to a single day (0-1439).
 * @param {number} utcMins - UTC minutes of day (0-1439)
 * @param {number} utcOffset - UTC offset in HOURS (may be fractional)
 */
export function localTime(utcMins, utcOffset) {
  return ((utcMins + utcOffset * 60) % DAY_MINS + DAY_MINS) % DAY_MINS;
}

/**
 * How many full days does local time shift from UTC for a given departure?
 * Returns -1, 0, or +1 for all real-world UTC offsets (-12 to +14).
 */
export function localDayShift(depMins, utcOffset) {
  return Math.floor((depMins + utcOffset * 60) / DAY_MINS);
}

/** Shift DOW array by ±N days (wrapping 1-7) */
export function shiftDOW(days, shift) {
  return days.map(d => ((d - 1 + shift + 700) % 7) + 1).sort((a, b) => a - b);
}

/**
 * Day-change in Zulu (UTC) reference frame: how many calendar days pass
 * between UTC departure and UTC arrival.
 * Always >= 0 for valid inputs (positive block time).
 */
export function dayShiftUtc(depMins, blockMins) {
  return Math.floor((depMins + blockMins) / DAY_MINS) - Math.floor(depMins / DAY_MINS);
}

/**
 * Day-change in Local reference frame: how many calendar days pass between
 * LOCAL departure date at origin and LOCAL arrival date at destination.
 *
 * CRITICAL: depMins must be in UTC. Never pass local minutes.
 *
 * Can be negative (e.g. eastbound dateline crossing where local arrival
 * is "earlier" than local departure in calendar terms).
 *
 * @param {number} depMins - UTC departure time in minutes of day (0-1439)
 * @param {number} blockMins - Block time in minutes
 * @param {number} origOffset - Origin UTC offset in HOURS
 * @param {number} destOffset - Destination UTC offset in HOURS
 */
export function dayShiftLocal(depMins, blockMins, origOffset, destOffset) {
  const lDep = depMins + origOffset * 60;
  const lArr = depMins + blockMins + destOffset * 60;
  return Math.floor(lArr / DAY_MINS) - Math.floor(lDep / DAY_MINS);
}
