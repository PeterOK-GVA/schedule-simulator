/**
 * Time logic regression tests for the schedule simulator.
 *
 * The canonical day-change specification requires that Zulu and Local
 * deltas are computed independently from UTC inputs — never by comparing
 * local clock times at origin and destination.
 *
 * These tests enforce the spec and guard against the "eastbound clock trap"
 * where naive comparison of local STD/STA produces wrong +1 values.
 */

import { describe, it, expect } from 'vitest';
import {
  DAY_MINS, WEEK_MINS,
  toHHMM, parseHHMM,
  localTime, localDayShift, shiftDOW,
  dayShiftUtc, dayShiftLocal,
} from '../src/utils/time.js';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
describe('Constants', () => {
  it('DAY_MINS is 1440', () => {
    expect(DAY_MINS).toBe(1440);
  });
  it('WEEK_MINS is 10080', () => {
    expect(WEEK_MINS).toBe(10080);
  });
});

// ─────────────────────────────────────────────────────────────
// toHHMM — formatting with day-wrap
// ─────────────────────────────────────────────────────────────
describe('toHHMM', () => {
  it('formats midnight', () => expect(toHHMM(0)).toBe('00:00'));
  it('formats 10:00', () => expect(toHHMM(600)).toBe('10:00'));
  it('formats 23:59', () => expect(toHHMM(1439)).toBe('23:59'));
  it('wraps overflow (1500 → 01:00)', () => expect(toHHMM(1500)).toBe('01:00'));
  it('wraps negative (-60 → 23:00)', () => expect(toHHMM(-60)).toBe('23:00'));
  it('wraps exact multiple of day', () => expect(toHHMM(2880)).toBe('00:00'));
  it('pads single-digit minutes', () => expect(toHHMM(65)).toBe('01:05'));
});

// ─────────────────────────────────────────────────────────────
// parseHHMM — parsing
// ─────────────────────────────────────────────────────────────
describe('parseHHMM', () => {
  it('parses 00:00', () => expect(parseHHMM('00:00')).toBe(0));
  it('parses 23:59', () => expect(parseHHMM('23:59')).toBe(1439));
  it('parses 09:30', () => expect(parseHHMM('09:30')).toBe(570));
  it('rejects 24:00', () => expect(parseHHMM('24:00')).toBe(null));
  it('rejects 12:60', () => expect(parseHHMM('12:60')).toBe(null));
  it('rejects garbage', () => expect(parseHHMM('abc')).toBe(null));
  it('rejects empty string', () => expect(parseHHMM('')).toBe(null));
  it('rejects null', () => expect(parseHHMM(null)).toBe(null));
});

// ─────────────────────────────────────────────────────────────
// localTime — UTC → local minute conversion
// ─────────────────────────────────────────────────────────────
describe('localTime', () => {
  it('HKG UTC+8 at 00:00Z → 08:00 local', () => {
    expect(localTime(0, 8)).toBe(480);
  });
  it('EST UTC-5 at 10:00Z → 05:00 local', () => {
    expect(localTime(600, -5)).toBe(300);
  });
  it('HKG UTC+8 at 22:00Z → 06:00 local (next calendar day)', () => {
    expect(localTime(1320, 8)).toBe(360);
  });
  it('EST UTC-5 at 02:00Z → 21:00 local (previous calendar day)', () => {
    expect(localTime(120, -5)).toBe(1260);
  });
  it('India UTC+5.5 at 00:00Z → 05:30 local', () => {
    expect(localTime(0, 5.5)).toBe(330);
  });
  it('Nepal UTC+5.75 at 00:00Z → 05:45 local', () => {
    expect(localTime(0, 5.75)).toBe(345);
  });
  it('Chatham UTC+12.75 at 00:00Z → 12:45 local', () => {
    expect(localTime(0, 12.75)).toBe(765);
  });
});

