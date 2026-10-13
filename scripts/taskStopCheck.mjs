// The pages around a Pause or Stop from a Task email (Oct 2026, Lane C): the stopped page and the confirm pages before
// Pause and Stop, for looking Tasks (api/watch.js) and search Tasks (api/tasks.js). "Your other Tasks keep running."
// only when another Task is running (lib/tasks/othersRunning.js). Also the Tasks probe key (api/tasks.js probeOk): the
// x-ops-key or x-probe-key header only. No network: the reads are stubbed.
//   node scripts/taskStopCheck.mjs
process.env.SUPABASE_URL = "https://fixture.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only"; process.env.TASK_LINK_SECRET = "fixture-only";
process.env.PROBE_KEY = "fixture-probe-key"; process.env.CRON_SECRET = "fixture-cron"; delete process.env.OPS_KEY;
const { othersRunning, stoppedBody, confirmBody } = await import("../api/watch.js");
const { default: watchHandler } = await import("../api/watch.js");
const { default: tasksHandler, probeOk } = await import("../api/tasks.js");
const { soldTaskTap } = await import("../lib/live/watches.js");
const { oneTap } = await import("../lib/tasks/tasks.js");

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

// The confirm pages before Pause and Stop, through each handler's real GET. Stubbed reads: "others" (another looking
// Task running), "none" (only a paused one), "fail" (the watches read fails).
const SEARCH = { id: "3b9d6f10-2222-4c1d-8e2f-abcdef012345", user_id: W.user_id, state: "running", summary: "Sam is looking for manual Porsche 911s from 1964 to 1998.", filters: { make: "Porsche", model: "911", year_min: 1964, year_max: 1998, transmission: "manual" } };
const LOOK = { ...W, id: "5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", key: "bmw|m4|f82|competition|coupe" };
let mode = "others";
globalThis.fetch = async (url, init = {}) => {
  const u = decodeURIComponent(String(url)), J = b => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (init.method && init.method !== "GET") return new Response(null, { status: 204 });
  if (/\/watches\?id=eq\./.test(u)) return J([LOOK]);
  if (/\/tasks\?id=eq\./.test(u)) return J([SEARCH]);
  if (/\/watches\?user_id=/.test(u)) return mode === "fail" ? new Response("boom", { status: 500 }) : J(mode === "others" ? [{ id: "w2", paused_at: null }] : [{ id: "w3", paused_at: "2026-10-01T00:00:00Z" }]);
  if (/\/tasks\?user_id=/.test(u)) return J([]);
  return J([]);
};
async function get(handler, link) {
  const q = Object.fromEntries(new URL(link).searchParams); let html = "", code = 0;
  const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, send(h) { html = h; return this; }, json(b) { html = JSON.stringify(b); return this; }, end() { return this; } };
  await handler({ method: "GET", query: q, headers: {}, body: {} }, res);
  return { code, text: text((html.match(/<main>([\s\S]*)<\/main>/) || [, ""])[1]) };
}
export const CONFIRM_TEXT = {};
for (const act of ["pause", "stop"]) {
  const first = act === "pause" ? "Its emails stop until you start it again." : "This ends this one Task.";
  for (const [kind, handler, link] of [["looking", watchHandler, soldTaskTap(LOOK.id, act)], ["search", tasksHandler, oneTap(SEARCH.id, act)]]) {
    for (const m of ["others", "none", "fail"]) {
      mode = m; const r = await get(handler, link);
      CONFIRM_TEXT[`${kind}|${act}|${m}`] = r.text;
      const want = m === "others" ? `${first}|Your other Tasks keep running.|` : m === "none" ? `${first}|Nothing else is running.|` : `${first}|`;
      ok(r.code === 200 && r.text.includes(want), `${kind} ${act} confirm, ${m}: ${JSON.stringify(want)} (got ${JSON.stringify(r.text)})`);
      ok(m === "others" ? !/Nothing else is running/.test(r.text) : !/Your other Tasks keep running/.test(r.text), `${kind} ${act} confirm, ${m}: never both lines`);
      ok(!/[\u2013\u2014]/.test(r.text) && !/watch/i.test(r.text), `${kind} ${act} confirm, ${m}: no dash, no watch`);
    }
  }
}
ok(!/Your other Tasks|Nothing else/.test(confirmBody("resume", NAME, true, e, "/x")), "Start again confirm: no second line");

// The Tasks probe key: lib/_credential.js hasServerCredential, in x-ops-key or x-probe-key and nowhere else.
const K = process.env.PROBE_KEY;
ok(probeOk({ headers: { "x-ops-key": K } }) === true, "key in x-ops-key: accepted");
ok(probeOk({ headers: { "x-probe-key": K } }) === true, "key in x-probe-key: accepted");
ok(probeOk({ headers: { "x-ops-key": "not-the-key" } }) === false && probeOk({ headers: { "x-probe-key": K + "x" } }) === false, "wrong key: refused");
ok(probeOk({ headers: {}, query: { key: K } }) === false, "key in the address: ignored");
ok(probeOk({ headers: { cookie: `key=${K}; x-ops-key=${K}` } }) === false, "key in a cookie: ignored");
ok(probeOk({ headers: {} }) === false && probeOk({ headers: { "x-ops-key": "" } }) === false, "no key: refused");
ok(probeOk({ headers: { authorization: "Bearer fixture-cron" } }) === false, "cron secret is not the probe key");
{ const k = process.env.PROBE_KEY; delete process.env.PROBE_KEY; ok(probeOk({ headers: { "x-ops-key": k } }) === false, "no PROBE_KEY set: refused"); process.env.PROBE_KEY = k; }
// Through the handler: the in-memory Tasks read-back (test_scenario, no Task row) opens only with the key in a header.
async function post(headers, query = {}) {
  let body = null, code = 0;
  const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, send(h) { body = h; return this; }, json(b) { body = b; return this; }, end() { return this; } };
  await tasksHandler({ method: "POST", query, headers, body: { action: "test_scenario", steps: [] } }, res);
  return { code, body };
}
{ const r = await post({ "x-ops-key": K }); ok(r.code === 200 && Array.isArray(r.body.steps) && Array.isArray(r.body.tasks) && r.body.tasks.length === 0, `read-back, key in x-ops-key: 200, no Task (got ${r.code})`); }
{ const r = await post({ "x-probe-key": K }); ok(r.code === 200 && r.body.tasks.length === 0, `read-back, key in x-probe-key: 200 (got ${r.code})`); }
for (const [what, h, q] of [["wrong key", { "x-ops-key": "not-the-key" }, {}], ["key in the address", {}, { key: K }], ["no key", {}, {}]]) {
  const r = await post(h, q); ok(r.code === 401 && !(r.body && r.body.steps), `read-back, ${what}: refused (got ${r.code})`);
}
if (process.argv.includes("--print")) for (const [k, v] of Object.entries(CONFIRM_TEXT)) console.log(k.padEnd(22), v);

console.log(`taskStopCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
