// REFINE CACHE PROOF (Lane B, e49, Sam's item 13): through the public path (POST /api/sellerDecision, the call the
// Market Check page makes), ask for a car plain, then with its Coupe chip, then plain again, and the chip first the
// other way round on a second car. Every plain answer must agree with every other plain answer, every chip answer
// with every other chip answer, and the chip's pool must be smaller than the plain pool. This is the live proof that
// the warm row and the write-through key on the applied refine (lib/live/search.js specKeyFor), so whichever runs
// first can never answer the other.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/refineCacheProof.mjs [--base https://goasksam.com]
//
// Report-only on the exit code is NOT the rule here: exit 1 on any disagreement, so a chain stops.
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("refineCacheProof: no PROBE_KEY in the environment - nothing to prove without it."); process.exit(1); }

const CASES = [
  { q: "2005 Porsche 911", refine: { body: "coupe" }, order: ["plain", "chip", "plain"] },
  { q: "1965 Ford Mustang", refine: { body: "coupe" }, order: ["chip", "plain", "chip"] },
  { q: "2005 Porsche 911", refine: { body: "coupe" }, order: ["chip", "plain", "chip"] },
  { q: "1965 Ford Mustang", refine: { body: "coupe" }, order: ["plain", "chip", "plain"] }
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let bad = 0;
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  const ask = (q, refine) => page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {}
      return { status: r.status, ms: Date.now() - t0, d: d ? { tier: d.tier, poolN: d.poolN, cluster: d.cluster || null, rungLabel: d.rungLabel || null, applied: d.resolvedCar && d.resolvedCar.applied || null, bodyStyle: d.resolvedCar && d.resolvedCar.bodyStyle || null, status: d.status || null } : { raw: txt.slice(0, 120) } };
    } catch (e) { return { status: 0, ms: Date.now() - t0, d: { raw: String(e && e.message || e) } }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "refineproof", car: { raw: q }, asked: 0, ...(refine ? { refine } : {}) });
  for (const c of CASES) {
    const got = [];
    for (const step of c.order) {
      const r = await ask(c.q, step === "chip" ? c.refine : null);
      got.push({ step, ...r });
      console.log(`${c.q.padEnd(20)} ${step.padEnd(5)} HTTP ${r.status} ${String(r.ms).padStart(6)}ms  ${JSON.stringify(r.d)}`);
    }
    const plains = got.filter(g => g.step === "plain"), chips = got.filter(g => g.step === "chip");
    const same = (a, b) => a.d && b.d && a.d.tier === b.d.tier && a.d.poolN === b.d.poolN && JSON.stringify(a.d.cluster) === JSON.stringify(b.d.cluster) && a.d.rungLabel === b.d.rungLabel;
    const plainAgree = plains.every(p => same(p, plains[0])), chipAgree = chips.every(x => same(x, chips[0]));
    const narrower = plains[0] && chips[0] && Number.isFinite(plains[0].d.poolN) && Number.isFinite(chips[0].d.poolN) && chips[0].d.poolN < plains[0].d.poolN;
    const ok = plainAgree && chipAgree && narrower;
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.q} order ${c.order.join(" > ")}: plain ${plains.map(p => p.d.poolN).join("/")}, chip ${chips.map(x => x.d.poolN).join("/")}${narrower ? "" : " (chip pool not smaller than plain)"}`);
  }
} finally { await browser.close(); }
console.log(`\nrefineCacheProof: ${bad ? `${bad} case(s) FAILED` : "all cases agree"}.`);
process.exit(bad ? 1 : 0);
