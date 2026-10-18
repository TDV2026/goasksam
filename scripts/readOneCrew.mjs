// READ MANY, CREW (Lane B, Oct 16 2026): Market Check page reads for a list of cars with the crew cookie set, so the
// reads are exempt from the daily distinct-car limit (lib/_ceilings.js checkMarketCheckCarLimit skips crew). Used to
// write the stored rows of the demo, golden and resolver cars after an engine bump ("demo cars warm"). Prints one
// line per car: tier, count, range, label, warm/stale flags and timings. Credentialed: PROBE_KEY in the environment,
// the crew cookie from the Keychain through scripts/_crewCookie.mjs (never printed).
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"
//   node scripts/readOneCrew.mjs --cars "2015 Porsche 911 GT3|2005 Porsche 911" [--base https://goasksam.com]
import puppeteer from "puppeteer-core";
import { crewCookie } from "./_crewCookie.mjs";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CARS = String(arg("cars") || "").split("|").map(s => s.trim()).filter(Boolean);
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("readOneCrew: no PROBE_KEY in the environment."); process.exit(1); }
if (!CARS.length) { console.log("readOneCrew: no --cars."); process.exit(1); }
const CREW = await crewCookie();
if (!CREW) { console.log("readOneCrew: no crew cookie available."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setCookie({ name: "gas_crew", value: CREW, domain: new URL(BASE).hostname, path: "/" });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  for (const CAR of CARS) {
    const r = await page.evaluate(async (u, k, body) => {
      const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 90000);
      try {
        const res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
        const txt = await res.text(); let d = null; try { d = JSON.parse(txt); } catch {}
        return { status: res.status, ms: Date.now() - t0, bytes: txt.length, d: d ? { tier: d.tier, poolN: d.poolN, cluster: d.cluster || null, rungLabel: d.rungLabel || null, samLine: d.samLine || null, stale: !!d.stale, readAt: d.readAt || null, storedAt: d.storedAt || null, windowMonthsChosen: d.windowMonthsChosen === undefined ? null : d.windowMonthsChosen, windowWords: d.windowWords || null, basisLine: d.basisLine || null, warmHit: d.timings ? d.timings.warmHit : null, totalMs: d.timings ? d.timings.totalMs : null } : null };
      } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e && e.message || e) }; } finally { clearTimeout(t); }
    }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: (arg("anon") || "readonecrew"), car: { raw: CAR }, asked: 0 });
    console.log(`${CAR}: HTTP ${r.status} ${r.ms}ms ${r.bytes || 0}b ${JSON.stringify(r.d || r.error)}`);
  }
} finally { await browser.close(); }
