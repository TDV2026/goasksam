// Desk parity golden (Stage C, condition 1). Two guarantees:
//
//  A. SERVED == LIVE RAW (blocking): for every gate question, the number the Desk serves (cube-first
//     config, i.e. the default) must equal an independent LIVE raw read of the same scope, identical
//     median and count per member/year. Because the served path is the indexed live read (fast-first),
//     the answer a user sees is always a live raw read - the cube can never show a stale number that
//     disagrees with the archive. This is the surface of "the cube must never disagree with a raw read."
//
//  B. CUBE == FAST (freshness monitor): for cube-eligible scopes, the precomputed cube slice must equal
//     the live read. This holds exactly right after a cube rebuild; it drifts as new sales close, so it
//     runs in the nightly AFTER deskCube (fresh) as the methodology-drift guard. Pass --strict-cube to
//     make B blocking (use it in the nightly); by default B only reports.
//
//   node scripts/deskParityGolden.mjs [--strict-cube] [https://base]
import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = (process.argv.find(a => a.startsWith("http")) || "https://goasksam.com").replace(/\/$/, "");
const STRICT_CUBE = process.argv.includes("--strict-cube");
const QS = [
  "best F-body cars from the 90s",
  "which Fox body Mustangs are rising fastest",
  "air-cooled 911s under $100k sold this year",
  "what 90s Japanese sports cars sold most on Cars & Bids",
  "Z28 vs Trans Am WS6, last 3 years"
];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE + "/desk", { waitUntil: "domcontentloaded" });
const ask = (q, extra) => p.evaluate(async (q, extra) => {
  const r = await fetch("/api/desk", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ desk: true, action: "interpret", question: q, run: true }, extra || {})) });
  return await r.json();
}, q, extra);
// Normalize any answer shape to a map of key -> {n, med}.
function cells(j) {
  const out = {};
  const add = (k, n, med) => { out[k] = { n: n ?? 0, med: (med == null ? null : med) }; };
  if (j.ranking) for (const r of (j.ranking.ranked || []).concat(j.ranking.thin || [])) add(r.group, r.count, r.median);
  else if (j.comparison) for (const m of (j.comparison.members || [])) add(m.group, m.count, m.median);
  else if (j.trend) for (const r of (j.trend.ranked || []).concat(j.trend.thin || [])) add(r.group, r.now_count, r.now_median);
  else if (j.answer) { const a = j.answer; const t = a.summary && a.summary.top; add("all", a.summary && a.summary.total, t && t.median); }
  return out;
}
const errOf = j => j.ranking_error || j.comparison_error || j.answer_error || j.trend_error || null;

let failsA = 0, failsB = 0, driftB = 0;
for (const q of QS) {
  const served = await ask(q, {});                 // default (fast-first) = what users get
  const rawLive = await ask(q, { noCube: true });  // forced live read
  const cube = await ask(q, { noFast: true });     // forced cube (cube-eligible members only)
  const eServed = errOf(served), eRaw = errOf(rawLive);
  console.log("\nQ: " + q);
  if (eServed || eRaw) { console.log("  FAIL(A) error: served=" + eServed + " raw=" + eRaw); failsA++; continue; }
  const cs = cells(served), cr = cells(rawLive), cc = cells(cube);
  // A: served must equal live raw, cell by cell.
  let aBad = 0;
  for (const k of new Set([...Object.keys(cs), ...Object.keys(cr)])) {
    const a = cs[k], r = cr[k];
    if (!a || !r || a.n !== r.n || String(a.med) !== String(r.med)) { aBad++; console.log(`  A MISMATCH ${k}: served=${a ? a.n + "/" + a.med : "-"} raw=${r ? r.n + "/" + r.med : "-"}`); }
  }
  if (aBad) failsA++; else console.log("  A ok (served == live raw, " + Object.keys(cs).length + " cells)");
  // B: cube vs fast where the cube served (informational unless --strict-cube).
  let bBad = 0, bCells = 0;
  for (const k of Object.keys(cc)) {
    if (cr[k] == null) continue;
    bCells++;
    if (cc[k].n !== cr[k].n || String(cc[k].med) !== String(cr[k].med)) { bBad++; }
  }
  if (bCells) { console.log(`  B cube vs fast: ${bCells - bBad}/${bCells} match` + (bBad ? `  (${bBad} drift - stale cube, rebuild to reconcile)` : "")); if (bBad) { driftB += bBad; if (STRICT_CUBE) failsB++; } }
}
await b.close();
console.log(`\n${failsA ? failsA + " QUESTION(S) FAILED PARITY A (served != live raw)." : "PARITY A PASSED: every served answer equals a live raw read."}`);
if (STRICT_CUBE) console.log(failsB ? failsB + " question(s) failed cube freshness (B)." : "CUBE FRESHNESS (B) PASSED.");
else if (driftB) console.log(`Cube freshness: ${driftB} cell(s) drifted from live (expected between nightly rebuilds; run --strict-cube after deskCube).`);
process.exit(failsA || (STRICT_CUBE && failsB) ? 1 : 0);
