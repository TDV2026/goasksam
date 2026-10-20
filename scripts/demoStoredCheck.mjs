// FIX 2 (Sam's demo speed order, Oct 19 2026; Lane C): the demo serves its own stored answer before Market Check's handler
// only when it is a full result of the current ENGINE_VERSION, under a day old, and read after the current sales epoch,
// so it is never an older engine's answer and never older than what Market Check would serve. No network.
//   node scripts/demoStoredCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { storedDemoServable } from "../api/partnerAnswer.js";
import { ENGINE_VERSION } from "../lib/onebox.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const now = Date.parse("2026-10-19T16:00:00Z"), EP = "2026-10-19T07:30:00Z";
const row = (o = {}) => ({ engineVersion: ENGINE_VERSION, readAt: "2026-10-19T15:00:00Z", out: { ok: true, answerType: "range", range: { low: 1, high: 2 }, cardWithRows: "<div></div>" }, ...o });
ok(storedDemoServable(row(), EP, now) === true, "current version, an hour old, read after the epoch: served");
ok(storedDemoServable(row({ engineVersion: "e66-20261019-older" }), EP, now) === false, "an older engine version: never served");
ok(storedDemoServable(row({ engineVersion: undefined }), EP, now) === false, "no version stamp: never served");
ok(storedDemoServable(row({ readAt: "2026-10-19T07:00:00Z" }), EP, now) === false, "read before the last ingest: never served");
ok(storedDemoServable(row(), null, now) === false && storedDemoServable(row(), "not a date", now) === false, "no readable epoch: never served (reads through the handler)");
ok(storedDemoServable(row({ readAt: "2026-10-18T15:00:00Z" }), "2026-10-18T07:00:00Z", now) === false, "over a day old: never served");
ok(storedDemoServable(row({ out: { ok: true, answerType: "identity_question", question: { options: [{}] } } }), EP, now) === false, "a stored question is not a full result here (the question path answers it)");
ok(storedDemoServable(row({ out: { ok: false, stillReading: true } }), EP, now) === false && storedDemoServable(null, EP, now) === false, "a still-reading answer or no row: never served");
{ const r = row(); delete r.out.cardWithRows; ok(storedDemoServable(r, EP, now) === false, "a stored answer made before cardWithRows (no sale rows): never served, it reads through"); }
// The handler asks this before Market Check's handler, and only for a plain (unrefined, unasked) read.
const src = fs.readFileSync(new URL("../api/partnerAnswer.js", import.meta.url), "utf8");
const at = src.indexOf("storedDemoServable(qlast"), mc = src.indexOf("r = await marketCheckAnswer(req, text, refine, asked, true)");
ok(at > 0 && mc > at && /if \(!refine && !\(Number\(asked\) > 0\)\) \{/.test(src.slice(at - 1500, at)), "the stored answer is checked first, for an unrefined read only, before Market Check's handler");
ok(/if \(!venueLeak\(out\)\.length\) return res\.status\(200\)\.json\(out\);/.test(src.slice(at, at + 800)), "a served stored answer still passes the venue guard");
console.log(`demoStoredCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
