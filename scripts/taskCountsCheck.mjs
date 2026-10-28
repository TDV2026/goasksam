// EVERY CAR AND UPDATE COUNT ON THE TASKS SURFACES IS THE SHARED HELPER'S (Lane D, Oct 28 2026; the class behind findCardKitCheck's "one-line count").
// Cause: a Task line typed its own digit and noun ("3 live cars match", "Show 1 car", "2 other cars match the rest") while the email subject and the Tasks page's update line went through
// lib/countNoun.js (one to ten as words, 11 and up as digits), so one Task, or one email, could read "Three new cars match" beside "3 live cars match".
// This check (1) RUNS every server line that prints a car count at 0, 1, 2, 10, 11 and 45 and compares it with the helper, and (2) SCANS the Tasks surfaces for a count typed in front of its noun.
// No network. node scripts/taskCountsCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.TASK_LINK_SECRET = "fixture-only"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const { countNoun } = await import("../lib/countNoun.js");
const { overviewFacts } = await import("../lib/tasks/overview.js"), { statusLine } = await import("../lib/tasks/tasks.js"), { updateLine } = await import("../lib/tasks/fullCards.js"), { moreCarsLine } = await import("../lib/tasks/emailCaps.js");
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
for (const n of [1, 2, 3, 10, 11, 45]) {
  const verb = n === 1 ? "matches" : "match";
  const t = { updates: [{ role: "sam", kind: "match", data: { cards: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) } }] };
  const ov = overviewFacts(t);
  ok(ov.live === `${countNoun(n, "live car", { many: "live cars", cap: true })} ${verb}`, `overview card, ${n}: "${ov.live}"`);
  ok(ov.cars === countNoun(n, "car"), `overview "Show" label, ${n}: "${ov.cars}"`);
  const closed = overviewFacts({ updates: [{ role: "sam", kind: "match", data: { opening: true, total: 0, loose: { dropped: "colour", count: n }, cards: [] } }] });
  ok(closed.close === countNoun(n, "close one", { cap: true }), `overview close ones, ${n}: "${closed.close}"`);
  ok(statusLine({ colour: "black" }, "colour", n) === `Nothing black yet. ${countNoun(n, "other car", { many: "other cars", cap: true })} ${verb} the rest.`, `status line, ${n}: "${statusLine({ colour: "black" }, "colour", n)}"`);
  ok(updateLine({ data: { total: n, cards: [{}] } }) === `${countNoun(n, "new car", { many: "new cars", cap: true })} ${verb}.`, `update line, ${n}`);
  ok(moreCarsLine(n, true).startsWith(cap(countNoun(n, "more car", { many: "more cars" }))), `email more line, ${n}`);
}
// one Task card reads one form: the card's count, its Show label and its update line never mix a digit and a word for a number the helper writes as a word
{ const t = { updates: [{ role: "sam", kind: "match", data: { cards: [{ id: 1 }, { id: 2 }, { id: 3 }], line: updateLine({ data: { cards: [{}, {}, {}] } }) } }] };
  const ov = overviewFacts(t), all = [ov.live, ov.cars, t.updates[0].data.line].join(" | ");
  ok(!/\b[1-9]\b/.test(all.replace(/\d{2,}/g, "")), `one card, one form (${all})`); }
// the scan: no Tasks surface types a count in front of car, cars, update, updates or close ones
const FILES = fs.readdirSync("lib/tasks").filter(f => f.endsWith(".js")).map(f => "lib/tasks/" + f).concat(["api/tasksPage.js", "api/tasks.js", "lib/live/watches.js", "lib/live/buyAlerts.js"]);
const TYPED = [/\$\{[^}]+\}\s+(?:(?:more|new|live|other|close)\s+)*(?:cars?|ones?|updates?)\b/, /["'`]\d+ (?:(?:more|new|live|other|close) )*(?:cars?|ones?|updates?)\b/, /toLocaleString\("en-US"\)\s*\+\s*" (?:live )?cars?/, /count === 1 \? "\d/];
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const hits = fs.readFileSync(f, "utf8").split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*\/\//.test(l) && !/countNoun\(|moreCarsLine|obCount/.test(l) && TYPED.some(r => r.test(l)));
  ok(!hits.length, `${f}: no count typed in front of its noun${hits.length ? " (line " + hits.map(h => h[0]).slice(0, 4).join(", ") + ": " + hits[0][1].trim().slice(0, 90) + ")" : ""}`);
}
console.log(`taskCountsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
