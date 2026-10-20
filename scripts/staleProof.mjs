// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// STALE-THEN-FRESH PROOF (Lane B, speed job stage 4, Oct 15 2026): one car read warm, its stored row marked as if an
// ingest had moved the epoch (task=warmStale, credentialed), read again -> served stale with the exact dated line and the
// stored counts, then read again after the background recompute -> fresh, no line, same counts (nothing changed in the
// archive meanwhile).
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/staleProof.mjs [--base https://goasksam.com] [--car "1990 Mazda Miata"]
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
// the ops task is called on the SAME origin as the page (a cross-origin fetch from the page context is refused)
const OPS = (arg("ops") || BASE).replace(/\/$/, "");
const CAR = arg("car") || "1990 Mazda Miata";
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("staleProof: no PROBE_KEY in the environment."); process.exit(1); }
const LINE = /^Sales read on [A-Z][a-z]+ \d{1,2}\. Sales since then are not in yet\. Updating now\.$/;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let bad = 0;
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const ask = () => page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {}
      return { status: r.status, ms: Date.now() - t0, d: d ? { tier: d.tier, poolN: d.poolN, cluster: d.cluster || null, cards: Array.isArray(d.cards) ? d.cards.length : null, rungLabel: d.rungLabel || null, stale: !!d.stale, staleLine: d.staleLine || null, storedAt: d.storedAt || null, recompute: d.timings ? d.timings.recompute : null, warmHit: d.timings ? d.timings.warmHit : null, selfCall: d.timings ? (d.timings.recompute || d.timings.selfCall || null) : null } : null };
    } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "staleproof", car: { raw: CAR }, asked: 0 });
  const ops = (task, q) => page.evaluate(async (u, k) => { const r = await fetch(u, { headers: { "x-ops-key": k } }); return { status: r.status, text: await r.text() }; }, `${OPS}/api/usageDashboard?view=ops&task=${task}&q=${encodeURIComponent(q)}`, KEY);
  const show = (label, r) => console.log(`${label.padEnd(26)} HTTP ${r.status} ${String(r.ms).padStart(6)}ms ${r.d ? `${r.d.tier}/${r.d.poolN} ${JSON.stringify(r.d.cluster)} "${r.d.rungLabel}" warm ${r.d.warmHit} stale ${r.d.stale}${r.d.selfCall ? ` selfCall ${r.d.selfCall}` : ""}${r.d.recompute ? ` recompute ${JSON.stringify(r.d.recompute)}` : ""}${r.d.staleLine ? ` line "${r.d.staleLine}"` : ""}` : (r.error || "")}`);
  const a = await ask(); show("1. warm read", a);
  const b = await ask(); show("2. warm read again", b);
  const m = await ops("warmStale", CAR); console.log(`   warmStale: HTTP ${m.status} ${m.text.slice(0, 200)}`);
  const c = await ask(); show("3. read, row marked stale", c);
  const staleOk = c.d && c.d.stale && LINE.test(String(c.d.staleLine || "")) && c.d.poolN === b.d.poolN && JSON.stringify(c.d.cluster) === JSON.stringify(b.d.cluster) && c.d.cards === b.d.cards;
  console.log(`   ${staleOk ? "PASS" : "FAIL"} stale read: served as stored (same counts, range, cards) with the dated line in the exact form`);
  if (!staleOk) bad++;
  await new Promise(r => setTimeout(r, 60000));   // the recompute is a full cold read (10 to 20 s) plus the self-call
  const d = await ask(); show("4. read after recompute", d);
  const freshOk = d.d && !d.d.stale && !d.d.staleLine && d.d.poolN === b.d.poolN && JSON.stringify(d.d.cluster) === JSON.stringify(b.d.cluster);
  console.log(`   ${freshOk ? "PASS" : "FAIL"} fresh read: the line is gone, the answer is the stored one recomputed (same counts and range on an unchanged archive)`);
  if (!freshOk) bad++;
} finally { await browser.close(); }
console.log(`\nstaleProof: ${bad ? `${bad} FAILED` : "stale then fresh, as specified"}.`);
process.exit(bad ? 1 : 0);