// ─────────────────────────────────────────────────────────────
// localDayShift — UTC day → local day delta
// ─────────────────────────────────────────────────────────────
describe('localDayShift', () => {
  it('no shift at noon UTC+0', () => expect(localDayShift(720, 0)).toBe(0));
  it('HKG UTC+8 at 22:00Z → +1 (local is next day)', () => {
    expect(localDayShift(1320, 8)).toBe(1);
  });
  it('EST UTC-5 at 02:00Z → -1 (local is previous day)', () => {
    expect(localDayShift(120, -5)).toBe(-1);
  });
  it('HKG UTC+8 at 10:00Z → 0 (same day)', () => {
    expect(localDayShift(600, 8)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// shiftDOW — day-of-week wrapping
// ─────────────────────────────────────────────────────────────
describe('shiftDOW', () => {
  it('shifts Monday +1 → Tuesday', () => expect(shiftDOW([1], 1)).toEqual([2]));
  it('shifts Sunday +1 → Monday', () => expect(shiftDOW([7], 1)).toEqual([1]));
  it('shifts Monday -1 → Sunday', () => expect(shiftDOW([1], -1)).toEqual([7]));
  it('shifts multiple days', () => expect(shiftDOW([1, 3, 5], 2)).toEqual([3, 5, 7]));
  it('shifts by 0 returns same days', () => expect(shiftDOW([2, 4, 6], 0)).toEqual([2, 4, 6]));
});

// ─────────────────────────────────────────────────────────────
// dayShiftUtc — Zulu day delta
// ─────────────────────────────────────────────────────────────
describe('dayShiftUtc', () => {
  it('short flight same day', () => expect(dayShiftUtc(600, 120)).toBe(0));
  it('late flight crosses midnight', () => expect(dayShiftUtc(1320, 300)).toBe(1));
  it('exactly 24h block', () => expect(dayShiftUtc(0, 1440)).toBe(1));
  it('ultra-long 25h flight', () => expect(dayShiftUtc(1380, 1500)).toBe(2));
  it('1 minute before midnight + 1 min = +1', () => expect(dayShiftUtc(1439, 1)).toBe(1));
  it('never negative for valid inputs', () => {
    expect(dayShiftUtc(0, 60)).toBeGreaterThanOrEqual(0);
    expect(dayShiftUtc(1439, 0)).toBeGreaterThanOrEqual(0);
    expect(dayShiftUtc(720, 1000)).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────
// dayShiftLocal — Canonical eastbound long-haul tests
//
// These are the "clock trap" cases where comparing local STD/STA
// clock times would give the wrong answer.
// ─────────────────────────────────────────────────────────────
describe('dayShiftLocal — spec eastbound long-haul routes', () => {
  /**
   * NGO → LAX (canonical spec example)
   * NGO (UTC+9) dep 13:50 local = 04:50 UTC (290 min)
   * Block 10h20m (620 min)
   * LAX (UTC-7 summer) → UTC 15:10 → 08:10 local same day
   * Naive clock comparison says +1, reality is 0.
   */
  it('NGO → LAX: 0 Zulu, 0 Local (clock-trap defeated)', () => {
    const dep = 290, block = 620;
    expect(dayShiftUtc(dep, block)).toBe(0);
    expect(dayShiftLocal(dep, block, 9, -7)).toBe(0);
  });

  /**
   * XMN → FAI (eastbound transpacific)
   * XMN (UTC+8) dep 09:00 local = 01:00 UTC (60 min)
   * Block 9h (540 min)
   * FAI (UTC-9 winter) → UTC 10:00 → 01:00 local same day
   */
  it('XMN → FAI winter: 0 Zulu, 0 Local', () => {
    const dep = 60, block = 540;
    expect(dayShiftUtc(dep, block)).toBe(0);
    expect(dayShiftLocal(dep, block, 8, -9)).toBe(0);
  });

  /**
   * ORD → FAI (westbound, crosses UTC midnight but same local day)
   * ORD (UTC-5 summer) dep 14:00 local = 19:00 UTC (1140 min)
   * Block 7h (420 min)
   * UTC arr = 02:00 next UTC day
   * FAI (UTC-8 summer) → 02:00 - 8h = 18:00 previous UTC day = same local day as dep
   */
  it('ORD → FAI summer: +1 Zulu, 0 Local', () => {
    const dep = 1140, block = 420;
    expect(dayShiftUtc(dep, block)).toBe(1);
    expect(dayShiftLocal(dep, block, -5, -8)).toBe(0);
  });

  /**
   * MIA → FAI (similar westbound pattern)
   * MIA (UTC-4 summer) dep 18:00 local = 22:00 UTC (1320 min)
   * Block 9h (540 min)
   * UTC arr = 07:00 next UTC day
   * FAI (UTC-8 summer) → 07:00 - 8h = 23:00 previous UTC day = same local day as dep
   */
  it('MIA → FAI summer: +1 Zulu, 0 Local', () => {
    const dep = 1320, block = 540;
    expect(dayShiftUtc(dep, block)).toBe(1);
    expect(dayShiftLocal(dep, block, -4, -8)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Edge cases from spec table
// ─────────────────────────────────────────────────────────────
describe('dayShiftLocal — spec edge case table', () => {
  it('Westbound short-haul crosses UTC midnight: +1/+1', () => {
    // LGG → BCN, both UTC+1, dep 23:00 local = 22:00 UTC, 2h flight
    const dep = 1320, block = 120;
    expect(dayShiftUtc(dep, block)).toBe(1);
    expect(dayShiftLocal(dep, block, 1, 1)).toBe(1);
  });

  it('Red-eye within one timezone: +1/+1', () => {
    // Both UTC+0, dep 23:00, block 4h
    const dep = 1380, block = 240;
    expect(dayShiftUtc(dep, block)).toBe(1);
    expect(dayShiftLocal(dep, block, 0, 0)).toBe(1);
  });

  it('Early-morning short flight: 0/0', () => {
    // UTC+0, dep 08:00, block 2h
    expect(dayShiftUtc(480, 120)).toBe(0);
    expect(dayShiftLocal(480, 120, 0, 0)).toBe(0);
  });

  it('Crosses UTC midnight, arrives before local midnight: +1/0', () => {
    // dep 22:00 UTC, block 4h, origin UTC+3, dest UTC-2
    // lDep = 1320 + 180 = 1500 (25:00 local origin)
    // lArr = 1320 + 240 - 120 = 1440 (24:00 local destination)
    // floor(1440/1440) - floor(1500/1440) = 1 - 1 = 0
    expect(dayShiftUtc(1320, 240)).toBe(1);
    expect(dayShiftLocal(1320, 240, 3, -2)).toBe(0);
  });

  it('Westbound transpacific LAX→NRT red-eye: 0 Zulu, +2 Local', () => {
    // LAX (UTC-7) dep 23:00 local = 06:00 next UTC day → stored as dep=360
    // Block 11h = 660
    // UTC arr = 17:00 same UTC day (no cross)
    // NRT (UTC+9) → 02:00 next local day
    // lDep = 360 - 420 = -60 (23:00 previous local day)
    // lArr = 360 + 660 + 540 = 1560 (26:00 = 02:00 next local day)
    // floor(1560/1440) - floor(-60/1440) = 1 - (-1) = 2
    expect(dayShiftUtc(360, 660)).toBe(0);
    expect(dayShiftLocal(360, 660, -7, 9)).toBe(2);
  });

  it('Eastbound dateline crossing can produce -1 Local', () => {
    // Fiji (UTC+12) dep 10:00 local = 22:00 previous UTC day
    // Stored as dep=1320 on that prior UTC day. Block 2h to Honolulu (UTC-10)
    // UTC arr = 1320 + 120 = 1440
    // lDep = 1320 + 720 = 2040 (34:00 = 10:00 day+1 local)
    // lArr = 1320 + 120 - 600 = 840 (14:00 day 0 local)
    // floor(840/1440) - floor(2040/1440) = 0 - 1 = -1
    expect(dayShiftLocal(1320, 120, 12, -10)).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────
// Fractional UTC offsets
// ─────────────────────────────────────────────────────────────
describe('dayShiftLocal — fractional UTC offsets', () => {
  it('India UTC+5.5 → UTC+5.5 short flight', () => {
    // dep 22:00 UTC (1320), block 2h (120)
    // lDep = 1320 + 330 = 1650 (27:30 = 03:30 next local day)
    // lArr = 1320 + 120 + 330 = 1770 (29:30 = 05:30 next local day)
    // floor(1770/1440) - floor(1650/1440) = 1 - 1 = 0
    expect(dayShiftLocal(1320, 120, 5.5, 5.5)).toBe(0);
  });

  it('Chatham UTC+12.75 to Auckland UTC+13 (summer)', () => {
    // dep 10:00 UTC (600), block 1h (60)
    // lDep = 600 + 765 = 1365 (22:45 local)
    // lArr = 600 + 60 + 780 = 1440 (00:00 next day local)
    // floor(1440/1440) - floor(1365/1440) = 1 - 0 = 1
    expect(dayShiftLocal(600, 60, 12.75, 13)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Purity / week consistency
// ─────────────────────────────────────────────────────────────
describe('Pure function invariants', () => {
  it('same STD produces same delta on repeated calls (purity)', () => {
    // Spec: "A flight that operates every week with the same STD should
    // always produce the same +/- value across all instances"
    const cases = [
      [290, 620, 9, -7],     // NGO → LAX
      [1140, 420, -5, -8],   // ORD → FAI
      [1320, 540, -4, -8],   // MIA → FAI
      [1320, 240, 3, -2],    // crosses UTC midnight
    ];
    for (const [dep, block, orig, dest] of cases) {
      const a = dayShiftLocal(dep, block, orig, dest);
      const b = dayShiftLocal(dep, block, orig, dest);
      const c = dayShiftLocal(dep, block, orig, dest);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  it('dayShiftUtc never depends on offsets', () => {
    // Zulu delta is frame-of-reference independent
    expect(dayShiftUtc(600, 120)).toBe(dayShiftUtc(600, 120));
    expect(dayShiftUtc(1320, 300)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// SSIM DOW round-trip (regression for recent fix)
//
// Export writes local departure day (IATA Ch.7 standard).
// Import converts it back to UTC day. Must round-trip.
// ─────────────────────────────────────────────────────────────
describe('SSIM DOW round-trip', () => {
  it('HKG 22:00Z Monday → local Tuesday → recovered UTC Monday', () => {
    const utcDay = 1;      // Monday
    const dep = 1320;       // 22:00 UTC
    const origOffset = 8;   // HKG UTC+8

    // Export path: convert UTC day → local departure day
    const depShift = localDayShift(dep, origOffset);
    const localDay = ((utcDay - 1 + depShift + 7) % 7) + 1;
    expect(localDay).toBe(2);  // Tuesday local (06:00 local)

    // Import path: convert local departure day back to UTC day
    // (Replicates inline formula from SSIM parseSSIM, using minutes)
    const depOffMinutes = origOffset * 60;
    const depDayShift = Math.floor((dep + depOffMinutes) / DAY_MINS);
    const recoveredUtcDay = ((localDay - 1 - depDayShift + 7) % 7) + 1;
    expect(recoveredUtcDay).toBe(utcDay);
  });

  it('EST 02:00Z Monday → local Sunday → recovered UTC Monday', () => {
    const utcDay = 1;
    const dep = 120;        // 02:00 UTC
    const origOffset = -5;  // EST

    const depShift = localDayShift(dep, origOffset);
    const localDay = ((utcDay - 1 + depShift + 7) % 7) + 1;
    expect(localDay).toBe(7);  // Sunday local (21:00 Sunday)

    const depOffMinutes = origOffset * 60;
    const depDayShift = Math.floor((dep + depOffMinutes) / DAY_MINS);
    const recoveredUtcDay = ((localDay - 1 - depDayShift + 7) % 7) + 1;
    expect(recoveredUtcDay).toBe(utcDay);
  });

  it('Same-day flight (HKG 10:00Z Monday) round-trips unchanged', () => {
    const utcDay = 1;
    const dep = 600;        // 10:00 UTC
    const origOffset = 8;

    const depShift = localDayShift(dep, origOffset);
    const localDay = ((utcDay - 1 + depShift + 7) % 7) + 1;
    expect(localDay).toBe(1);  // Still Monday local (18:00 local)

    const depOffMinutes = origOffset * 60;
    const depDayShift = Math.floor((dep + depOffMinutes) / DAY_MINS);
    const recoveredUtcDay = ((localDay - 1 - depDayShift + 7) % 7) + 1;
    expect(recoveredUtcDay).toBe(utcDay);
  });
});
