// TASKS SEND PACE CHECK (Lane S, Nov 5 2026). A large Task email run must not overrun the time limit or lose queued updates (lib/tasks/sendPace.js). The REAL runDigest and runBeforeItEnds over an in-memory io and a fake clock:
//   1. a gap of at least gapMs between consecutive sends;
//   2. a 429 is retried after a wait that grows (1 s, 2 s, 4 s), or the provider's Retry-After; a 429 that clears is sent and marked sent;
//   3. a 429 that never clears STOPS the run's sending: nothing is marked failed, no person's updates are marked at all (they stay queued), the rest are deferred, and a second run sends them;
//   4. a deadline in the middle of the run defers everyone not yet sent, untouched (60 people, deadline after 25 sends: 25 sent, 35 deferred, 0 marked), and the next run sends the 35;
//   5. Before it ends gives the claim back on a deferred send (the car is retried while it is live);
//   6. a run with no pace behaves as before (no waits, a 429 is marked failed as it always was).
// MUTANTS (each must fail): no backoff; a rate limit marks updates failed; no deadline; no gap; a deferred alert keeps its claim.
//   node scripts/tasksSendPaceCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.TASK_LINK_SECRET = "fixture-only";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), LIB = path.join(ROOT, "lib/tasks");
let seq = 0;
async function load(mut = {}) {
  const mine = [], rd = f => fs.readFileSync(path.join(LIB, f), "utf8"), put = (n, src) => { const p = path.join(LIB, n); fs.writeFileSync(p, src); mine.push(p); return pathToFileURL(p).href; };
  try {
    const tag = `__pacemut${++seq}_`;
    put(`${tag}sendPace.js`, mut.pace ? mut.pace(rd("sendPace.js")) : rd("sendPace.js"));
    const D = await import(put(`${tag}digest.js`, (mut.digest ? mut.digest(rd("digest.js")) : rd("digest.js")).replace('"./sendPace.js"', `"./${tag}sendPace.js"`)));
    return { D, P: await import(pathToFileURL(path.join(LIB, `${tag}sendPace.js`)).href).catch(() => null) };
  } finally { for (const p of mine) fs.rmSync(p, { force: true }); }
}
const now = new Date("2026-11-05T15:00:00Z"), hours = h => new Date(now.getTime() + h * 3600e3).toISOString();
const uid = i => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;
function world(n) {
  const tasks = [], updates = [], cars = {};
  for (let i = 1; i <= n; i++) {
    tasks.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, user_id: uid(i), email: `p${i}@example.com`, channels: ["inapp", "email"], summary: "Sam is looking for black manual BMWs.", filters: { make: "BMW" }, state: "running" });
    cars[i] = { id: i, end_time: hours(5), status: "live", listing_title: `Car ${i}`, source: "bringatrailer", url: "https://example.com/" + i };
    updates.push({ id: i, task_id: tasks[i - 1].id, kind: "match", email_status: "queued", created_at: hours(-1), data: { cards: [{ id: i, title: `Car ${i}` }] } });
  }
  return { tasks, updates, cars };
}
function ioOf(w, behave) {
  const sends = [], marks = [];
  const io = {
    queuedUpdates: () => w.updates.filter(u => u.email_status === "queued"), tasks: () => w.tasks, watchUsers: () => [], watchesFor: () => [], watches: () => [],
    prefs: () => ({ on: true, email: "x", every: "daily" }), targets: uidx => [{ channel: "email", to: `p${Number(String(uidx).slice(-12))}@example.com` }],
    lastSent: () => null, sentToday: () => 0, first: () => false, recordSent: () => {}, pendingEvents: () => [],
    liveSlim: ids => ids.map(i => w.cars[i]).filter(Boolean), liveRows: ids => ids.map(i => w.cars[i]).filter(Boolean),
    blocks: (rows, cards) => cards.map(c => ({ id: c.id, car: c.title, cardText: c.title, cardHtml: `<div data-car="${c.id}">${c.title}</div>`, card: c })),
    patchUpdate: (id, p) => { marks.push([id, p.email_status]); const u = w.updates.find(x => x.id === id); if (u) u.email_status = p.email_status; }, markAlert: () => {}, markWatch: () => {},
    send: m => { const k = sends.length; sends.push(m); return behave(k, m); }
  };
  return { io, sends, marks };
}
export async function findings(mut = {}) {
  const fails = [], { D, P } = await load(mut);
  const mkClock = () => { const c = { t: 1_000_000, waits: [] }; c.now = () => c.t; c.sleep = async ms => { c.waits.push(ms); c.t += ms; }; return c; };
  const pace = (clk, o = {}) => P.makePace({ now: clk.now, sleep: clk.sleep, gapMs: 600, retries: 3, backoffMs: 1000, ...o });
  const rate = { ok: false, status: 429, error: "Too many requests" };
  // 1. gap
  { const w = world(5), { io, sends } = ioOf(w, () => ({ ok: true })), clk = mkClock(), at = [];
    const io2 = { ...io, send: m => { at.push(clk.now()); return io.send(m); } }; await D.runDigest({}, { io: io2, now, pace: pace(clk) });
    const gaps = at.slice(1).map((t, i) => t - at[i]); if (sends.length !== 5 || gaps.some(g => g < 600)) fails.push(`sends were not spaced by the gap (gaps ${gaps.join(",")})`); }
  // 2. a 429 that clears: waits grow, then it is sent and marked sent
  { const w = world(1), { io, sends, marks } = ioOf(w, k => k < 2 ? rate : { ok: true }), clk = mkClock(); const r = await D.runDigest({}, { io, now, pace: pace(clk) });
    if (!(r.sent === 1 && sends.length === 3 && marks.some(m => m[1] === "sent"))) fails.push(`a 429 that clears was not retried to success (sent ${r.sent}, attempts ${sends.length})`);
    if (JSON.stringify(clk.waits.filter(x => x >= 1000)) !== "[1000,2000]") fails.push(`the backoff waits were ${JSON.stringify(clk.waits)} (expected 1000 then 2000)`);
    const w2 = world(1), o2 = ioOf(w2, k => k < 1 ? { ...rate, retryAfterMs: 7000 } : { ok: true }), c2 = mkClock(); await D.runDigest({}, { io: o2.io, now, pace: pace(c2) }); if (!c2.waits.includes(7000)) fails.push("the provider's Retry-After was not honoured"); }
  // 3. a 429 that never clears: stop, mark nothing, defer the rest; a second run sends them
  { const w = world(10), o = ioOf(w, () => rate), clk = mkClock(); const r = await D.runDigest({}, { io: o.io, now, pace: pace(clk) });
    if (o.marks.length) fails.push(`a rate limit marked updates (${o.marks.map(m => m[1]).join(",")}): they would be lost`);
    if (w.updates.some(u => u.email_status !== "queued")) fails.push("a rate limit changed a queued update");
    if (!(r.deferred >= 9 && r.rateLimited)) fails.push(`the rate-limited run did not defer the rest (deferred ${r.deferred}, rateLimited ${r.rateLimited})`);
    if (o.sends.length > 4) fails.push(`the run kept hammering after the retries ran out (${o.sends.length} attempts)`);
    const o2 = ioOf(w, () => ({ ok: true })); const r2 = await D.runDigest({}, { io: o2.io, now, pace: pace(mkClock()) }); if (r2.sent !== 10) fails.push(`the next run sent ${r2.sent} of 10 deferred people`); }
  // 4. the deadline
  { const w = world(60), o = ioOf(w, () => ({ ok: true })), clk = mkClock(); const p = pace(clk, { deadlineAt: clk.t + 25 * 600 - 1 }); const r = await D.runDigest({}, { io: o.io, now, pace: p });
    if (!(r.sent === 25 && r.deferred === 35)) fails.push(`a deadline after 25 sends gave sent ${r.sent}, deferred ${r.deferred} (expected 25 and 35)`);
    if (w.updates.filter(u => u.email_status === "queued").length !== 35) fails.push("people past the deadline had their updates touched");
    const o2 = ioOf(w, () => ({ ok: true })); const r2 = await D.runDigest({}, { io: o2.io, now, pace: pace(mkClock()) }); if (r2.sent !== 35) fails.push(`the next run sent ${r2.sent} of the 35 deferred`); }
  // 5. Before it ends: a deferred send gives the claim back
  { const claimed = [], finished = [];
    const alert = { id: 1, user_id: uid(1), listing_id: 7 }, row = { id: 7, end_time: new Date(now.getTime() + 90 * 60e3).toISOString(), status: "live", listing_title: "Car 7", source: "bringatrailer", url: "https://example.com/7" };
    const io = { armedAlerts: () => [alert], liveSlim: () => [row], liveRows: () => [row], prefs: () => ({ on: true }), targets: () => [{ channel: "email", to: "p1@example.com" }], first: () => false, claimAlert: id => { claimed.push(id); return true; }, finishAlert: (id, st, give) => { finished.push([id, st, give]); }, markAlert: () => {}, alertFacts: () => ({ title: "Car 7", end: row.end_time, bid: null, url: row.url, bids: 0 }), send: () => rate };
    const r = await D.runBeforeItEnds({}, { io, now, pace: pace(mkClock()) }).catch(e => ({ error: e.message }));
    if (!finished.some(f => /^deferred/.test(f[1]) && f[2] === true)) fails.push(`a rate-limited Before it ends send did not give its claim back (${JSON.stringify(finished)})${r.error ? " " + r.error : ""}`); }
  // 6. no pace: as before
  { const w = world(2), o = ioOf(w, () => rate); const r = await D.runDigest({}, { io: o.io, now }); if (!(r.failed === 2 && o.marks.every(m => /^failed/.test(m[1])))) fails.push("a run with no pace changed: a 429 is no longer marked failed as before"); }
  return fails;
}
const rep = (s, from, to) => { if (!s.includes(from)) throw new Error("mutant did not apply: " + from.slice(0, 70)); return s.replace(from, () => to); };
export const MUTANTS = [
  ["no backoff (retry at once)", { pace: s => rep(s, "await pace.sleep(Math.min(pace.maxWaitMs, Number(r.retryAfterMs) > 0 ? Number(r.retryAfterMs) : pace.backoffMs * 2 ** attempt));", "") }],
  ["a rate limit is treated like any failure (marked failed, queued updates lost)", { pace: s => rep(s, "if (attempt >= pace.retries) return stop(pace, \"rate_limited\");", "if (attempt >= pace.retries) return r;") }],
  ["no deadline", { pace: s => rep(s, "if (pace.now() + Math.max(0, wait) >= pace.deadlineAt) return stop(pace, \"deadline\");", "") }],
  ["no gap between sends", { pace: s => rep(s, "if (wait > 0) await pace.sleep(wait);", "") }],
  ["a deferred alert keeps its claim", { digest: s => rep(s, "await io.finishAlert(a.id, \"deferred: \" + r.reason, true)", "await io.finishAlert(a.id, \"deferred: \" + r.reason, false)") }],
  ["deferred people are marked", { digest: s => rep(s, "report.details.push(d); if (r.rateLimited) report.rateLimited = true; continue; }", "report.details.push(d); if (r.rateLimited) report.rateLimited = true; for (const m of marks) await m(\"failed: deferred\").catch(() => {}); continue; }") }]
];
export async function main() {
  let pass = 0, fail = 0;
  const f = await findings(); if (f.length) { fail += f.length; f.forEach(x => console.log("FAIL " + x)); } else pass++;
  for (const [name, mut] of MUTANTS) {
    let g; try { g = await findings(mut); } catch (e) { fail++; console.log(`FAIL mutant "${name}": ${String(e.message).split("\n")[0]}`); continue; }
    if (g.length) { pass++; if (process.env.VERBOSE) console.log(`  caught "${name}": ${g[0].slice(0, 130)}`); } else { fail++; console.log(`FAIL mutant "${name}" was NOT caught`); }
  }
  console.log(`tasksSendPaceCheck: ${pass} pass, ${fail} FAIL (${MUTANTS.length} mutants, each must be caught)`);
  return fail ? 1 : 0;
}
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
