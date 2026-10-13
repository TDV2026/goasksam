// POST-DEPLOY WARM (Lane B, Oct 2026, Part 1c): run this once, by hand, after an ENGINE_VERSION bump
// (lib/onebox.js) has reached production - every lane, not just the one that bumped it, since the
// warm cache is shared across every caller of api/sellerDecision.js's Market Check branch.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/postDeployWarm.mjs [--base https://goasksam.com]
//
// WHY: a version bump makes the MCWARM cache miss for every row stamped under the old version (by
// design - serving a pre-bump answer would be the exact bug the gate exists to prevent). Before this
// job, nothing re-filled it automatically, so every bare-nameplate Market Check load stayed slow
// until the next scheduled task=warmMC (or someone ran it by hand) - the root cause named in Part 1a.
// api/sellerDecision.js now writes a fresh, cacheable answer back to the warm cache on every miss
// (write-through, Part 1a), so this script no longer needs to populate the table directly: it only
// needs to MAKE each lookup happen once, through the same paths real visitors use, so the very next
// visitor (or the speed check right after this script) hits warm instead of paying the cold-compute
// cost itself.
//
// TWO STEPS:
//   1. task=warmMC (the existing curated bare-nameplate nightly list, api/usageDashboard.js) - a
//      direct, fast engine call + write, no browser needed, archive-only (zero vendor spend).
//   2. Each of the 20 golden cars (docs/golden-rules.md), loaded through the REAL public page
//      (/market-check?q=...) via a real browser request with the crew test-stage header - this is
//      "the public path": api/sellerDecision.js's oneBox branch, not a direct lib/onebox.js call, so
//      this exercises (and warms) the EXACT code path Part 1a changed, including every golden car
//      that resolves to a named trim (a bare nameplate alone would miss those).
//
// REPORT-ONLY: never fails the build. Prints warmed/failed per car; exits 0 always (nothing here is a
// correctness check - scripts/goldenTruth.mjs and the pushCheck speed budgets are). No write beyond
// the warm cache itself (spec_market_cache, the same table task=warmMC already writes to nightly).
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!KEY) { console.log("postDeployWarm: no PROBE_KEY in the environment - nothing warmed, nothing to do without it."); process.exit(0); }

const doc = fs.readFileSync(new URL("../docs/golden-rules.md", import.meta.url), "utf8");
const gm = /```json golden\n([\s\S]*?)```/.exec(doc);
const GOLDEN = gm ? JSON.parse(gm[1]) : [];
if (!GOLDEN.length) console.log("postDeployWarm: no golden-cars JSON block found in docs/golden-rules.md - step 2 has nothing to load.");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let warmed = 0, failed = 0;
try {
  const home = await browser.newPage();
  await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // ---- step 1: task=warmMC (the curated bare-nameplate list, direct engine call + write) ----
  console.log(`-- step 1: task=warmMC (${BASE}) --`);
  const opsResult = await home.evaluate(async (u, k) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 290000);
    try { const r = await fetch(u, { headers: { "x-ops-key": k }, signal: ac.signal }); return { status: r.status, text: await r.text() }; }
    catch (e) { return { status: 0, text: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, `${BASE}/api/usageDashboard?view=ops&task=warmMC`, KEY);
  if (opsResult.status === 401) {
    console.log("postDeployWarm: the ops key was rejected (401) - step 1 skipped, step 2 still runs through the public page (no key needed for the warm side-effect itself, only for the gated page's real result).");
  } else {
    let j = null; try { j = JSON.parse(opsResult.text); } catch {}
    if (j) console.log(`task=warmMC: warmed ${j.warmed}, failed ${j.failed}` + (j.failed ? ` (${(j.rows || []).filter(r => r.error).map(r => `${r.q}: ${r.error}`).join(" | ")})` : ""));
    else console.log(`task=warmMC: HTTP ${opsResult.status}, could not parse response`);
  }

  // ---- step 2: each golden car, through the real public page ----
  console.log(`\n-- step 2: ${GOLDEN.length} golden car(s) through the public /market-check page --`);
  const READY = /\$\d[\d,]{2,}|catching his breath|limit of \d+ cars|which (one|generation|body|model|year|trim)|did you mean/i;
  for (const g of GOLDEN) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const t0 = Date.now();
    try {
      await page.setViewport({ width: 1280, height: 900 });
      await page.setRequestInterception(true);
      const host = new URL(BASE).host;
      page.on("request", rq => { let own = false; try { own = new URL(rq.url()).host === host; } catch {} rq.continue(own ? { headers: { ...rq.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000));
      await page.goto(BASE + "/market-check?q=" + encodeURIComponent(g.q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      let text = "";
      const until = Date.now() + 30000;
      while (Date.now() < until) { text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (READY.test(text)) break; await new Promise(r => setTimeout(r, 500)); }
      const elapsed = Date.now() - t0;
      const path = new URL(page.url()).pathname;
      if (!path.startsWith("/market-check")) { console.log(`FAIL  ${String(g.id).padStart(2)}. ${g.q.padEnd(40)} redirected to ${path} (key rejected?)`); failed++; }
      else if (!READY.test(text)) { console.log(`FAIL  ${String(g.id).padStart(2)}. ${g.q.padEnd(40)} ${elapsed}ms, no real result on the page`); failed++; }
      else { console.log(`OK    ${String(g.id).padStart(2)}. ${g.q.padEnd(40)} ${elapsed}ms`); warmed++; }
    } catch (e) {
      console.log(`FAIL  ${String(g.id).padStart(2)}. ${g.q.padEnd(40)} ${Date.now() - t0}ms, ${String(e && e.message || e).slice(0, 100)}`);
      failed++;
    } finally { await ctx.close().catch(() => {}); }
  }
} finally { await browser.close(); }

console.log(`\npostDeployWarm: ${warmed} loaded, ${failed} failed. Run the speed check (scripts/pushCheck.mjs, or prePush.mjs) next.`);
process.exit(0);
