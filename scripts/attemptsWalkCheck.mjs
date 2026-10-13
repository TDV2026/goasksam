// Proves the attempts pull's stop-at-known-page rule (lib/_attemptsWalk.js) on a recorded page set. No network, no
// vendor request, no database. Run by scripts/prePush.mjs.
//   node scripts/attemptsWalkCheck.mjs [--print]
import { walkAttemptsSource } from "../lib/_attemptsWalk.js";
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL " + m); } };
const PRINT = process.argv.includes("--print");
const DAY = 864e5, BASE = Date.UTC(2026, 9, 12);
const day = n => new Date(BASE - n * DAY).toISOString().slice(0, 10);
// A source newest first: `perDay` unsold attempts a day for `days` days, ids descending. `held` = how many of the newest are NOT held.
function source({ perDay, days, newest }) {
  const recs = []; let id = perDay * days;
  for (let d = 0; d < days; d++) for (let i = 0; i < perDay; i++) recs.push({ id: String(id--), day: day(d), status: "reserve not met" });
  const heldSet = new Set(recs.slice(newest).map(r => r.id));
  const fetchPage = async p => ({ rows: recs.slice((p - 1) * 100, p * 100), totalPages: Math.max(1, Math.ceil(recs.length / 100)) });
  return { recs, heldSet, fetchPage, isHeld: r => heldSet.has(r.id) };
}
const cutoff = n => day(n);
const run = (src, o = {}) => walkAttemptsSource({ fetchPage: src.fetchPage, isHeld: "isHeld" in o ? o.isHeld : src.isHeld, dayOf: r => r.day, cutoffDay: o.cutoff || cutoff(30), full: !!o.full });
const lines = [];
const note = (name, r, before) => lines.push(`${name.padEnd(46)} pages ${String(r.pages).padStart(2)} (${r.stop})${before != null ? `   whole month would be ${before}` : ""}`);

// Bring a Trailer: about 32 a day, 60 days of history on offer, a 30 day window.
const bat = source({ perDay: 32, days: 60, newest: 30 });
const full = await run(bat, { full: true });
ok(full.pages === 10 || full.pages === 11, `a full month of BaT is 10 or 11 pages, got ${full.pages}`);
const nightly = await run(bat);
note("BaT, 30 new since last night", nightly, full.pages);
ok(nightly.pages === 2 && nightly.stop === "known", "30 new: page 1 mixed, page 2 all held, stop on known at page 2");
ok(nightly.rows.length === 200, "the pages it read are all handed back (the stored set on those pages is unchanged)");

const quiet = source({ perDay: 32, days: 60, newest: 0 });
const q = await run(quiet); note("BaT, nothing new", q);
ok(q.pages === 1 && q.stop === "known", "nothing new: one page");

// Catch-up after a 14 day gap (Sep 29 to Oct 13): about 450 new, found by the delta walk with no flag.
const gap = source({ perDay: 32, days: 60, newest: 450 });
const g = await run(gap); note("BaT, 14 day gap (450 new)", g, full.pages);
ok(g.pages === 6 && g.stop === "known", `a 14 day gap is 6 pages, got ${g.pages}`);

// --months is still the outer bound: a short window stops on the cutoff before the known page.
const bound = await run(bat, { cutoff: cutoff(2) }); note("BaT, 30 new but --months window of 2 days", bound);
ok(bound.stop === "cutoff" && bound.pages === 1, "the outer bound wins when it is reached first");
// A manual catch-up over a wide window still reaches back through new rows.
const wide = source({ perDay: 32, days: 70, newest: 1500 });
const w = await run(wide, { cutoff: cutoff(60) }); note("BaT, 1500 new, 60 day window", w);
ok(w.pages === 16 && w.stop === "known", `1500 new rows are 15 pages of new plus one known page, got ${w.pages}`);

// A failed held-ids read (isHeld null) must never act like an empty table or a full one: the whole window is walked.
const failed = await run(bat, { isHeld: null }); note("BaT, held read failed (no held set)", failed);
ok(failed.stop === "cutoff" && failed.pages === full.pages, "no held set: same pages as the old whole-month walk");
// --full ignores held rows.
const forced = await run(quiet, { full: true }); note("BaT, nothing new but --full", forced);
ok(forced.stop === "cutoff" && forced.pages === full.pages, "--full walks the whole window even when everything is held");

// Small sources: page 1 already spans past the window.
const hag = source({ perDay: 3, days: 60, newest: 3 });
const h = await run(hag); note("Hagerty, 3 new", h);
ok(h.pages === 1, "a small source is one page");
// Last page ends the walk when the vendor has no more.
const tiny = source({ perDay: 1, days: 5, newest: 5 });
const t = await run(tiny, { cutoff: cutoff(30) }); note("tiny source, everything new, 5 rows", t);
ok(t.pages === 1 && t.stop === "last_page", "one page of rows, no more pages: last_page");
// A page of rows with no storable status is nothing to hold: it counts as known.
const mixed = source({ perDay: 32, days: 60, newest: 0 });
mixed.recs.slice(0, 100).forEach(r => { r.status = "sold"; });
const stat = rec => rec.status === "reserve not met";
const m = await run(mixed, { isHeld: r => !stat(r) || mixed.heldSet.has(r.id) }); 
ok(m.pages === 1 && m.stop === "known", "rows without a storable status count as known");

// Requests per night, five sources, typical day: BaT 32 new, C&B 9, Hagerty 3, SOMO 1, MB Market 1.
const night = [["BaT", 32, 950], ["C&B", 9, 280], ["Hagerty", 3, 70], ["SOMO", 1, 15], ["MB", 1, 10]];
let before = 0, after = 0;
for (const [n, perDay, perMonth] of night) {
  const s = source({ perDay: Math.max(1, Math.round(perMonth / 30)), days: 60, newest: perDay });
  const b = await run(s, { full: true }), a = await run(s);
  before += b.pages; after += a.pages; lines.push(`  ${n.padEnd(8)} before ${b.pages}  after ${a.pages}`);
}
lines.push(`typical night, five sources: before ${before}, after ${after}`);
ok(after <= 9 && after >= 5, `a typical night is 5 to 9 requests, got ${after}`);
if (PRINT) console.log(lines.join("\n"));
console.log(bad ? `attemptsWalkCheck: ${bad} failure(s)` : `attemptsWalkCheck: ok, typical night ${before} -> ${after} requests`);
process.exit(bad ? 1 : 0);
