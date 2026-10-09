// Stage C gate audit + p95 (production, crew cookie). For each of the five gate questions:
//  - PARITY: cube-first answer vs noCube (indexed fast) answer - identical medians + counts.
//  - NO-DROP: noCube (model_family fast) pool count vs noCube+noFast (old title-scan) count per member.
//  - P95: 5 timed runs of the normal (cube-first) path.
// Reports members/years with median + count + path flag. No writes, zero OCD.
import puppeteer from "puppeteer-core";
const BASE = "https://goasksam.com";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const QS = [
  "best F-body cars from the 90s",
  "which Fox body Mustangs are rising fastest",
  "air-cooled 911s under $100k sold this year",
  "what 90s Japanese sports cars sold most on Cars & Bids",
  "Z28 vs Trans Am WS6, last 3 years"
];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: "goasksam.com", path: "/" });
await p.goto(BASE + "/desk", { waitUntil: "domcontentloaded" });
const ask = (q, extra) => p.evaluate(async (q, extra) => {
  const t0 = performance.now();
  const r = await fetch("/api/desk", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ desk: true, action: "interpret", question: q, run: true }, extra || {})) });
  const j = await r.json(); return { ms: Math.round(performance.now() - t0), j };
}, q, extra);
const pctl = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };

function members(j) {
  if (j.ranking) return (j.ranking.ranked || []).concat(j.ranking.thin || []).map(r => ({ k: r.group, n: r.count, med: r.median, flag: r._cube ? "cube" : r._fast ? "fast" : "raw" }));
  if (j.comparison) return (j.comparison.members || []).map(m => ({ k: m.group, n: m.count, med: m.median, flag: m._cube ? "cube" : m._fast ? "fast" : "raw" }));
  if (j.trend) return (j.trend.ranked || []).concat(j.trend.thin || []).map(r => ({ k: r.group, n: (r.now_count || 0), med: r.now_median, pct: r.pct, flag: "trend" }));
  if (j.answer) { const a = Array.isArray(j.answer) ? j.answer : (j.answer.rows || [j.answer]); return a.slice(0, 3).map(x => ({ k: x.group || "all", n: x.count, med: x.median, flag: "single" })); }
  return [];
}
const byK = arr => Object.fromEntries(arr.map(m => [m.k, m]));

for (const q of QS) {
  console.log("\n==================================================\nQ: " + q);
  const norm = await ask(q, {});
  const fast = await ask(q, { noCube: true });
  const wild = await ask(q, { noCube: true, noFast: true });
  const mn = members(norm.j), mf = members(fast.j), mw = members(wild.j);
  const bn = byK(mn), bf = byK(mf), bw = byK(mw);
  // PARITY cube(normal) vs fast(noCube)
  let parityFail = 0;
  console.log("  PARITY (cube-first vs fast)  |  NO-DROP (fast n vs wildcard n)");
  for (const m of mn) {
    const f = bf[m.k], w = bw[m.k];
    const medEq = f && String(m.med) === String(f.med), nEq = f && m.n === f.n;
    if (f && (!medEq || !nEq)) parityFail++;
    const fn = f ? f.n : "-", wn = w ? w.n : "-";
    const drop = (typeof fn === "number" && typeof wn === "number" && fn > 0) ? Math.round((1 - wn / fn) * 100) : null;
    console.log(`   ${m.flag.padEnd(5)} ${String(m.k).slice(0, 30).padEnd(30)} n=${m.n} med=${m.med}${m.pct != null ? " pct=" + m.pct : ""}  | fastN=${fn} wildN=${wn}${drop != null ? " wildΔ=" + drop + "%" : ""}${f && !medEq ? "  MED MISMATCH cube=" + m.med + " fast=" + f.med : ""}${f && !nEq ? "  N MISMATCH" : ""}`);
  }
  console.log("  parityFails=" + parityFail);
  // P95 over 5 normal runs
  const runs = [norm.ms]; for (let i = 0; i < 4; i++) { const r = await ask(q, {}); runs.push(r.ms); }
  console.log(`  TIMING normal runs(ms)=[${runs.join(", ")}] median=${pctl(runs, 0.5)} p95=${pctl(runs, 0.95)}`);
  console.log(`  paths: normal=${mn[0] ? mn[0].flag : "?"} wildcard-time=${wild.ms}ms`);
}
await b.close();
console.log("\nDONE");
