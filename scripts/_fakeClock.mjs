// A FIXED FAKE CLOCK for checks (Lane G, Oct 29 2026). A check that reads the real time passes in the morning and fails after lunch (holdPageCheck and holdZeroCheck
// did, the moment 7:00 AM Oct 29 passed). Import this, call useFakeClock(), and Date.now() and new Date() (no argument) answer FAKE_NOW until moveClock(ms) moves them.
// FAKE_NOW is a made-up day (Wed 5 Mar 2031, 07:00 Pacific, before daylight time starts on 9 Mar) so no real date, past or future, is ever the test's date.
// scripts/clockCheck.mjs fails any prePush check that reads the real clock without importing this (or carrying a "clock: real-ok" reason).
export const FAKE_NOW = Date.UTC(2031, 2, 5, 15, 0, 0);
export const FAKE_LAUNCH_ISO = "2031-03-05T09:00:00-08:00";   // two hours after FAKE_NOW: a made-up value for LAUNCH_AT, never a real launch time
export const FAKE_LAUNCH_WORDS = "Wednesday, March 5, 2031, 9:00 AM Pacific Time";
let now = FAKE_NOW; const RealDate = globalThis.Date;
export function useFakeClock(start = FAKE_NOW) {
  now = start;
  class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  globalThis.Date = FakeDate;
}
export const moveClock = ms => { now = ms; };
