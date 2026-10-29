// CHECKS THAT READ A REAL AUCTION END TIME MUST PIN IT TO THE CLOCK (Oct 29 2026). standingDrawerCheck went red alone, 2 of 2, with no code change:
// the page turns the before-it-ends toggle off inside two hours and drops it once a car has ended (api/buy.js alertSwitchHtml, a real rule), and the
// check opened a real SL65 listing that ended at 17:30 UTC that day. So the check passed at 6:50 AM Pacific and failed from 8:30. The page was right.
// Class: any check that reads a real or stored end time (a live pass-through, a fixture with a date) changes verdict with the hour it runs.
//   A. the pin helper moves the earliest end time to 26 hours ahead of any clock and keeps the gaps, in JSON and in an event stream
//   B. the page rule the pin protects is still there (under two hours: the toggle is off)
//   C. every browser check that drives the toggle imports the helper
//   D. no script gives an end-type key a dated literal between tomorrow and the year 2090 unless named here with its reason
//   node scripts/clockPinCheck.mjs      (offline)
import fs from "node:fs";
import { freshenEndTimes, freshenEndTimesText } from "./_pinEndTimes.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const H = 3600e3;
// A
for (const now of [Date.UTC(2026, 9, 29, 16, 10), Date.UTC(2026, 9, 29, 3, 0), Date.UTC(2031, 5, 1, 12, 0)]) {
  const fix = { cards: [{ end_time: "2026-10-29T17:30:00+00:00" }, { end_time: "2026-11-01T17:30:00+00:00" }], x: { end_time: "not a date" } };
  freshenEndTimes(fix, now);
  const a = Date.parse(fix.cards[0].end_time), b = Date.parse(fix.cards[1].end_time);
  ok(a - now === 26 * H && b - a === 3 * 24 * H, "json: earliest end is 26 hours ahead of the clock and the gap stays (clock " + new Date(now).toISOString() + ")");
  ok(fix.x.end_time === "not a date", "json: a value that is not a date is left alone");
  const stream = 'event: x\ndata: {"cards":[{"end_time":"2026-10-29T17:30:00+00:00"}]}\n\ndata: {"live":{"end_time":"2026-11-01T17:30:00+00:00"},"send":"Any year"}\n\n';
  const out = freshenEndTimesText(stream, now), t = [...out.matchAll(/"end_time":"([^"]+)"/g)].map(m => Date.parse(m[1]));
  ok(t.length === 2 && t[0] - now === 26 * H && t[1] - t[0] === 3 * 24 * H && out.includes('"send":"Any year"') && out.startsWith("event: x\n"), "stream: the same move across data lines, the rest of the text untouched");
}
ok(freshenEndTimesText("no dates here") === "no dates here", "text with no end time comes back as it was");
// B
const buy = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
ok(/< 2\*60\*60\*1000\) return[^;]{0,200}disabled/.test(buy) && /Bidding ends in under two hours\./.test(buy), "the page still turns the toggle off inside two hours (the rule the pin protects)");
// C
const dir = new URL(".", import.meta.url), files = fs.readdirSync(dir).filter(f => /\.mjs$/.test(f) && f !== "clockPinCheck.mjs");
const toggle = files.filter(f => { const s = fs.readFileSync(new URL(f, dir), "utf8"); return /puppeteer/.test(s) && /data-alertsw|\[data-alertsw\]/.test(s) && /goasksam\.com/.test(s); });
ok(toggle.length >= 1, "the sweep finds the browser checks that drive the toggle (" + toggle.join(", ") + ")");
for (const f of toggle) ok(/from "\.\/_pinEndTimes\.mjs"/.test(fs.readFileSync(new URL(f, dir), "utf8")), f + " pins end times to the clock (imports _pinEndTimes.mjs)");
// D
const NAMED = { "findWatchCheck.mjs": "the date goes to a row label only (lookingRows iso()), never compared with the clock" };
const KEY = /(end_time|ends_at|endsAt|end_at|expires_at|closes_at)"?\s*[:=]\s*["'](20\d\d)-(\d\d)-(\d\d)/g, today = Date.now();
for (const f of files) {
  const s = fs.readFileSync(new URL(f, dir), "utf8"); let m;
  while ((m = KEY.exec(s))) { const d = Date.UTC(+m[2], +m[3] - 1, +m[4]); if (d > today + 24 * H && +m[2] < 2090) ok(!!NAMED[f], f + ": " + m[1] + " is the dated literal " + m[2] + "-" + m[3] + "-" + m[4] + ", in the future, so the verdict changes the day it passes; use Date.now() plus hours or name it with a reason"); }
}
console.log(`clockPinCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
