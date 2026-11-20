// THE CATCH UP LOOP (Lane D, Nov 20 2026): calls the deployed prepare route (GET /api/pullForSale?mode=prepare) one call at a time, each call reading the width set in data/forsaleBudget.json prepare.read_width at once (1 now; never three while the cron prepare is on; ONE after failures pass 5 in 100), until no read group is pending. It pauses for the minute the 10 minute cron runs. The route takes its own lease, so the 10 minute cron and this loop never read the same group:
// THE NIGHTLY LEASE (Nov 20 2026): the route makes no read while the nightly job holds its lease (lib/nightlyLease.js) and answers skipped nightly_lease; the loop then waits (at most five minutes at a time) and asks again. A call that finds the lease held answers skipped (the cron's claim, visible) and the loop waits and asks again. Keys from the Keychain, in process, never printed. No seller name or listing text is read, kept or printed: counts only.
//   node scripts/prepareLoop.mjs            (STOP file in the working folder ends it after the call in flight)
import { execFileSync, spawnSync } from "node:child_process"; import fs from "node:fs";
const BASE = "https://goasksam.com", NOTES = "docs/lane-notes.md", WHO = "Lane D";
const key = n => execFileSync("security", ["find-generic-password", "-s", n, "-w"], { encoding: "utf8" }).trim();
const probe = key("goasksam-probe"), crew = key("goasksam-crew"), bypass = key("goasksam-bypass");   // bypass: the protection bypass header (Keychain goasksam-bypass), in process only
const cfgNow = () => { try { return JSON.parse(fs.readFileSync("data/forsaleBudget.json", "utf8")); } catch { return {}; } };   // the same file the route reads: the window and the width
const widthOf = c => { const set = Math.floor(Number(c.prepare && c.prepare.read_width)); return Math.max(1, Math.min(3, set >= 1 ? set : 3)); };
const TWO_UNTIL = Date.UTC(2026, 10, 20, 19, 0);   // order of Nov 20 2026: two reads at once until 19:00 UTC today, then the width in the file (three)
const widthNow = c => Math.min(widthOf(c), Date.now() < TWO_UNTIL ? 2 : 3);
const sleep = ms => new Promise(r => setTimeout(r, ms)), stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const log = s => console.log(`[${stamp()}] ${s}`);
async function get(p) { const r = await fetch(BASE + p, { headers: { "x-ops-key": probe, "x-vercel-protection-bypass": bypass } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, j, retryAfter: Number(r.headers.get("retry-after")) || 0 }; }
// a push in progress: the last PUSH LOCK line of origin/main's lane-notes with no LOCK RELEASED or PUSHED line after it
function pushOpen() {
  spawnSync("git", ["fetch", "-q", "origin"]);
  const t = spawnSync("git", ["show", "origin/main:" + NOTES], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout.split("\n");
  let lock = -1, rel = -1; t.forEach((l, i) => { if (/^- PUSH LOCK/.test(l)) lock = i; if (/^- (LOCK RELEASED|PUSHED)/.test(l)) rel = i; });
  return lock > rel;
}
function post(lines) {
  const cur = fs.readFileSync(NOTES, "utf8"); fs.writeFileSync(NOTES, cur.replace(/\n*$/, "\n") + lines.join("\n") + "\n");
  spawnSync("git", ["add", NOTES]); spawnSync("git", ["commit", "-q", "-m", "docs/lane-notes.md: catch up loop post (Lane D)\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"]);
}
async function crewCounts() {
  try { const r = await fetch(BASE + "/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json", "x-vercel-protection-bypass": bypass, Cookie: "gas_crew=" + crew }, body: JSON.stringify({ text: "1987 Porsche 911" }) }); const j = await r.json();
    const c = j && j.forSale && j.forSale.counts; return c ? `dealers ${c.dealers}, classifieds ${c.classifieds}, auctions ${c.auctions}` : `no for sale group in the answer (HTTP ${r.status})`; } catch { return "the crew read failed"; }
}
const stampBySource = j => { const b = j && j.bySource; return b ? Object.entries(b).filter(([, v]) => v.live > 0).map(([k, v]) => `${k} ${v.history_stamped}/${v.with_vin}/${v.vin_history_match}`).join(", ") : "unknown"; };
let lastTable = 0, lowered = false, backoff = 0; const minGap = 20000; const T = { limited: 0, calls: 0, groups: 0, reads: 0, failed: 0, notReady: 0, resolved: 0, skipped: 0 }; let window = [], pause = 3000, budgetMs = 240000, conc = widthNow(cfgNow()), lastPost = 0, left = null, postedTop = false;
post([`- HEAVY STEP START (${WHO}, Nov 20 2026): the prepare catch up loop (order 2318, the replacement), run from a copy of the worktree at origin/main. Production: GET /api/pullForSale?mode=prepare (x-ops-key from the Keychain, in process), one call at a time, each call reads the width in data/forsaleBudget.json prepare.read_width at once (one now), none from 07:00 to 09:00 UTC, continuously, until no read group is pending; a call is about 90 seconds of work. The route takes the prepare lease, so the loop and the 10 minute cron never read the same group, and the loop also waits out the minute the cron runs. Before each call (under 100 groups) it reads origin/main's lane-notes and waits while a PUSH LOCK is open. Zero vendor queries. Failures over 5 in 100: two at once and a post; over 20: stop and DECISION NEEDED. No seller names or listing text read or printed.`]);
while (!fs.existsSync("STOP")) {
  { if (!lowered) conc = widthNow(cfgNow()); }   // the width follows the file (and the two until 19:00 rule) unless failures lowered it
  while (pushOpen()) { log("a push is in progress: waiting"); await sleep(60000); }
  if (new Date().getUTCMinutes() % 10 === 0) { log("the cron's minute: waiting"); await sleep(60000 - (Date.now() % 60000) + 2000); }
  const r = await get(`/api/pullForSale?mode=prepare&budgetMs=${budgetMs}&concurrency=${conc}`); T.calls++;
  if (r.status === 429) { T.limited++; backoff = Math.min(300000, Math.max(r.retryAfter * 1000, backoff ? backoff * 2 : 60000)); log(`HTTP 429: backing off ${backoff / 1000} s (Retry-After ${r.retryAfter || "none"})`); if (T.limited === 1 || T.limited % 10 === 0) post([`- RATE LIMITED (${WHO}, Nov 20 2026): the route answered HTTP 429 to the catch up loop (${T.limited} so far); the loop backs off ${backoff / 1000} s, doubling to 5 minutes, and returns to one call every ${minGap / 1000} s or more after a success.`]); await sleep(backoff); continue; }
  if (r.status !== 200 || !r.j) { log(`call answered HTTP ${r.status}`); if (++T.skipped > 20) break; await sleep(60000); continue; }
  backoff = 0;
  const o = r.j;
  if (o.skipped === "halted") { post([`- DECISION NEEDED (${WHO}, Nov 20 2026): the prepare job is HALTED (it stopped on more than 20 failed archive reads in 100 and holds for an hour). The loop is not running; say go to restart it.`]); break; }
  if (o.decisionNeeded) { post([`- DECISION NEEDED (${WHO}, Nov 20 2026): a prepare run stopped on the failure rule: ${JSON.stringify(o.halted)}. The job is held for an hour; the loop is not running.`]); break; }
  if (o.widthLowered) post([`- PACE DOWN (${WHO}, Nov 20 2026): the route dropped to two reads at once: ${JSON.stringify(o.widthLowered)}.`]);
  if (o.skipped === "nightly_lease") { log(`the nightly lease is held${o.unreadable ? " (unreadable)" : ""}: no read for up to ${Math.round((Number(o.resumeInMs) || 300000) / 60000)} minutes`); await sleep(Math.min(Math.max(Number(o.resumeInMs) || 300000, 60000), 300000)); continue; }
  if (o.skipped) { T.skipped++; log(`lease held (${o.skipped}): the cron's run, waiting`); await sleep(30000); continue; }
  if (!postedTop && Array.isArray(o.started) && o.started.length) { postedTop = true; post([`- CATCH UP QUEUE, TOP 20 (${WHO}, Nov 20 2026): the groups the first call started with, by searches in the last 30 days then listings (car, listings, searches): ` + o.started.map(x => `${x.car} ${x.listings} ${x.searches}`).join("; ") + "."]); }
  const g = o.readCalls || 0; T.groups += g; T.reads += o.reads || 0; T.failed += o.readsFailed || 0; T.notReady += o.readsNotReady || 0; T.resolved += (o.resolved || 0) + (o.unresolved || 0); left = o.left || left;
  window.push({ g, f: o.readsFailed || 0, ok: o.reads || 0 }); let gs = 0, i = window.length; while (i > 0 && gs < 100) gs += window[--i].g; window = window.slice(i);
  const fl = window.reduce((a, w) => a + w.f, 0), ok = window.reduce((a, w) => a + w.ok, 0), per100 = fl + ok > 0 ? Math.round(1000 * fl / (fl + ok)) / 10 : 0;   // failures per 100 reads (a read is counted in listings: the route reports listings)
  log(`call ${T.calls}: groups ${g}, listings read ${o.reads || 0}, failed ${o.readsFailed || 0}, not ready ${o.readsNotReady || 0}, left toRead ${o.left && o.left.toRead}, groups left ${o.left && o.left.toReadGroups}, ${o.ms} ms; failures per 100 ${per100}`);
  if (per100 > 20) { post([`- DECISION NEEDED (${WHO}, Nov 20 2026): the catch up loop STOPPED: archive read failures ${per100} in 100 over the last ${gs} groups (limit 20). Cleared so far ${T.groups} groups, failed ${T.failed}. The loop is not running; say go to restart it.`]); break; }
  if (per100 > 5 && conc > 2) { conc = 2; lowered = true; post([`- PACE DOWN (${WHO}, Nov 20 2026): the catch up loop saw ${per100} archive read failures in 100 (limit 5): now two reads at once.`]); }
  if (Date.now() - lastTable >= 7200000) { lastTable = Date.now();   // THE LAUNCH TABLE every two hours until pending is 0 (order of Nov 20 2026): pending, with a read, on its way, failures per 100
    const rep = await get("/api/pullForSale?report=1"), tt = rep.j && rep.j.total; post([`- LAUNCH TABLE (${WHO}, Nov 20 2026): pending ${left ? `${left.toRead} listings in ${left.toReadGroups} read groups` : "unknown"}; with a read ${tt ? tt.with_read : "?"} of ${tt ? tt.live : "?"} cards; on its way (resolved, no read yet, no price included) ${tt ? tt.resolved - tt.with_read : "?"}; not resolved ${tt ? tt.unresolved : "?"}; failures per 100 reads ${per100}; VIN HISTORY (rows stamped, of rows that carry a VIN, matched): total ${tt ? tt.history_stamped : "?"} stamped, ${tt ? tt.with_vin : "?"} with a VIN, ${tt ? tt.vin_history_match : "?"} matched; by source ${stampBySource(rep.j)}; width ${conc}; since the restart ${T.groups} groups tried, ${T.reads} listings read, ${T.failed} failed.`]); }
  if (T.groups - lastPost >= 2000) { lastPost = T.groups;
    const rep = await get("/api/pullForSale?report=1&cars=1"), cu = rep.j && rep.j.catchUp, cnt = await crewCounts();
    post([`- CATCH UP LOOP (${WHO}, Nov 20 2026): cleared ${T.groups} read groups (${T.reads} listings read), pending ${cu ? JSON.stringify(cu).slice(0, 300) : "toRead " + (left && left.toRead) + " listings, " + (left && left.toReadGroups) + " groups left in the last run"}, failures ${T.failed} listings (${T.notReady} not ready); Find "1987 Porsche 911", crew: ${cnt}.`]); }
  if (left && left.toResolve === 0 && left.toRead === 0) break;
  await sleep(Math.max(pause, minGap));
}
const rep = await get("/api/pullForSale?report=1&cars=1"), sp = rep.j && rep.j.sources || rep.j && rep.j.sourceSplit || null, cnt = await crewCounts();
const rows = sp ? Object.entries(sp).map(([k, v]) => `    ${k}: live ${v.live}, resolved ${v.resolved}, with a read ${v.with_read}`) : ["    (no per source split in the report)"];
const done = left && left.toRead === 0 && left.toResolve === 0;
post([`- ${done ? "DONE" : "HEAVY STEP DONE, STOPPED"} (${WHO}, Nov 20 2026): the prepare catch up loop ${done ? "ended with no read group pending" : "was stopped before pending reached 0"}: ${T.calls} calls, ${T.groups} read groups, ${T.reads} listings read, ${T.failed} failed, ${T.skipped} waits. Find "1987 Porsche 911", crew: ${cnt}. Live cards per source:`, ...rows, "  Search check: no public page touched."]);
log(done ? "DONE" : "STOPPED");
