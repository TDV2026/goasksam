// IDENTITY PAGES PROOF (Lane B, Oct 15 2026, Sam's table run): through the public path the page uses (POST
// /api/sellerDecision), read a car's bare page, then every identity option's page one at a time, and check that each
// option's count equals the page it opens and that the options sum to Any (with the rows that name no body counted
// as their own option, never a silent gap).
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/identityPagesProof.mjs [--base https://goasksam.com] [--cars "1965 Ford Mustang|2005 Porsche 911"]
//
// Exit 1 on any disagreement.
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CARS = (arg("cars") || "1965 Ford Mustang|2005 Porsche 911|1969 Chevrolet Camaro").split("|").map(s => s.trim()).filter(Boolean);
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("identityPagesProof: no PROBE_KEY in the environment."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let bad = 0;
try {
  const page = await browser.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  const ask = (q, refine) => page.evaluate(async (u, k, body) => {
    const t0 = Date.now(); const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", "x-ops-key": k, "x-launch-stage-test": "2" }, body: JSON.stringify(body), signal: ac.signal });
      const txt = await r.text(); let d = null; try { d = JSON.parse(txt); } catch {}
      return { status: r.status, ms: Date.now() - t0, d: d ? { tier: d.tier, poolN: d.poolN, cards: Array.isArray(d.cards) ? d.cards.length : null, rungLabel: d.rungLabel || null, bodyOptions: d.bodyOptions || null, bodyUnspecified: d.bodyUnspecified ?? null, identityQuestion: d.identityQuestion || null, applied: d.resolvedCar && d.resolvedCar.applied || null, bodyStyle: d.resolvedCar ? (d.resolvedCar.bodyStyle ?? null) : null, samLine: d.samLine || null } : { raw: txt.slice(0, 160) } };
    } catch (e) { return { status: 0, ms: Date.now() - t0, d: { raw: String(e && e.message || e) } }; } finally { clearTimeout(t); }
  }, BASE + "/api/sellerDecision", KEY, { oneBox: true, anonId: "identityproof", car: { raw: q }, asked: 0, ...(refine ? { refine } : {}) });
  for (const q of CARS) {
    const base = await ask(q, null);
    const d = base.d || {};
    console.log(`\n${q}: bare page HTTP ${base.status} ${base.ms}ms tier ${d.tier} poolN ${d.poolN} cards ${d.cards} "${d.rungLabel}" unspecified ${d.bodyUnspecified}`);
    const opts = Array.isArray(d.bodyOptions) ? d.bodyOptions : (d.identityQuestion && Array.isArray(d.identityQuestion.options) ? d.identityQuestion.options : []);
    if (!opts.length) { console.log(`   no body options offered`); continue; }
    let sum = 0, ok = true;
    for (const o of opts) {
      const value = typeof o === "string" ? o.toLowerCase() : o.value;
      const label = typeof o === "string" ? o : o.label, n = typeof o === "string" ? null : o.n;
      const r = await ask(q, { body: value });
      const got = r.d && r.d.poolN != null ? r.d.poolN : (r.d && r.d.cards);
      // TYPED = CHIP (Sam's option 2, e55): typing the body word after the car must read the chip's rows exactly.
      let typedN = null;
      if (value !== "unspecified") {
        let tr = await ask(`${q} ${value}`, null);
        if (!(tr.d && (tr.d.poolN != null || tr.d.cards != null))) tr = await ask(`${q} ${value}`, null);   // one retry: a challenge page or a dropped read is not a count
        typedN = tr.d && tr.d.poolN != null ? tr.d.poolN : (tr.d && tr.d.cards);
      }
      const typedOk = typedN == null ? value === "unspecified" : typedN === Number(n);
      const zero = !(Number(n) >= 1);   // a zero-count option must never be returned
      const bodyNull = value === "unspecified" ? (r.d && r.d.bodyStyle == null) : true;   // "Body not stated" leaves bodyStyle null
      const same = n != null && got === n && !zero && bodyNull && typedOk;
      if (!same) ok = false;
      sum += Number(n) || 0;
      console.log(`   ${same ? "ok  " : "DIFF"} ${String(label).padEnd(16)} option says ${n}, page opens ${got} (HTTP ${r.status} ${r.ms}ms, tier ${r.d && r.d.tier}, "${r.d && r.d.rungLabel}", applied ${JSON.stringify(r.d && r.d.applied)}, bodyStyle ${JSON.stringify(r.d && r.d.bodyStyle)})${zero ? "  [ZERO-COUNT OPTION]" : ""}${bodyNull ? "" : "  [bodyStyle not null on the Body not stated page]"}${typedN == null ? "" : `, typed "${q} ${value}" reads ${typedN}${typedOk ? "" : "  [TYPED DIFFERS FROM THE CHIP]"}`}`);
    }
    const any = Number(d.poolN);
    const sumOk = sum === any;
    if (!sumOk) ok = false;
    console.log(`   ${sumOk ? "ok  " : "DIFF"} options sum ${sum} ${sumOk ? "=" : "!="} Any ${any}${d.bodyUnspecified ? ` (bodyUnspecified ${d.bodyUnspecified}: ${sum + Number(d.bodyUnspecified) === any ? "accounts for the gap" : "does not account for the gap"})` : ""}`);
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${q}`);
  }
} finally { await browser.close(); }
console.log(`\nidentityPagesProof: ${bad ? `${bad} car(s) FAILED` : "every option equals its page and the options sum to Any"}.`);
process.exit(bad ? 1 : 0);
