// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// READ ONE (Lane B, Oct 2026): one public Market Check API read of a car, printed with tier, count, range, label, the
// stored-row flags (warm hit, stale, the stale line) and the server timings. Optional refine as JSON.
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"
//   node scripts/readOne.mjs --car "1990 Mazda Miata" [--refine '{"body":"coupe"}'] [--base https://goasksam.com]
import puppeteer from "puppeteer-core";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CAR = arg("car") || "1990 Mazda Miata";
let REFINE = null; try { REFINE = arg("refine") ? JSON.parse(arg("refine")) : null; } catch { REFINE = null; }
let EXTRA = {}; try { EXTRA = arg("extra") ? JSON.parse(arg("extra")) : {}; } catch { EXTRA = {}; }   // extra body fields, e.g. {"recompute":true} (credentialed)
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("readOne: no PROBE_KEY in the environment."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const r = await page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 90000);
    try {
      const res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await res.text(); let d = null; try { d = JSON.parse(txt); } catch {}
      const keySizes = d ? Object.keys(d).map(k => [k, JSON.stringify(d[k] ?? null).length]).sort((a, b) => b[1] - a[1]).slice(0, 10) : null;
      return { status: res.status, ms: Date.now() - t0, respBytes: txt.length, keySizes, d: d ? { tier: d.tier, poolN: d.poolN, cluster: d.cluster || null, rungLabel: d.rungLabel || null, samLine: d.samLine || null, stale: !!d.stale, staleLine: d.staleLine || null, storedAt: d.storedAt || null, stillReading: !!d.stillReading, poolYears: d.poolYears || null, recomputingSince: d.recomputingSince || null, timings: d.timings ? { dbBytes: d.timings.dbBytes, warmHit: d.timings.warmHit, warmReadMs: d.timings.warmReadMs, engineMs: d.timings.engineMs, totalMs: d.timings.totalMs, selfCall: d.timings.recompute || d.timings.selfCall || null, selfCallStatus: d.timings.selfCallStatus || null, selfCallError: d.timings.selfCallError || null, fetchMs: d.timings.fetchMs } : null } : { raw: txt.slice(0, 200) } };
    } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "readone", car: { raw: CAR }, asked: 0, ...(REFINE ? { refine: REFINE } : {}), ...EXTRA });
  console.log(`${CAR}${REFINE ? " " + JSON.stringify(REFINE) : ""}: HTTP ${r.status} ${r.ms}ms ${JSON.stringify(r.d || r.error)}`);
  if (r.respBytes) console.log(`   response ${r.respBytes} bytes; largest keys ${JSON.stringify(r.keySizes)}`);
} finally { await browser.close(); }
