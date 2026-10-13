// GOLDEN TRUTH (Lane B2, Oct 2026): compares all four product paths to the hand-derived answers in docs/golden-rules.md.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/goldenTruth.mjs [--quick] [--ids 1,3] [--pages] [--base https://goasksam.com] [--strict]
//
// For every golden car: the keyed READ-ONLY enginecheck ops task (Market Check, Buy, Sell and Tasks lanes), and, for cars
// marked "page", the public Market Check page heading. Compares rung, label, count, low and high. One table: car by product,
// PASS, FAIL (with the differing field) or PENDING (expected answer not derivable yet; the engine's answer is shown).
// REPORT-ONLY: exit 0 whatever the table says, unless --strict. No vendor request, no write; the key goes only in the
// x-ops-key header of in-page requests to goasksam's own address and is never printed. Without PROBE_KEY it says so and exits 0.
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const flag = n => process.argv.includes("--" + n);
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BATCH = 3;                 // enginecheck runs about 25 seconds a car; three stay under the 300 second function limit
const PRODUCTS = ["marketCheck", "buy", "sell", "tasks"];

const doc = fs.readFileSync(new URL("../docs/golden-rules.md", import.meta.url), "utf8");
const m = /```json golden\n([\s\S]*?)```/.exec(doc);
if (!m) { console.log("goldenTruth: no ```json golden block in docs/golden-rules.md"); process.exit(flag("strict") ? 1 : 0); }
let GOLDEN = JSON.parse(m[1]);
const ids = (arg("ids") || "").split(",").filter(Boolean).map(Number);
if (ids.length) GOLDEN = GOLDEN.filter(g => ids.includes(g.id));
else if (flag("quick")) GOLDEN = GOLDEN.filter(g => g.quick);

if (!KEY) { console.log("goldenTruth: SKIP, no PROBE_KEY in the environment (report-only, nothing compared)."); process.exit(0); }

const money = n => n == null ? "none" : "$" + Number(n).toLocaleString("en-US");
const near = (got, want, pct) => got != null && want != null && Math.abs(got - want) <= Math.max(0, pct || 0) / 100 * want;

