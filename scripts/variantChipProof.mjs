// VARIANT CHIP PROOF (Lane B, Oct 2026, e51): (1) the GUARD, through the public path the page uses (POST
// /api/sellerDecision with the page's own refine payload): a refine for a variant with no sales returns the "No {variant}
// {car} sale on record in the last five years." answer, never the base page, on both tiers (Lane A's find after e49: the
// base page came back for both, because the API sanitizer dropped every variant value but competition/standard); and
// (2) Sam's decision: a zero-count option is never OFFERED on the live page (the page renders, no "(0)" option exists).
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/variantChipProof.mjs [--base https://goasksam.com] [--api-only]
//
// Exit 1 on any case where the base page comes back.
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const API_ONLY = process.argv.includes("--api-only");
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("variantChipProof: no PROBE_KEY in the environment - nothing to prove without it."); process.exit(1); }

// The page's own payload shape (Lane A's trace): refine { variant, variantLabel }.
const CASES = [
  // guard: a refine for a variant with no sales -> the nothing-on-record answer, on the full tier and the thin tier
  { q: "1957 Porsche 356 Speedster", tier: "result", refine: { variant: "carrera", variantLabel: "Carrera four-cam" }, expectLine: /No Carrera four-cam 1957 Porsche 356 Speedster sale on record/ },
  { q: "1967 Alfa Romeo Giulia Sprint GT Veloce", tier: "result", refine: { variant: "gta", variantLabel: "GTA or TZ" }, expectLine: /No GTA or TZ 1967 Alfa Romeo Giulia Sprint GT Veloce sale on record/ },
  { q: "1969 Jaguar E-Type Coupe", tier: "result", refine: { variant: "lightweight", variantLabel: "Lightweight or Low Drag" }, expectLine: /No Lightweight or Low Drag 1969 Jaguar E-Type Coupe sale on record/ },
  { q: "1966 Ferrari 275 GTB", tier: "thin", refine: { variant: "competizione", variantLabel: "Competizione" }, expectLine: /No Competizione 1966 Ferrari 275 GTB sale on record/ },
  { q: "1961 Jaguar E-Type Roadster", tier: "thin", refine: { variant: "lightweight", variantLabel: "Lightweight or Low Drag" }, expectLine: /No Lightweight or Low Drag 1961 Jaguar E-Type Roadster sale on record/ },
  // restoration is never an option (e52): a stale refine for it is ignored and the base page answers
  { q: "1965 Ford Mustang", tier: "result", refine: { variant: "restoration", variantLabel: "Professional restoration" }, expectBase: true }
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
      return { status: r.status, ms: Date.now() - t0, d: d ? { tier: d.tier, poolN: d.poolN, cards: Array.isArray(d.cards) ? d.cards.length : null, rungLabel: d.rungLabel || null, samLine: d.samLine || null, applied: d.resolvedCar && d.resolvedCar.applied || null } : { raw: txt.slice(0, 120) } };
    } catch (e) { return { status: 0, ms: Date.now() - t0, d: { raw: String(e && e.message || e) } }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "variantproof", car: { raw: q }, asked: 0, refine });
  console.log("-- public API, the page's refine payload --");
  for (const c of CASES) {
    const base = await ask(c.q, null), chip = await ask(c.q, c.refine);
    const sameAsBase = chip.d && base.d && chip.d.tier === base.d.tier && chip.d.cards === base.d.cards && chip.d.rungLabel === base.d.rungLabel;
    const ok = chip.status === 200 && chip.d && (c.expectBase ? sameAsBase && !chip.d.applied : (chip.d.tier === "not_tracked" && c.expectLine.test(String(chip.d.samLine || ""))));
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.q.padEnd(28)} base ${base.d && base.d.tier}/${base.d && base.d.cards} "${base.d && base.d.rungLabel}"  |  chip ${JSON.stringify(c.refine)} -> ${chip.d && chip.d.tier}/${chip.d && chip.d.cards} "${chip.d && (chip.d.samLine || chip.d.rungLabel)}" applied ${JSON.stringify(chip.d && chip.d.applied)}${sameAsBase ? (c.expectBase ? "  [base page, the stale restoration refine ignored]" : "  [IDENTICAL TO THE BASE PAGE]") : ""}`);
  }
  if (!API_ONLY) {
    console.log("\n-- live page: a zero-count option is never offered (the page renders, the option is absent) --");
    const host = new URL(BASE).host;
    const READY = /\$\d[\d,]{2,}|catching his breath|limit of \d+ cars|which (one|generation|body|model|year|trim)|did you mean|sale on record|sales? (since|in the last)/i;
    for (const c of CASES) {
      const ctx = await browser.createBrowserContext();
      const p = await ctx.newPage();
      try {
        await p.setViewport({ width: 1280, height: 900 });
        await p.setRequestInterception(true);
        p.on("request", rq => { let own = false; try { own = new URL(rq.url()).host === host; } catch {} rq.continue(own ? { headers: { ...rq.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
        await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 800));
        await p.goto(BASE + "/market-check?q=" + encodeURIComponent(c.q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        let text = ""; const until = Date.now() + 40000;
        while (Date.now() < until) { text = await p.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (READY.test(text)) break; await new Promise(r => setTimeout(r, 500)); }
        await new Promise(r => setTimeout(r, 1500));
        const chips = await p.evaluate(() => [...document.querySelectorAll("button.hero-idlink, .hero-idlink")].map(e => (e.textContent || "").trim()));
        const zero = chips.filter(t => /\(0\)/.test(t));
        const ready = READY.test(text);
        const ok = ready && zero.length === 0;
        if (!ok) bad++;
        console.log(`${ok ? "PASS" : "FAIL"}  ${c.q.padEnd(28)} ${ready ? "page rendered" : "page did not render a result"}; options offered: ${chips.length ? chips.join(" | ") : "none"}${zero.length ? "  [ZERO-COUNT OPTION OFFERED: " + zero.join(", ") + "]" : ""}`);
      } catch (e) { console.log(`FAIL  ${c.q.padEnd(28)} ${String(e && e.message || e).slice(0, 120)}`); bad++; }
      finally { await ctx.close().catch(() => {}); }
    }
  }
} finally { await browser.close(); }
console.log(`\nvariantChipProof: ${bad ? `${bad} case(s) FAILED` : "every zero-count option returns its nothing-on-record answer"}.`);
process.exit(bad ? 1 : 0);
