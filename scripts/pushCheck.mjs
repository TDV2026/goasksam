// PUSH CHECK (Lane C, Oct 2026): before every push, load one Market Check result, one Buy result, one spec page
// and the Sell first step in a real browser, and fail on any 5xx response (page or API call) or any console
// error or uncaught page error, or a page that shows a failure line instead of its result. Production went
// down on Oct 11 from two lane pushes; this is the gate.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/pushCheck.mjs [--base https://goasksam.com]
//
// Market Check and Buy sit behind the launch stage (lib/_launchStage.js), so those two pages send the test stage
// header with the server credential, and only to goasksam's own address (never to fonts or any other host).
// Without PROBE_KEY the gated pages load as the public sees them (a redirect to Sell), which still proves no
// 5xx or console error but not the result itself; the script says so. Exit 0 = all clear, 1 = a failure.
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const HOST = new URL(BASE).host;
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGES = [
  { name: "Market Check result", path: "/market-check?q=" + encodeURIComponent("1995 Porsche 911 Carrera"), gated: true, freshVisitor: true, waitFor: 20000 },
  { name: "Buy result", path: "/buy?q=" + encodeURIComponent("Porsche 911"), gated: true, waitFor: 20000 },
  { name: "Spec page", path: "/cars/porsche/911", gated: false, waitFor: 3000 },
  { name: "Sell first step", path: "/sell", gated: false, waitFor: 3000 }
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let failed = 0;
try {
  for (const pg of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errors = [], fivexx = [];
    if (pg.gated && KEY) {
      await page.setRequestInterception(true);
      page.on("request", r => {
        let own = false; try { own = new URL(r.url()).host === HOST; } catch (e) {}
        r.continue(own ? { headers: { ...r.headers(), "x-probe-key": KEY, "x-launch-stage-test": "2" } } : undefined);
      });
    }
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push("page error: " + String(e && e.message || e).slice(0, 200)));
    page.on("response", r => { if (r.status() >= 500) fivexx.push(r.status() + " " + r.url().replace(/[?#].*$/, "")); });
    // Market Check counts distinct cars per visitor per day; open the home page first so this run is its own
    // visitor (the page's first visit beacon issues the visitor id), and one car is one count.
    if (pg.freshVisitor) { await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 2000)); }
    const resp = await page.goto(BASE + pg.path, { waitUntil: "networkidle2", timeout: 60000 }).catch(e => { errors.push("load: " + e.message.slice(0, 200)); return null; });
    await new Promise(r => setTimeout(r, pg.waitFor));
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {});
    const status = resp ? resp.status() : 0, final = page.url().replace(BASE, "");
    const shown = await page.evaluate(() => { const t = s => String(s || "").replace(/\s+/g, " ").trim(); const h = document.querySelector("h1"); return { h1: t(h && h.textContent).slice(0, 70), text: t(document.body && document.body.innerText).length, money: (t(document.body && document.body.innerText).match(/\$\d[\d,]{2,}/g) || []).length }; }).catch(() => ({}));
    // A page that loads but shows a failure line instead of a result is a failure too (Oct 11: Market Check showed
    // "Sam's catching his breath" with no console error and passed).
    const failLine = await page.evaluate(() => { const t = document.body ? document.body.innerText : ""; const m = /catching his breath|having trouble answering|Connection issue|couldn.t finish that one|couldn.t read that just now/i.exec(t); return m ? m[0] : null; }).catch(() => null);
    if (failLine) errors.push(`shows a failure line instead of a result: "${failLine}"`);
    const ok = status > 0 && status < 500 && !fivexx.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${pg.name}  HTTP ${status}  ${final}  h1 "${shown.h1 || ""}", ${shown.text || 0} chars, ${shown.money || 0} dollar figures` + (pg.gated && !KEY ? "  (no PROBE_KEY: public view)" : ""));
    for (const x of fivexx) console.log("      5xx " + x);
    for (const x of errors) console.log("      " + x);
    await page.close();
  }
  // MARKET CHECK LOAD-TIME BUDGET (Oct 2026, "Sam's catching his breath" reliability job): the
  // existing PAGES loop above already fails on the calm line for ONE car (fc381a3); this adds a
  // measured ELAPSED-TIME budget across a few more cars from the fixed set Part B measured against
  // production. networkidle2 + a follow-up waitForNetworkIdle proved unreliable as a "ready" signal
  // here (some background poll never truly goes idle, so both pinned every measurement to a flat
  // ~21s regardless of actual load time) - poll the DOM directly for the real signal instead: a
  // dollar figure, the calm line, or the daily-car-limit line.
  // Budget proposed from a real 8-car x 5-run measurement against production (Oct 2026): fenced
  // queries ("2008 Porsche 997 Carrera S Coupe", "2024 Porsche 911 Cabriolet") held 4.2-6.5s total;
  // bare/unscoped nameplates ("1995 Porsche 911 Carrera", the ORIGINAL car Lane C's fc381a3 note
  // measured at 9,826ms) held RELIABLY, not intermittently, in the 9.8-11.8s range every single
  // attempt (5/5) - this is a real, repeatable cost of an unscoped title scan, not noise. Worst
  // observed total across the full sweep: 12,006ms (a BMW M3 Coupe attempt; its other 4 attempts
  // were 5.3-8.1s, so that one WAS noise - likely the connection-pool contention this session
  // already found independently in parallel crossProductCheck batches). 18s sits with real margin
  // above today's worst case while stopping well short of the server's own 20s ONEBOX_DEADLINE_MS
  // and the client's 25s fetch abort (js/onebox.js obFetch) - so this gate fires BEFORE either of
  // those would, catching a regression early instead of only after a user already saw the calm line.
  // TIGHTER TARGET (Oct 2026, bare-nameplate pagination job): lib/_supabase.js's supabaseSelectAll
  // now pages a large pool concurrently instead of sequentially (same rows, proven byte-identical
  // tier/cards/cluster/span across 15 measured nameplates before/after) - a real, measured win for
  // round-trip-bound cases: a 15-nameplate server-only sweep (year+make+model, no trim, via obdiag)
  // dropped from p50 2.6s/p95 8.46s/max 8.9s to p50 2.4s/p95 7.0s/max 8.5s, with the biggest single
  // case (1991 BMW M3) going 7.4s -> 2.1-2.4s. MC_PERF_TIGHT_MS (14000, default) applies to the two
  // existing fixed cars, with real margin above the 11,788ms just re-observed for "1995 Porsche 911
  // Carrera" post-fix. NOT every shape improved equally: "1969 Chevrolet Camaro" (86 qualifying
  // cards from a much larger raw pool) stayed at 7.0-8.5s server-only even after this fix - its cost
  // looks like per-page query/scan time, not round-trip count, and needs its own separate measured
  // pass. It keeps the LOOSER MC_PERF_BUDGET_MS (18000, unchanged) rather than being held to the
  // tighter number this fix does not actually deliver for its shape - an honest gate, not a wish.
  const PERF_BUDGET_MS = Number(process.env.MC_PERF_BUDGET_MS) || 18000;
  const PERF_TIGHT_MS = Number(process.env.MC_PERF_TIGHT_MS) || 14000;
  // MC_PERF_WARM_MS (Round 5 Job 3, Oct 2026, bare-nameplate warm cache): a WARMED bare nameplate
  // (api/sellerDecision.js's "WARM-LIST FAST PATH" - a hit skips the live compute entirely, one
  // indexed spec_market_cache SELECT by exact key instead of paging/fencing the raw pool) should
  // cost close to a cache-hit's natural latency, not the cold-compute time the two budgets above
  // exist for. Set from the observed floor of this SAME browser-measured methodology on an
  // ALREADY-FAST car ("2008 Porsche 997 Carrera S Coupe" measured 5,438-7,217ms total even on a
  // live compute, per the prior round's own re-check) - that floor is page-load/render overhead
  // this methodology always pays, not engine time, so a true cache hit cannot beat it by much
  // either. 8000ms gives real margin above that floor while sitting far below PERF_TIGHT_MS
  // (14000) and PERF_BUDGET_MS (18000), which stay a live-compute's honest ceiling, not this one's.
  // Requires the nameplate to actually be warmed first (scripts/warmMarketCheck.js / task=warmMC) -
  // this check does not warm it itself, so a cold run here is a signal the warm job needs
  // re-running, not a code regression.
  const PERF_WARM_MS = Number(process.env.MC_PERF_WARM_MS) || 8000;
  const PERF_CARS = [
    { car: "2008 Porsche 997 Carrera S Coupe", budget: PERF_TIGHT_MS },
    { car: "1995 Porsche 911 Carrera", budget: PERF_TIGHT_MS },
    { car: "1969 Chevrolet Camaro", budget: PERF_BUDGET_MS }
    // The warmed-Camaro check (budget PERF_WARM_MS, same nameplate, kept separate from the loose-
    // budget row above) is added in a FOLLOW-UP commit, after this push deploys and the warm cache
    // is actually populated (task=warmMC) - adding it in THIS commit would fail prePush's own gate
    // on this exact push, since the fix it checks for cannot exist until after the push lands. Not
    // a silent omission: see the Round 5 Job 3 report for the verified-afterward addition.
  ];
  for (const { car, budget } of PERF_CARS) {
    // Without PROBE_KEY this page is the public redirect to /sell (same as the gated PAGES entries
    // above), not Market Check at all - timing THAT page would be meaningless noise, not a real
    // measurement, so skip rather than report a number that isn't about Market Check.
    if (!KEY) { console.log(`SKIP  Market Check perf: "${car}"  (no PROBE_KEY: public view, nothing to time)`); continue; }
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", r => {
      let own = false; try { own = new URL(r.url()).host === HOST; } catch (e) {}
      r.continue(own ? { headers: { ...r.headers(), "x-probe-key": KEY, "x-launch-stage-test": "2" } } : undefined);
    });
    const url = BASE + "/market-check?q=" + encodeURIComponent(car);
    const t0 = Date.now();
    let navErr = null;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(e => { navErr = String(e && e.message || e).slice(0, 150); });
    const deadline = Date.now() + Math.max(budget, 15000) + 5000; // give it a little past budget to see how far over, if at all
    let failLine = null, overBudget = false, elapsed = 0;
    for (;;) {
      elapsed = Date.now() - t0;
      const info = await page.evaluate(() => {
        const t = document.body ? document.body.innerText : "";
        const fail = /catching his breath|having trouble answering|Connection issue|couldn.t finish that one|couldn.t read that just now/i.exec(t);
        return { fail: fail ? fail[0] : null, money: (t.match(/\$\d[\d,]{2,}/g) || []).length, limit: /today.s limit of \d+ cars/i.test(t) };
      }).catch(() => ({}));
      if (info.fail) { failLine = info.fail; break; }
      if (info.money > 0 || info.limit) break;
      if (Date.now() > deadline) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if (elapsed > budget) overBudget = true;
    const ok = !navErr && !failLine && !overBudget;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  Market Check perf: "${car}"  ${elapsed}ms  (budget ${budget}ms)`);
    // Indented (6 spaces) to match the existing PAGES loop's failure-detail convention above -
    // prePush.mjs's baseline scanner only treats 6-space-indented lines as failure detail to check
    // against BASELINE_FAILURES; a FAIL whose only detail sits on the unindented summary line above
    // is invisible to that scanner and gets silently waved through as "only baseline failures seen"
    // even though pushCheck's own exit code was nonzero. Found and fixed in this same job.
    if (navErr) console.log(`      load: ${navErr}`);
    if (failLine) console.log(`      shows a failure line instead of a result: "${failLine}"`);
    if (overBudget) console.log(`      exceeds budget: ${elapsed}ms > ${budget}ms`);
    await page.close();
  }
} finally { await browser.close(); }
console.log(failed ? `${failed} page(s) failed.` : "All pages clear: no 5xx, no console error, no Market Check car over budget.");
process.exit(failed ? 1 : 0);
