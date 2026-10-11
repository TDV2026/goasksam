// THE LIVE PULL SCHEDULE (Oct 2026, Sam's option 1), in Pacific time all year. One cron fires every 15 minutes
// in UTC (vercel.json, /api/pullLive?mode=auto); this decides, from the Pacific clock at that moment, which pull
// (if any) that quarter hour gets, so the November and March clock changes need no cron edit.
//   full walk       06:15, 14:45, 22:15 (every page; marks vanished listings ended)
//   ending soonest  every 30 minutes, 09:00 to 14:30 (the hours nearly every online auction ends): the vendor's
//                   DEFAULT order (it is soonest-ending first; the vendor rejects every sort option tried), paging
//                   until the last car returned ends more than 6 hours ahead, at most 3 pages.
// No "newest" pull: the vendor offers no newest-listed order (sort=created_at and sort=date are rejected, and the
// last pages of the default order are long-running auctions), so new cars arrive with the full walks and, when
// an auction is already near its end, with the ending-soonest pulls.
// Requests per run: a full walk is about 23 (2,290 listings at 100 a page); ending soonest 1 to 3.
export const FULL = ["06:15", "14:45", "22:15"];
export const ENDING = (() => { const out = []; for (let m = 9 * 60; m <= 14 * 60 + 30; m += 30) out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0")); return out; })();
export const PAGES = { full: 23, ending: 3 };   // ending: the page cap; full: the usual walk
export const ENDING_AHEAD_MS = 6 * 3600e3;      // an ending-soonest pull pages until a car ends this far ahead

const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "short" });
// The Pacific quarter hour for an instant: a cron that fires a minute or two late still lands in its slot.
export function pacificSlot(at = new Date()) {
  const p = Object.fromEntries(PT.formatToParts(at).map(x => [x.type, x.value]));
  const h = Number(p.hour) % 24, m = Math.floor(Number(p.minute) / 15) * 15;
  return { hhmm: String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"), date: `${p.year}-${p.month}-${p.day}`, zone: p.timeZoneName };
}
export function pullFor(at = new Date()) {
  const s = pacificSlot(at);
  const mode = FULL.includes(s.hhmm) ? "full" : ENDING.includes(s.hhmm) ? "ending" : null;
  return { ...s, mode };
}
// Every quarter hour of one UTC day (96 firings) with the pull it gets: the dry run for either clock offset.
export function dayPlan(dateIso) {
  const start = Date.parse(dateIso + "T00:00:00Z"), rows = [];
  for (let i = 0; i < 96; i++) { const t = new Date(start + i * 15 * 60e3), p = pullFor(t); if (p.mode) rows.push({ utc: t.toISOString().slice(11, 16), pacific: p.hhmm, zone: p.zone, mode: p.mode }); }
  const requests = rows.reduce((k, r) => k + PAGES[r.mode], 0);
  return { date: dateIso, runs: rows.length, byMode: rows.reduce((o, r) => (o[r.mode] = (o[r.mode] || 0) + 1, o), {}), requestsPerDayAtMost: requests, rows };
}
