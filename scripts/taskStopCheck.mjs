// The page after a Task is stopped from its email (Oct 2026, Lane C; api/watch.js). No network: the reads are stubbed.
//   node scripts/taskStopCheck.mjs
process.env.SUPABASE_URL = "https://fixture.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
const { othersRunning, stoppedBody } = await import("../api/watch.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const W = { id: "w1", user_id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "spec", label: "F82 M4 Competition coupes" };
const sel = (watches, tasks) => async (_e, p) => /^watches\?/.test(p) ? watches : /^tasks\?/.test(p) ? tasks : null;
const e = x => String(x).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const NAME = "the next F82 M4 Competition coupe sale";

ok(await othersRunning({}, W, sel([{ id: "w2" }], [])) === true, "another looking Task running: true");
ok(await othersRunning({}, W, sel([{ id: "w2", paused_at: "2026-10-01T00:00:00Z" }], [])) === false, "only a paused one: false");
ok(await othersRunning({}, W, sel([], [{ id: "t1" }])) === true, "a running search Task: true");
ok(await othersRunning({}, W, sel([], [])) === false, "nothing else: false");
ok(await othersRunning({}, W, sel(null, [])) === null && await othersRunning({}, W, sel([], null)) === null, "a failed read: null");
{ let q = []; await othersRunning({}, W, async (_e, p) => { q.push(p); return []; }); ok(q.some(p => /watches\?user_id=eq\.aaaaaaaa.*stopped_at=is\.null.*id=neq\.w1/.test(p)) && q.some(p => /tasks\?user_id=eq\.aaaaaaaa.*state=in\.\(running,needs_you\)/.test(p)), "reads this person's other Tasks only"); }

const text = h => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "");
ok(text(stoppedBody(NAME, true, e)) === "Stopped. Sam is no longer looking for the next F82 M4 Competition coupe sale.|Your other Tasks keep running.", "others running");
ok(text(stoppedBody(NAME, false, e)) === "Stopped. Sam is no longer looking for the next F82 M4 Competition coupe sale.|Nothing else is running.", "none running");
ok(text(stoppedBody(NAME, null, e)) === "Stopped. Sam is no longer looking for the next F82 M4 Competition coupe sale.", "unknown: no second line");
for (const o of [true, false, null]) { const h = stoppedBody(NAME, o, e); ok(!/[–—]/.test(h) && !/watch/i.test(h), "no dash, no watch"); }

console.log(`taskStopCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
