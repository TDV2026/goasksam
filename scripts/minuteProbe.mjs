// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// MINUTE PROBE (Lane B, speed job item 0, Oct 15 2026): one public Market Check API read a minute, logged with the
// tier and the time, so a warm's effect on visitors is measured directly ("ok" = HTTP 200 and a real tier, never
// "unavailable" / "Sam's catching his breath"). Stand-in for B2's minuteprobe.mjs on the API path.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/minuteProbe.mjs [--base https://goasksam.com] [--car "1990 Mazda Miata"] [--minutes 90]
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CAR = arg("car") || "1990 Mazda Miata";
const MINUTES = Number(arg("minutes")) || 90;
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("minuteProbe: no PROBE_KEY in the environment."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let ok = 0, bad = 0;
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const ask = () => page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 55000);
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {}
      return { status: r.status, ms: Date.now() - t0, tier: d && d.tier, poolN: d && d.poolN, warmHit: d && d.timings ? d.timings.warmHit : null, line: d && d.samLine ? String(d.samLine).slice(0, 60) : null };
    } catch (e) { return { status: 0, ms: Date.now() - t0, tier: "fetch_error", line: String(e && e.message || e).slice(0, 60) }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "minuteprobe", car: { raw: CAR }, asked: 0 });
  for (let m = 0; m < MINUTES; m++) {
    const t = Date.now();
    const r = await ask();
    const good = r.status === 200 && r.tier && !/^(unavailable|rate_limited|fetch_error|read_failed)$/.test(String(r.tier));
    if (good) ok++; else bad++;
    console.log(`${new Date().toISOString().slice(11, 19)} ${good ? "ok " : "BAD"} HTTP ${r.status} ${String(r.ms).padStart(6)}ms tier ${r.tier} poolN ${r.poolN} warm ${r.warmHit}${r.line ? " | " + r.line : ""}`);
    const wait = 60000 - (Date.now() - t);
    if (wait > 0) await new Promise(res => setTimeout(res, wait));
  }
} finally { await browser.close(); }
console.log(`minuteProbe: ${ok} ok, ${bad} bad over ${ok + bad} minutes.`);