// One lane against one golden car. Returns { cell, diffs[] }.
function judge(g, lane) {
  const L = lane || {};
  if (g.empty) {
    const none = !L.ok && /not_tracked|no market read|empty pool|nothing|no pool/i.test(String(L.reason || ""));
    return none ? { cell: "PASS", diffs: [] } : { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: [`expected nothing on record, got ${L.ok ? (L.fallbackRung + " " + L.count) : "an error: " + String(L.reason || "").slice(0, 40)}`] };
  }
  if (!L.ok) return { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: ["no answer: " + String(L.reason || "?").slice(0, 60)] };
  const diffs = [];
  if (g.rung && L.fallbackRung !== g.rung) diffs.push(`rung ${L.fallbackRung} != ${g.rung}`);
  const label = String(L.rungLabel || "");
  const missing = (g.labelHas || []).filter(w => !label.includes(w));
  if (missing.length) diffs.push(`label "${label.slice(0, 50)}" lacks ${missing.map(w => '"' + w + '"').join(", ")}`);
  if (g.count != null && !(Math.abs(L.count - g.count) <= (g.tol || 0))) diffs.push(`count ${L.count} != ${g.count}${g.tol ? " (+/-" + g.tol + ")" : ""}`);
  if (g.countMin != null && !(L.count >= g.countMin)) diffs.push(`count ${L.count} < ${g.countMin}`);
  if (g.low !== undefined && !g.anyBand) {
    if (g.low === null && g.high === null) { if (L.low != null || L.high != null) diffs.push(`band ${money(L.low)} to ${money(L.high)}, expected none`); }
    else {
      if (!near(L.low, g.low, g.tolPct)) diffs.push(`low ${money(L.low)} != ${money(g.low)}`);
      if (!near(L.high, g.high, g.tolPct)) diffs.push(`high ${money(L.high)} != ${money(g.high)}`);
    }
  }
  if (g.status === "pending") return { cell: "PENDING", diffs, shown: `${L.fallbackRung} ${L.count} ${money(L.low)}-${money(L.high)}` };
  return { cell: diffs.length ? "FAIL" : "PASS", diffs };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
const rows = [];
try {
  // The ops task is a keyed GET; plain curl is turned away by Vercel's bot protection, so the request is made from a real page
  // on the site's own address. The key travels only in the x-ops-key header.
  const home = await browser.newPage();
  await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const ops = (url) => home.evaluate(async (u, k) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 290000);
    try { const r = await fetch(u, { headers: { "x-ops-key": k }, signal: ac.signal }); const text = await r.text(); return { status: r.status, text }; }
    catch (e) { return { status: 0, text: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, url, KEY);

  const byQ = {};
  for (let i = 0; i < GOLDEN.length; i += BATCH) {
    const chunk = GOLDEN.slice(i, i + BATCH);
    const url = `/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&specs=${encodeURIComponent(chunk.map(g => g.q).join("|"))}`;
    const r = await ops(url);
    let j = null; try { j = JSON.parse(r.text); } catch (e) {}
    if (r.status === 401) { console.log("goldenTruth: the ops key was rejected (401). Nothing compared."); process.exit(flag("strict") ? 1 : 0); }
    for (const row of (j && j.rows) || []) byQ[row.q] = row;
    if (!j) for (const g of chunk) byQ[g.q] = { q: g.q, error: `ops task returned HTTP ${r.status}` };
  }

  for (const g of GOLDEN) {
    const row = byQ[g.q] || { error: "no row returned" };
    const lanes = row.lanes || {};
    const cells = {};
    for (const p of PRODUCTS) cells[p] = row.error && !row.lanes ? { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: ["resolver: " + String(row.error).slice(0, 50)] } : judge(g, lanes[p]);
    rows.push({ g, cells, page: null });
  }

  // Public Market Check page (the heading carries the range), for the cars marked "page" (all with --pages).
  const pageCars = rows.filter(r => flag("pages") || r.g.page);
  for (const r of pageCars) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    const host = new URL(BASE).host;
    page.on("request", q => { let own = false; try { own = new URL(q.url()).host === host; } catch (e) {} q.continue(own ? { headers: { ...q.headers(), "x-probe-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
    await page.goto(BASE + "/market-check?q=" + encodeURIComponent(r.g.q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    let text = "";
    for (let t = 0; t < 80; t++) { text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (/\$\d[\d,]{2,}|catching his breath|limit of \d+ cars/i.test(text)) break; await new Promise(x => setTimeout(x, 500)); }
    const path = new URL(page.url()).pathname;
    const h1 = await page.evaluate(() => { const h = document.querySelector("h1"); return h ? h.textContent.replace(/\s+/g, " ").trim() : ""; }).catch(() => "");
    const band = /\$([\d,]+)\s+to\s+\$([\d,]+)/.exec(h1) || /\$([\d,]+)\s+to\s+\$([\d,]+)/.exec(text);
    const got = band ? { low: Number(band[1].replace(/,/g, "")), high: Number(band[2].replace(/,/g, "")) } : null;
    const diffs = [];
    if (!path.startsWith("/market-check")) diffs.push(path.startsWith("/sell") ? "redirected to /sell: key rejected" : "ended on " + path);
    else if (r.g.low != null) {
      if (!got) diffs.push("no range on the page");
      else { if (!near(got.low, r.g.low, r.g.tolPct)) diffs.push(`low ${money(got.low)} != ${money(r.g.low)}`); if (!near(got.high, r.g.high, r.g.tolPct)) diffs.push(`high ${money(got.high)} != ${money(r.g.high)}`); }
    }
    r.page = { cell: r.g.status === "pending" ? "PENDING" : (diffs.length ? "FAIL" : "PASS"), diffs };
    await page.close();
  }
} finally { await browser.close(); }

// ---- the table ----
const pad = (s, n) => String(s).padEnd(n);
const short = c => c.cell === "FAIL" ? "FAIL" : c.cell;
console.log(`\nGOLDEN TRUTH  ${new Date().toISOString().slice(0, 10)}  (${BASE})  ${rows.length} cars, expected answers from docs/golden-rules.md\n`);
console.log(pad("#", 3) + pad("Car", 46) + pad("Market Check", 14) + pad("Buy", 9) + pad("Sell", 9) + pad("Tasks", 9) + "Page");
let nFail = 0, nPend = 0, nPass = 0;
for (const r of rows) {
  const cells = PRODUCTS.map(p => short(r.cells[p]));
  console.log(pad(r.g.id, 3) + pad(r.g.q, 46) + pad(cells[0], 14) + pad(cells[1], 9) + pad(cells[2], 9) + pad(cells[3], 9) + (r.page ? short(r.page) : "-"));
  for (const c of [...PRODUCTS.map(p => r.cells[p]), r.page].filter(Boolean)) { if (c.cell === "FAIL") nFail++; else if (c.cell === "PENDING") nPend++; else nPass++; }
}
console.log("\nDifferences (same text on several products is shown once):");
for (const r of rows) {
  const seen = new Map();
  for (const p of PRODUCTS) for (const d of r.cells[p].diffs) { if (!seen.has(d)) seen.set(d, []); seen.get(d).push(p); }
  if (r.page) for (const d of r.page.diffs) { if (!seen.has(d)) seen.set(d, []); seen.get(d).push("page"); }
  if (!seen.size) continue;
  console.log(`  ${r.g.id}. ${r.g.q}${r.g.status === "pending" ? "  [PENDING: " + r.g.pending + "]" : ""}`);
  for (const [d, ps] of seen) console.log(`      ${ps.length === 4 && !ps.includes("page") ? "all four" : ps.join(", ")}: ${d}`);
}
console.log(`\n${nPass} PASS, ${nFail} FAIL, ${nPend} PENDING (report-only; ${flag("strict") ? "strict: failures set the exit code" : "does not set the exit code"}).`);
process.exit(flag("strict") && nFail ? 1 : 0);
