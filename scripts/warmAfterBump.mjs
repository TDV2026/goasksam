// LIVE (only with --run --confirm): this script reads production (goasksam.com) as a visitor. Run it only in a gap the lanes name, after a HEAVY STEP START line in docs/lane-notes.md, with no PUSH LOCK open.
// THE WARM-UP AFTER A STAMP BUMP (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 4). After a bump every stored answer is ignored, so every car is read cold. This refills the store for the cars visitors actually read: the most read searches
// of the last 30 days (analytics search_run) and the most read History hubs, from the ops task warmlist, at most THREE engine reads at once, each a normal visitor read that stores its answer through the page's own path (no write of its own here).
//   node scripts/warmAfterBump.mjs                     DRY: the list's size, the cost and the time, no read of any car
//   node scripts/warmAfterBump.mjs --run --confirm [--cars=300] [--hubs=200] [--max-minutes=45] [--base=https://goasksam.com]
// The probe key (x-ops-key, for the list) and the bypass header (for the reads) are read from the Keychain in process and never printed. The report ends with the counts, the p50 and p95 of a read, the wall time, the function seconds and the OldCarsData spend (0).
import { execFileSync } from "node:child_process";
import { planOf } from "../lib/warmList.js";
const args = process.argv.slice(2), flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const BASE = String(flag("base", "https://goasksam.com")).replace(/\/$/, ""), CARS = Number(flag("cars", 300)), HUBS = Number(flag("hubs", 200)), MAX_MIN = Number(flag("max-minutes", 45)), RUN = args.includes("--run") && args.includes("--confirm");
const CONCURRENCY = 3;
const kc = s => { try { return execFileSync("security", ["find-generic-password", "-s", s, "-w"], { encoding: "utf8" }).trim(); } catch { return ""; } };
export async function runPool(jobs, worker, concurrency = CONCURRENCY, deadlineMs = Infinity) {
  const out = []; let i = 0, inflight = 0, peak = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (i < jobs.length && Date.now() < deadlineMs) { const j = jobs[i++]; inflight++; peak = Math.max(peak, inflight); try { out.push(await worker(j)); } finally { inflight--; } }
  }));
  return { results: out, peak };
}
export const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function reportOf(results, wallMs, peak) {
  const ms = results.map(r => r.ms), ok = results.filter(r => r.ok);
  return { reads: results.length, ok: ok.length, failed: results.length - ok.length, p50Ms: pct(ms, 0.5), p95Ms: pct(ms, 0.95), wallMinutes: Math.round(wallMs / 6000) / 10, functionSeconds: Math.round(ms.reduce((t, x) => t + x, 0) / 1000), peakConcurrent: peak, oldCarsDataRequests: 0 };
}
if (process.argv[1] && process.argv[1].endsWith("warmAfterBump.mjs")) {
  const key = kc("goasksam-probe"), bypass = kc("goasksam-bypass");
  const listed = await fetch(`${BASE}/api/usageDashboard?view=ops&task=warmlist&days=30&cars=${CARS}&hubs=${HUBS}`, { headers: { "x-ops-key": key, ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) }, signal: AbortSignal.timeout(60000) }).then(r => r.json()).catch(() => null);
  if (!listed || listed.readFailed || !Array.isArray(listed.cars)) { console.log("the list could not be read (the ops task warmlist answers once this branch is deployed)"); process.exit(2); }
  const plan = planOf({ cars: listed.cars.length, hubs: listed.hubs.length, concurrency: CONCURRENCY });
  console.log(`PLAN: ${plan.cars} cars (of ${listed.searchEvents} search events in ${listed.days} days) and ${plan.hubs} History hubs (of ${listed.pageViews} page views); ${plan.reads} reads, ${plan.concurrency} at once, about ${plan.wallMinutes} minutes, ${plan.functionSeconds} function seconds, OldCarsData requests ${plan.oldCarsDataRequests}`);
  if (!RUN) { console.log("DRY: nothing was read. Add --run --confirm after the HEAVY STEP START line."); process.exit(0); }
  const jobs = [...listed.cars.map(c => ({ kind: "car", text: c.text })), ...listed.hubs.map(h => ({ kind: "hub", path: h.path }))];
  const H = { ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) };
  const t0 = Date.now();
  const { results, peak } = await runPool(jobs, async j => {
    const s = Date.now();
    try {
      const r = j.kind === "car" ? await fetch(`${BASE}/api/sellerDecision`, { method: "POST", headers: { ...H, "content-type": "application/json", origin: BASE }, body: JSON.stringify({ oneBox: true, search: j.text }), signal: AbortSignal.timeout(60000) }) : await fetch(BASE + j.path, { headers: H, signal: AbortSignal.timeout(60000) });
      const body = j.kind === "car" ? await r.json().catch(() => null) : null;
      return { ...j, ms: Date.now() - s, ok: r.ok && (j.kind === "hub" || !!(body && /^(result|thin|refusal|not_tracked|generation_choice|model_choice)$/.test(String(body.tier)))), status: r.status, tier: body && body.tier };
    } catch { return { ...j, ms: Date.now() - s, ok: false, status: 0 }; }
  }, CONCURRENCY, t0 + MAX_MIN * 60000);
  console.log("REPORT " + JSON.stringify(reportOf(results, Date.now() - t0, peak)));
}
