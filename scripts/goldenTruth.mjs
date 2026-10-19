// GOLDEN TRUTH (Lane B2, Oct 2026): compares all four product paths to the hand-derived answers in docs/golden-rules.md.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/goldenTruth.mjs [--quick] [--ids 1,3] [--pages] [--deadline=240] [--wording] [--base https://goasksam.com] [--strict]
//   default = mode api (engine answers through the keyed enginecheck path; a page only for rows whose check needs the printed text);
//   --pages = mode pages (every row's Market Check, Buy and Sell page: the launch run); --wording = the e60 launch wording checks (no month count anywhere).
//
// For every golden car: the keyed READ-ONLY enginecheck ops task (Market Check, Buy, Sell and Tasks lanes), and, for cars
// marked "page", the public Market Check page heading. Compares rung, label, count, low and high. One table: car by product,
// PASS, FAIL (with the differing field) or PENDING (expected answer not derivable yet; the engine's answer is shown).
// REPORT-ONLY: exit 0 whatever the table says, unless --strict. No vendor request, no write; the key goes only in the
// x-ops-key header of in-page requests to goasksam's own address and is never printed. Without PROBE_KEY it says so and exits 0.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { crewCookie } from "./_crewCookie.mjs";

const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const flag = n => process.argv.includes("--" + n);
// MODES (Oct 16 2026, Sam): "pages" (--pages) renders the Market Check, Buy and Sell page of every row (the final launch run); the default "api" reads every
// engine answer through the keyed enginecheck path and renders a page only for a row whose check needs the printed text (needsPage below).
const MODE = process.argv.includes("--pages") ? "pages" : "api";
const DEADLINE = Math.max(20, Number((process.argv.find(a => a.startsWith("--deadline=")) || "").split("=")[1]) || 240);   // seconds one read may take before the row is marked re-read
const stamp = () => new Date().toISOString().slice(11, 19) + "Z";
const needsPage = g => !!(g.page || g.wordsHas || g.statesBody || g.equalsBare || g.chipPairs || g.sharedCard || g.sellEqualsMC || g.noZeroOptions || g.variantRule || g.noRestoration || g.question);
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
// An identity row (the bare 1965 Mustang) checks the question's option counts, not a range; it has its own block below.
let IDENT = GOLDEN.filter(g => g.identity);
GOLDEN = GOLDEN.filter(g => !g.identity);
if (ids.length) { GOLDEN = GOLDEN.filter(g => ids.includes(g.id)); IDENT = IDENT.filter(g => ids.includes(g.id)); }   // an identity row runs only when asked for by --ids
else if (flag("quick")) GOLDEN = GOLDEN.filter(g => g.quick);
const TOTAL_ALL = GOLDEN.length + IDENT.length;   // every row of the table, identity rows included

if (!KEY) { console.log("goldenTruth: SKIP, no PROBE_KEY in the environment (report-only, nothing compared)."); process.exit(0); }

const money = n => n == null ? "none" : "$" + Number(n).toLocaleString("en-US");
const near = (got, want, pct) => got != null && want != null && Math.abs(got - want) <= Math.max(0, pct || 0) / 100 * want;

// One lane against one golden car. Returns { cell, diffs[] }.
function judge(g, lane) {
  const L = lane || {};
  if (g.question) { const asked = !L.ok || (L.count === 0 && L.low == null); return asked ? { cell: "PASS", diffs: [] } : { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: [`expected a question and no count, got ${L.count} ${money(L.low)} to ${money(L.high)}`] }; }
  if (g.empty) {
    const none = !L.ok && /not_tracked|no market read|empty pool|nothing|no pool/i.test(String(L.reason || ""));
    return none ? { cell: "PASS", diffs: [] } : { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: [`expected nothing on record, got ${L.ok ? (L.fallbackRung + " " + L.count) : "an error: " + String(L.reason || "").slice(0, 40)}`] };
  }
  if (!L.ok && /HTTP 0|timed out|abort/i.test(String(L.reason || ""))) return { cell: "RE-READ", diffs: ["re-read: " + String(L.reason).slice(0, 60)] };
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
  // Set-aside and option checks (rows 22 and 23, Oct 15 2026): the set-aside count and its reasons, and no option with zero sales anywhere.
  if (g.setAside) {
    const sa = (L.counts && L.counts.setAside) || {};
    const reasons = Object.entries(sa.reasons || {}).filter(([, n]) => n > 0).map(([k, n]) => k + " " + n);
    if (sa.total !== g.setAside.total) diffs.push(`set aside ${sa.total == null ? "none reported" : sa.total} != ${g.setAside.total}`);
    for (const w of g.setAside.reasons || []) if (!(sa.reasons && sa.reasons[w] > 0)) diffs.push(`set-aside reason "${w}" missing (reasons given: ${reasons.join(", ") || "none"})`);
  }
  if (g.noZeroOptions) {
    for (const inv of L.outputInvariants || []) {
      const m = /^options (.*?)(?: \+ \d+ unspecified)? = pool/.exec(String(inv.detail || ""));
      const zero = m ? m[1].split(", ").filter(x => /\s0$/.test(x)) : [];
      if (zero.length) diffs.push(`option with zero sales shown: ${zero.join(", ")}`);
    }
  }
  // Rule 2 (variant-market options, Sam Oct 15 2026): Pushrod, Carrera four-cam, Road, Competizione show only when both sides hold 8 or more
  // sales and sit 25 percent apart; a smaller variant is set aside and named in the scope line, never offered as an option.
  if (g.variantRule) {
    for (const inv of L.outputInvariants || []) {
      const m = /^options (.*?)(?: \+ \d+ unspecified)? = pool/.exec(String(inv.detail || ""));
      const small = m ? m[1].split(", ").filter(x => { const n = Number((/\s(\d+)$/.exec(x) || [])[1]); return Number.isFinite(n) && n < 8; }) : [];
      if (small.length) diffs.push(`variant option under 8 sales offered: ${small.join(", ")}`);
    }
  }
  if (g.status === "pending") return { cell: "PENDING", diffs, shown: `${L.fallbackRung} ${L.count} ${money(L.low)}-${money(L.high)}` };
  return { cell: diffs.length ? "FAIL" : "PASS", diffs };
}

const CREW = await crewCookie();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
const rows = [];
const byQ = {};
let chassisGuard = null;
let chipPairOut = [];
let cardOut = [];
let identityOut = [];   // the identity rows: [{ id, q, any, checks: [{ name, cell, diffs, shown }] }]
try {
  // The ops task is a keyed GET; plain curl is turned away by Vercel's bot protection, so the request is made from a real page
  // on the site's own address. The key travels only in the x-ops-key header.
  let home = await browser.newPage();
  const openHome = async () => { home = await browser.newPage(); await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 2000)); };
  await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const ops1 = (url) => home.evaluate(async (u, k, dl) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), dl * 1000);
    try { const r = await fetch(u, { headers: { "x-ops-key": k }, signal: ac.signal }); const text = await r.text(); return { status: r.status, text }; }
    catch (e) { return { status: 0, text: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, url, KEY, DEADLINE);
  // The page can navigate itself (a detached frame); open a fresh one and ask again, once.
  const ops = async (url) => { try { return await ops1(url); } catch (e) { await openHome(); return await ops1(url); } };

  
const GOLDEN_QS = [...new Set(GOLDEN.map(g => g.q))];   // rows 22 and 23 read the same car as rows 8 and 14: one engine read each
  for (let i = 0; i < GOLDEN_QS.length; i += BATCH) {
    console.error(`progress mode ${MODE}: rows done ${GOLDEN.filter(g => GOLDEN_QS.indexOf(g.q) < i).length} of ${TOTAL_ALL} (engine reads), reading cars ${i + 1} to ${Math.min(i + BATCH, GOLDEN_QS.length)}, read started ${stamp()}`);
    const chunk = GOLDEN_QS.slice(i, i + BATCH).map(q => ({ q }));
    const url = `/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&formpairs=0&identitycounts=0&specs=${encodeURIComponent(chunk.map(g => g.q).join("|"))}`;
    const tChunk = Date.now();
    const r = await ops(url);
    const ranOver = Date.now() - tChunk >= DEADLINE * 900;
    let j = null; try { j = JSON.parse(r.text); } catch (e) {}
    if (r.status === 401) { console.log("goldenTruth: the ops key was rejected (401). Nothing compared."); process.exit(flag("strict") ? 1 : 0); }
    for (const row of (j && j.rows) || []) byQ[row.q] = row;
    // A chunk that comes back empty (HTTP 0 from a read that ran long under load) is asked again one car at a time, so a slow archive
    // costs time and not a false FAIL on three cars.
    // A read that ran over the deadline is NOT asked again (the server is still working on the first ask; a second ask adds load while the archive is slow): the cars are marked re-read.
    if (!j && ranOver) for (const g of chunk) byQ[g.q] = { q: g.q, error: `ops task returned HTTP 0 (read ran over the ${DEADLINE} s line, started ${new Date(tChunk).toISOString().slice(11, 19)}Z)` };
    else if (!j) for (const g of chunk) {
      const r1 = await ops(`/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&formpairs=0&identitycounts=0&specs=${encodeURIComponent(g.q)}`);
      let j1 = null; try { j1 = JSON.parse(r1.text); } catch (e) {}
      const row1 = j1 && j1.rows && j1.rows[0];
      byQ[g.q] = row1 || { q: g.q, error: `ops task returned HTTP ${r1.status}` };
    }
  }

  for (const g of GOLDEN) {
    const row = byQ[g.q] || { error: "no row returned" };
    const lanes = row.lanes || {};
    const cells = {};
    for (const p of PRODUCTS) cells[p] = row.error && !row.lanes ? (/HTTP 0/.test(String(row.error)) ? { cell: "RE-READ", diffs: ["re-read: " + String(row.error).slice(0, 110)] } : { cell: g.status === "pending" ? "PENDING" : "FAIL", diffs: ["resolver: " + String(row.error).slice(0, 50)] }) : judge(g, lanes[p]);
    rows.push({ g, cells, page: null });
  }

  // PAGES (Part 1, Oct 13 2026): what each product's page actually RENDERS, read from the page text.
  //   marketCheck  /market-check?q=      the hero: scope line, "N sales", the middle-half range or the sold-between range
  //   buy          /buy?q=               the figure the page prints on its first live car (Sam's line: "landed at $X to $Y"); Buy prints no sold count
  //   sell         /sell?car=&state=&how=&rush=   the result address (the three questions answered in the address); the page prints "N of M ... in the last 12 months"
  //                and no range. Viewing it sends no email and writes no lead; there is no dry-run flag to pass because none is needed.
  //   tasks        the Task email line, from Lane C's read-only preview (GET /api/tasks?emailpreview=1&q=), column Task email.
  // Each rendered count and range is compared with that product's OWN engine answer (a difference is RENDER DRIFT, with the field)
  // and, when the page agrees with its engine, the engine's verdict against the golden line stands for the page.
  // Every page is opened in its own browser context (a fresh visitor, so no per-visitor car limit) and the key goes only in the
  // x-ops-key header of requests to goasksam's own address.
  // Rows 22 and 23: no option with zero sales on the page, no restoration option line.
  const textDiffs = (g, text, pr, parsed) => {
    const out = [];
    // Typed-body rows (Oct 16 2026): a words answer prints its sentence and no count or range; a "states a body" count row prints its one line.
    // LAUNCH WORDING (Sam, Oct 17 2026; run with --wording once e60 is live): no month count on any product; the shared card says "Latest sale: {Month Year}." and its basis
    // line reads "Based on N sales, the latest in {Month Year}." (a count under ten as a word). Off by default: today's pages still say "last 12 months".
    if (flag("wording") && (pr === "marketCheck" || pr === "sell")) {
      const flat0 = String(text).replace(/\s+/g, " ");
      const mc = /\b(?:last|past|within)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty-four|thirty-six|sixty)\s+months?\b/i.exec(flat0);
      if (mc) out.push(`the page prints a month count: "${mc[0]}"`);
      if (pr === "marketCheck" && parsed && parsed.count != null && parsed.count > 0 && !/Latest sale: [A-Z][a-z]+ \d{4}\./.test(flat0)) out.push('the card does not say "Latest sale: {Month Year}."');
      if (pr === "marketCheck" && parsed && parsed.count != null && parsed.count > 0 && !/Based on (\d+|[A-Za-z]+) sales?, the latest in [A-Z][a-z]+ \d{4}\./.test(flat0)) out.push('the card basis line does not read "Based on N sales, the latest in {Month Year}."');
    }
    if (pr === "marketCheck") {
      const flat = String(text).replace(/\s+/g, " ");
      for (const w of g.wordsHas || []) if (!flat.includes(w)) out.push(`the page does not print the sentence: "${w}"`);
      if (g.noCountRange && parsed && (parsed.count != null || parsed.range)) out.push(`a words answer must show no count or range; the page shows ${parsed.count == null ? "-" : parsed.count} ${parsed.range ? money(parsed.range.low) + " to " + money(parsed.range.high) : "no range"}`);
      if (g.statesBody && !flat.includes(g.statesBody)) out.push(`the page does not print the line: "${g.statesBody}"`);
    }
    if (g.noZeroOptions) { const z = [...String(text).matchAll(/([A-Za-z][A-Za-z0-9 \/-]{1,40}?)\s*\(0\)/g)].map(x => x[1].trim()); if (z.length) out.push(`option with zero sales shown on the page: ${z.join(", ")}`); }
    if (g.variantRule) { const small = [...String(text).matchAll(/([A-Za-z][A-Za-z0-9 \/-]{1,40}?)\s*\(([1-7])\)/g)].map(x => x[1].trim() + " (" + x[2] + ")"); if (small.length) out.push(`variant option under 8 sales offered on the page: ${small.join(", ")}`); }
    if (g.noRestoration && /professional restoration|restoration option/i.test(text)) out.push("a restoration option line appears on the page");
    return out;
  };
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = w => { const t = String(w || "").toLowerCase().replace(/,/g, ""); return /^\d+$/.test(t) ? Number(t) : (WORDS[t] || null); };
  const parseRange = t => { const m = /\$([\d,]+)\s+to\s+\$([\d,]+)/.exec(t); return m ? { low: Number(m[1].replace(/,/g, "")), high: Number(m[2].replace(/,/g, "")) } : null; };
  const PARSERS = {
    marketCheck(text) {
      const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
      const i = lines.findIndex(x => /^MARKET CHECK$/.test(x));
      const scope = i >= 0 ? (lines[i + 2] || "") : "";
      let cm = /(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+sales?\b/i.exec(scope);
      // A thin page has no scope row; its count is the line "One sale last twelve months." (Oct 16 2026: the pushed stack also renamed the range heading to WHAT THESE SELL FOR.)
      if (!cm) cm = lines.map(x => /^(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+sales?\s+(?:in the\s+)?(?:last|past)\b/i.exec(x)).find(Boolean) || null;
      const k = lines.findIndex(x => /^(WHERE (THE MIDDLE HALF|THEY) SOLD|WHAT THESE SELL FOR)/.test(x));
      const range = k >= 0 ? parseRange(lines.slice(k, k + 3).join(" ")) : null;
      return { count: cm ? num(cm[1]) : null, range, scope, kind: k >= 0 && /MIDDLE HALF/.test(lines[k]) ? "band" : (k >= 0 ? "soldBetween" : null) };
    },
    buy(text) {
      // Each live car on the page carries Sam's line about ITS OWN cohort. Read every listing: its title, the cohort label, the range.
      const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
      const listings = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== "SAM") continue;
        let title = null;
        for (let k = i - 1; k >= Math.max(0, i - 6); k--) if (/\b(19|20)\d{2}\b.*[A-Za-z]/.test(lines[k]) && !/miles|bids?|Ends|ago|left/i.test(lines[k]) && lines[k].length < 90) { title = lines[k]; break; }
        const label = lines[i + 1] || "", sentence = lines[i + 2] || "";
        const m = /\$([\d,]+) to \$([\d,]+)/.exec(sentence) || /between \$([\d,]+) and \$([\d,]+)/.exec(sentence);
        if (title) listings.push({ title, label, range: m ? { low: Number(m[1].replace(/,/g, "")), high: Number(m[2].replace(/,/g, "")) } : null, sentence });
      }
      const first = listings.find(l => l.range) || null;
      return { count: null, range: first ? first.range : null, scope: first ? first.label : "", listings };
    },
    sell(text) {
      const NW = "\\d[\\d,]*|one|two|three|four|five|six|seven|eight|nine|ten";   // the page writes one to ten as words
      const m = new RegExp(`(${NW})\\s+of\\s+(${NW})\\b[^\\n]*?(?:last|past)\\s+(?:12 months|\\w+ years?)|(${NW})\\s+of\\s+(${NW})\\s+(?:since|in the)`, "i").exec(text) || new RegExp(`(${NW})\\s+of\\s+(${NW})\\b`, "i").exec(text);
      const ls = text.split("\n").map(x => x.trim()), ai = ls.indexOf("Analysis scope"), sc = ai > 0 ? [null, ls[ai - 1]] : /^For the (.+?)\.?$/m.exec(text);   // the scope row names the span; the header names the car
      return { count: m ? num(m[2] || m[4]) : null, range: parseRange(text.split("WHO SAM WOULD RECOMMEND")[0]), scope: sc ? sc[1] : "" };
    }
  };
  const pageUrl = {
    marketCheck: q => BASE + "/market-check?q=" + encodeURIComponent(q),
    buy: q => BASE + "/buy?q=" + encodeURIComponent(q),
    sell: q => BASE + "/sell?car=" + encodeURIComponent(q) + "&state=California&how=self&rush=none"
  };
  const READY = {
    marketCheck: /\$\d[\d,]{2,}|catching his breath|limit of \d+ cars/i,
    buy: /landed at \$|sold between \$|That.s everything matching|Nothing else right now|No live|0 live|live .* right now/i,
    sell: /SAM.S PICK|WHO SAM WOULD RECOMMEND|not enough|couldn.t/i
  };
  async function readPage(product, q, opts = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (CREW) await page.setCookie({ name: "gas_crew", value: CREW, domain: new URL(BASE).hostname, path: "/" });
    try {
      await page.setViewport({ width: 1280, height: 900 });
      await page.setRequestInterception(true);
      const host = new URL(BASE).host;
      page.on("request", rq => { let own = false; try { own = new URL(rq.url()).host === host; } catch (e) {} rq.continue(own ? { headers: { ...rq.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await new Promise(x => setTimeout(x, 1500));
      await page.goto(pageUrl[product](q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      let text = "";
      const until = Date.now() + (product === "sell" ? 90000 : 45000);
      while (Date.now() < until) { text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (READY[product].test(text)) break; await new Promise(x => setTimeout(x, 1000)); }
      await new Promise(x => setTimeout(x, 1500));
      text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => text);
      // The shared "What these sell for" card (lib/sellsForCard.js, root .sfc-card), the pill slot and any pill row taken out, as the browser serializes it.
      // Buy keeps the card in the Market Check drawer of a listing: open the first one (the link named Market Check) and wait for the card, as a visitor would.
      if (product === "buy" && opts.openDrawer && !(await page.evaluate(() => !!document.querySelector(".sfc-card")).catch(() => false))) {
        const opened = await page.evaluate(() => { const e = [...document.querySelectorAll("a,button,[role=button]")].find(x => /^market check\b/i.test((x.innerText || "").trim())); if (!e) return false; e.click(); return true; }).catch(() => false);
        if (opened) { const until2 = Date.now() + 10000; while (Date.now() < until2 && !(await page.evaluate(() => !!document.querySelector(".sfc-card")).catch(() => false))) await new Promise(x => setTimeout(x, 500)); }
      }
      const card = await page.evaluate(() => { const c = document.querySelector(".sfc-card"); if (!c) return null; const k = c.cloneNode(true); k.querySelectorAll(".gas-pill-slot,.pillrow").forEach(e => e.remove()); const full = k.outerHTML; k.querySelectorAll(".sfc-basis,.sfc-footer-link").forEach(e => e.remove()); return { full, demoNorm: k.outerHTML }; }).catch(() => null);
      return { path: new URL(page.url()).pathname, text, card: card && card.full, cardDemoNorm: card && card.demoNorm };
    } finally { await ctx.close().catch(() => {}); }
  }
  // The partner demo's card for the same words: the endpoint's own card string (crew gate), pill slot removed, serialized by the same browser so the two compare byte for byte.
  async function partnerCard(q) {
    // Lane C's path (Oct 17 2026): a real page on goasksam.com with the signed crew cookie (secure, domain goasksam.com), /partner-demo must answer 200 first,
    // then the answer is asked for from inside the page with the cookie included, one read at a time. The cookie value is never printed.
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (CREW) await page.setCookie({ name: "gas_crew", value: String(CREW).trim(), domain: new URL(BASE).hostname, path: "/", secure: true });
    try {
      const resp = await page.goto(BASE + "/partner-demo", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
      if (!resp || resp.status() !== 200) return { err: "/partner-demo answered " + (resp ? resp.status() : "nothing") + " (the crew cookie did not verify there)" };
      return await page.evaluate(async (q) => {
        try {
          const r = await fetch("/api/partnerAnswer", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) });
          if (!r.ok) return { err: "HTTP " + r.status };
          const j = await r.json(); if (!j || !j.card) return { err: "no card in the answer" };
          const d = document.createElement("div"); d.innerHTML = j.card;
          d.querySelectorAll(".gas-pill-slot,.pillrow,.sfc-basis,.sfc-footer-link").forEach(e => e.remove());
          return { html: d.firstElementChild ? d.firstElementChild.outerHTML : null };
        } catch (e) { return { err: String(e && e.message || e).slice(0, 80) }; }
      }, q);
    } finally { await ctx.close().catch(() => {}); }
  }
  // Compare one rendered page with the same product's engine lane. Returns drift strings.
  function drift(product, rendered, lane, facts) {
    const out = [];
    if (!lane || !lane.ok) return out;
    if (rendered.count != null && lane.count != null && rendered.count !== lane.count) out.push(`count ${rendered.count} on the page, ${lane.count} in its engine answer`);
    // Thin tier (the engine carries no band): the product rule is that no page prints a range, and the low and high appear nowhere on the page
    // (Sam, Oct 18 2026, rows 14 and 23). The page is judged against the engine's tier decision, not against a raw low and high.
    if (product === "marketCheck" && lane.low == null) {
      if (rendered.range) out.push(`page prints ${money(rendered.range.low)} to ${money(rendered.range.high)}, the engine tier is thin (no range on any page)`);
      for (const v of facts ? [facts.low, facts.high] : []) if (rendered.text && rendered.text.includes(money(v))) out.push(`${money(v)} appears on the page, the engine tier is thin (low and high appear nowhere)`);
    } else {
      const want = lane.low != null ? { low: lane.low, high: lane.high } : (product === "marketCheck" && facts ? facts : (product === "marketCheck" ? null : (Array.isArray(lane.span) ? { low: lane.span[0], high: lane.span[1] } : null)));
      if (rendered.range && want && (rendered.range.low !== want.low || rendered.range.high !== want.high)) out.push(`range ${money(rendered.range.low)} to ${money(rendered.range.high)} on the page, ${money(want.low)} to ${money(want.high)} in its engine answer${lane.low == null ? " (factsBlock)" : ""}`);
      else if (rendered.range && !want) out.push(`page prints ${money(rendered.range.low)} to ${money(rendered.range.high)}, engine answer has no range`);
      else if (!rendered.range && want && product === "marketCheck") out.push(`page prints no range, engine answer has ${money(want.low)} to ${money(want.high)}`);
    }
    const yrs = /\d{4} to \d{4}/.exec(String(lane.rungLabel || ""));
    if (yrs && rendered.scope && !/\?/.test(rendered.scope) && !rendered.scope.includes(yrs[0])) out.push(`scope line "${rendered.scope.slice(0, 60)}" lacks "${yrs[0]}" from its engine label`);
    return out;
  }
  const PAGE_PRODUCTS = ["marketCheck", "buy", "sell"];
  const pagesFor = g => MODE === "pages" ? PAGE_PRODUCTS : (g.sharedCard ? PAGE_PRODUCTS : (g.sellEqualsMC ? ["marketCheck", "sell"] : ["marketCheck"]));
  // factsBlock lowest and highest for a pool with 8+ sales and no band (the thin tier): the cards' lowest and highest price (lib/live/search.js
  // factsBlockFrom reads exactly this), taken from obdiag's cards.
  const facts = {};
  for (const r of rows) {
    const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).marketCheck;
    if (!(!flag("engineonly") && (MODE === "pages" || needsPage(r.g))) || !lane || !lane.ok || lane.low != null || !(lane.count >= 8)) continue;
    const o = await ops(`/api/usageDashboard?view=ops&task=obdiag&detail=1&qs=${encodeURIComponent(r.g.q)}`);
    try { const c = JSON.parse(o.text).cars[0]; const pr = (c.cardDetail || []).map(x => x.price).filter(Number.isFinite); if (pr.length >= 8) facts[r.g.q] = { low: Math.min(...pr), high: Math.max(...pr) }; } catch (e) {}
  }
  // Interim engine result, to stderr, before any page is read: a page-step crash can no longer lose the engine reads.
  for (const r of rows) console.error(`engine row ${r.g.id} ${r.g.q}: ` + ["marketCheck", "buy", "sell", "tasks"].map(k => `${k} ${r.cells && r.cells[k] ? r.cells[k].cell : "-"}${r.cells && r.cells[k] && r.cells[k].diffs && r.cells[k].diffs.length ? " (" + r.cells[k].diffs[0].slice(0, 90) + ")" : ""}`).join(", "));
  const jobs = [];
  for (const r of rows) if (!flag("engineonly") && (MODE === "pages" || needsPage(r.g))) for (const pr of pagesFor(r.g)) jobs.push({ r, pr });
  const TOTAL_ROWS = GOLDEN.length + IDENT.length, pageRowsDone = new Set();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { r, pr } = jobs[next++];
      const tRead = Date.now();
      console.error(`progress mode ${MODE}: rows done ${pageRowsDone.size} of ${new Set(jobs.map(j => j.r.g.id)).size} with a page (${TOTAL_ALL} in the table), page read ${next} of ${jobs.length}, row ${r.g.id}, ${pr}, read started ${stamp()}`);
      const g = r.g, engineCell = r.cells[pr];
      let rd; try { rd = await readPage(pr, g.q, { openDrawer: !!g.sharedCard }); } catch (e) { rd = { path: "", text: "", err: String(e && e.message || e) }; }
      pageRowsDone.add(g.id);
      const secs = (Date.now() - tRead) / 1000;
      if (rd.err || !rd.text || secs > DEADLINE) { r.pages = r.pages || {}; r.pages[pr] = { cell: "RE-READ", diffs: [`re-read: the ${pr} page read ${rd.err ? "failed (" + rd.err.slice(0, 40) + ")" : !rd.text ? "returned no text" : "took " + secs.toFixed(0) + " s, over the " + DEADLINE + " s line"}, started ${new Date(tRead).toISOString().slice(11, 19)}Z`], shown: "re-read" }; continue; }
      r.pages = r.pages || {};
      if (!rd.path.startsWith("/" + ({ marketCheck: "market-check", buy: "buy", sell: "sell" })[pr])) { r.pages[pr] = { cell: "FAIL", diffs: [rd.path.startsWith("/sell") && pr !== "sell" ? "redirected to /sell: key rejected" : `ended on ${rd.path || "nothing"}`] }; continue; }
      const parsed = PARSERS[pr](rd.text);
      const tx = textDiffs(g, rd.text, pr, parsed);
      if (pr === "buy") { r.buyListings = parsed.listings; r.pages.buy = { cell: parsed.listings.length ? "PENDING" : "N/A", diffs: [], shown: parsed.listings.length ? `${parsed.listings.length} live car(s)` : "no live car", card: rd.card || null }; continue; }
      const lane = (byQ[g.q] && byQ[g.q].lanes || {})[pr];
      const dr = drift(pr, { ...parsed, text: rd.text }, lane, facts[g.q]);
      if (dr.length) r.pages[pr] = { cell: "DRIFT", diffs: dr.map(d => "RENDER DRIFT, " + d) };
      else r.pages[pr] = { cell: engineCell.cell, diffs: [] };
      if (tx.length && r.pages[pr].cell !== "DRIFT") r.pages[pr] = { cell: "FAIL", diffs: tx };
      r.pages[pr].count = parsed.count; r.pages[pr].card = rd.card || null; r.pages[pr].cardDemoNorm = rd.cardDemoNorm || null;
      r.pages[pr].shown = `${parsed.count == null ? "-" : parsed.count} ${parsed.range ? money(parsed.range.low) + "-" + money(parsed.range.high) : "no range"}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  // "sellEqualsMC" (Oct 16 2026, one engine): the count Sell prints for a car must be the count Market Check prints for the same words.
  for (const r of rows) {
    if (!r.g.sellEqualsMC || !r.pages || !r.pages.sell || !r.pages.marketCheck) continue;
    const mc = r.pages.marketCheck.count, sl = r.pages.sell.count;
    if (mc == null || sl == null || mc !== sl) { r.pages.sell.cell = "FAIL"; r.pages.sell.diffs = (r.pages.sell.diffs || []).concat([`Sell prints ${sl == null ? "no count" : sl} sales, Market Check prints ${mc == null ? "no count" : mc} for the same car: two answers for one car`]); }
  }
  // "sharedCard": the "What these sell for" card, pill slot removed, must be byte-identical on Market Check, Buy and Sell, and the partner demo's card must equal Market Check's. A product that does not render the shared card yet is PENDING, never a failure.
  for (const r of rows) {
    if (!r.g.sharedCard || !r.pages || !r.pages.marketCheck) continue;
    const ref = r.pages.marketCheck.card, lines = [];
    const firstDiff = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return `first difference at character ${i}: MC "${a.slice(Math.max(0, i - 20), i + 50)}" against "${b.slice(Math.max(0, i - 20), i + 50)}"`; };
    for (const pr of ["buy", "sell"]) {
      const c = r.pages[pr] && r.pages[pr].card;
      if (pr === "buy" && r.pages.buy && r.pages.buy.cell === "N/A") lines.push({ name: pr, cell: "N/A", diff: "no live car on Buy for this search, so there is no Market Check drawer to open" });
      else if (!ref) lines.push({ name: pr, cell: "FAIL", diff: "Market Check renders no shared card (.sfc-card)" });
      else if (!c) lines.push({ name: pr, cell: "PENDING", diff: "not yet adopted (no .sfc-card on the page)" });
      else lines.push(c === ref ? { name: pr, cell: "PASS", diff: null } : { name: pr, cell: "FAIL", diff: firstDiff(ref, c) });
    }
    let pc = null; try { pc = await partnerCard(r.g.q); } catch (e) { pc = { err: String(e && e.message || e).slice(0, 80) }; }
    if (pc && pc.err) lines.push({ name: "partner demo", cell: "FAIL", diff: "partner answer unreadable: " + pc.err });
    else if (!ref) lines.push({ name: "partner demo", cell: "FAIL", diff: "Market Check renders no shared card to compare with" });
    else { const dn = r.pages.marketCheck.cardDemoNorm; lines.push(pc.html === dn ? { name: "partner demo", cell: "PASS", diff: "identical to Market Check apart from the two designed differences (basis line, footer link)" } : { name: "partner demo", cell: "FAIL", diff: firstDiff(dn || "", pc.html || "") }); }
    cardOut.push({ id: r.g.id, q: r.g.q, lines });
  }
  // "equalsBare": the typed words must give the count of the bare car's page (the page then also prints the one "states a body" line).
  for (const r of rows) {
    if (!r.g.equalsBare || !r.pages || !r.pages.marketCheck) continue;
    let bare = null; try { bare = PARSERS.marketCheck((await readPage("marketCheck", r.g.equalsBare)).text).count; } catch (e) {}
    const typed = r.pages.marketCheck.count;
    if (bare == null || typed == null || bare !== typed) { r.pages.marketCheck.cell = "FAIL"; r.pages.marketCheck.diffs = (r.pages.marketCheck.diffs || []).concat([`the typed words show ${typed == null ? "no count" : typed} sales, the bare page "${r.g.equalsBare}" shows ${bare == null ? "no count" : bare}: two answers for one car`]); }
  }

  // BUY PAGE (Part 2b): each live car's line is compared with the engine's answer for THAT car (its own year, make and model, the title the
  // page shows), not with the typed car's answer. A difference is RENDER DRIFT with both figures.
  const titles = [...new Set(rows.flatMap(r => (r.buyListings || []).map(l => l.title)))];
  const listingLane = {};
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const o = await ops(`/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&formpairs=0&identitycounts=0&specs=${encodeURIComponent(chunk.join("|"))}`);
    let j = null; try { j = JSON.parse(o.text); } catch (e) {}
    for (const row of (j && j.rows) || []) listingLane[row.q] = row.lanes && row.lanes.buy;
  }
  for (const r of rows) {
    if (!r.buyListings || !r.buyListings.length) continue;
    const diffs = [];
    for (const l of r.buyListings) {
      const lane = listingLane[l.title];
      if (!lane || !lane.ok) { if (l.range) diffs.push(`RENDER DRIFT, "${l.title}": page prints ${money(l.range.low)} to ${money(l.range.high)}, its own engine answer has none`); continue; }
      const want = lane.low != null ? { low: lane.low, high: lane.high } : null;
      if (l.range && (!want || l.range.low !== want.low || l.range.high !== want.high)) diffs.push(`RENDER DRIFT, "${l.title}": page ${money(l.range.low)} to ${money(l.range.high)} (${l.label.slice(0, 40)}), engine answer for that car ${want ? money(want.low) + " to " + money(want.high) : "no range"} (${String(lane.rungLabel || "").slice(0, 40)})`);
    }
    r.pages.buy = { cell: diffs.length ? "DRIFT" : "PASS", diffs, shown: r.buyListings.map(l => l.range ? `${money(l.range.low)}-${money(l.range.high)}` : "no range").join(" / ") };
  }

  // TASKS EMAIL (Oct 14 2026, Lane C's preview): GET /api/tasks?emailpreview=1&q=<typed words>, key in x-ops-key only. Read only: no Task, no email,
  // no cache row, no setup model turn, zero OldCarsData. It returns the line a Task email would state for the typed words: the stored
  // spec_market_cache line when listingMarket would serve it, else a fresh engine read. Count and range come from that one line, are
  // judged against the golden answer like any engine lane, and are compared with the Tasks lane of the same run (a difference is RENDER DRIFT).
  if ((MODE === "pages" || flag("tasks") || !flag("quick"))) for (const r of rows) {
    const o = await ops(`/api/tasks?emailpreview=1&q=${encodeURIComponent(r.g.q)}`);
    let out = null; try { out = JSON.parse(o.text); } catch (e) {}
    r.pages = r.pages || {};
    if (!out || o.status !== 200) { r.pages.tasks = { cell: "NOREACH", diffs: [`email preview returned HTTP ${o.status}`], shown: "-" }; continue; }
    const src = out.email === "stored" ? (out.stored && (out.stored.market || out.stored)) : out.engine;
    const f = out.filters || {};
    if (!src) { r.pages.tasks = { cell: r.g.empty ? "PASS" : (r.g.status === "pending" ? "PENDING" : "FAIL"), diffs: r.g.empty ? [] : ["the Task email states nothing for these words"], shown: `no line; filters ${[f.make, f.model, f.trim, f.year_min].filter(Boolean).join(" ")}` }; continue; }
    const count = src.count != null ? Number(src.count) : null, low = src.low != null ? Number(src.low) : null, high = src.high != null ? Number(src.high) : null;
    const rung = src.rung || src.step || null, label = src.family || src.short || "";
    const asLane = { ok: count != null, fallbackRung: rung, rungLabel: label, count, low, high, reason: count == null ? "nothing on record" : null };
    // The Task email names the car by its family noun ("992s", "E46 M3s"), so the label words are not compared; rung, count and range are.
    const j = judge({ ...r.g, labelHas: [], setAside: null, noZeroOptions: false }, asLane);
    for (const d of textDiffs(r.g, o.text)) j.diffs.push(d);
    if (j.diffs.length && j.cell === "PASS") j.cell = "FAIL";
    const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).tasks;
    const dr = lane && lane.ok ? drift("tasks", { count, range: low != null ? { low, high } : null, scope: "" }, lane) : [];
    r.pages.tasks = { cell: dr.length ? "DRIFT" : j.cell, diffs: [...dr.map(d => "RENDER DRIFT, " + d), ...j.diffs.map(d => "Task email: " + d)], shown: `${count == null ? "-" : count} ${low != null ? money(low) + "-" + money(high) : "no range"} (${out.email}${rung ? ", " + rung : ""})` };
  }
  // COUNTRY (Oct 15 2026, e39 country rule): every pool row carries country and countryBasis (obdiag rows=1, considered.included). The pool is the
  // United States and Canada; a row whose country is missing, outside both, or only assumed from the venue is listed per car. Read only.
  if ((MODE === "pages" || flag("country") || !flag("quick"))) for (const r of rows) {
    const o = await ops(`/api/usageDashboard?view=ops&task=obdiag&detail=1&rows=1&qs=${encodeURIComponent(r.g.q)}`);
    let inc = null; try { inc = JSON.parse(o.text).cars[0].considered.included; } catch (e) {}
    if (!inc) { r.country = { n: null, note: "no rows read" }; continue; }
    const bases = {}, odd = [];
    for (const x of inc) {
      bases[x.countryBasis || "none"] = (bases[x.countryBasis || "none"] || 0) + 1;
      const cc = String(x.country || "").toUpperCase();
      if (!cc || cc === "XX" || !/^(US|CA)$/.test(cc) || /^(unknown|none)$/i.test(x.countryBasis || "")) odd.push(`${x.date} ${x.source} ${String(x.title).slice(0, 40)} (${cc || "none"}, ${x.countryBasis || "none"})`);
    }
    r.country = { n: inc.length, bases, odd };
  }
  // IDENTITY ROW (bare 1965 Ford Mustang): (a) each option count the page prints equals the count the page shows when that option is typed;
  // (b) the option counts add up to the Any count on the bare page. A difference is a FAIL with both numbers.
  // The chip as a visitor uses it: open the bare page, click the option, read the count the page then shows (the same car typed in words must give the same count).
  const chipCount = async (q, label) => {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    try {
      if (CREW) await page.setCookie({ name: "gas_crew", value: CREW, domain: new URL(BASE).hostname, path: "/" });
      await page.setRequestInterception(true);
      const host = new URL(BASE).host;
      page.on("request", rq => { let own = false; try { own = new URL(rq.url()).host === host; } catch (e) {} rq.continue(own ? { headers: { ...rq.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
      await page.goto(pageUrl.marketCheck(q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      const wait = async () => { let t = ""; const until = Date.now() + 50000; while (Date.now() < until) { t = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => ""); if (/\d+ sales?\b/.test(t) && /MARKET CHECK/.test(t)) break; await new Promise(x => setTimeout(x, 1000)); } return t; };
      await wait();
      const hit = await page.evaluate(lbl => { const e = [...document.querySelectorAll("a,button,[role=button]")].find(x => (x.innerText || "").trim().toLowerCase().startsWith(lbl.toLowerCase())); if (!e) return false; e.click(); return true; }, label).catch(e => /detached|context was destroyed|navigat/i.test(String(e && e.message || e)));   // a click that navigates the page ends the evaluate; that is a hit, not a failure
      if (!hit) return null;
      await new Promise(x => setTimeout(x, 4000));
      return PARSERS.marketCheck(await wait()).count;
    } finally { await ctx.close().catch(() => {}); }
  };
  for (const g of IDENT) {
    const facts = async (q) => {
      const rd = await readPage("marketCheck", q);
      const p = PARSERS.marketCheck(rd.text);
      const wm = /Which [^?\n]+\?\s*([^\n]+)/.exec(rd.text);
      const options = wm ? [...wm[1].matchAll(/([A-Za-z][A-Za-z \/-]*?)\s*\((\d+)\)/g)].map(x => ({ label: x[1].trim(), n: Number(x[2]) })) : [];
      return { count: p.count, options, scope: p.scope };
    };
    const any = await facts(g.q);
    const checks = [];
    for (const op of any.options) {
      // e53: the last option "Body not stated" has no typed form (the chip sends refine body "unspecified"); its count is checked in the sum to Any only.
      if (/^body not stated$/i.test(op.label)) { checks.push({ name: `option ${op.label}`, cell: "PASS", diffs: [], shown: `${op.n} (counted in the sum, opens by chip only)` }); continue; }
      const pg = await facts(`${g.q} ${op.label.toLowerCase()}`);
      const ok = pg.count === op.n;
      const ch = await chipCount(g.q, op.label);
      const same = ch != null && pg.count != null && ch === pg.count;
      checks.push({ name: `${op.label}: chip equals typed words`, cell: same ? "PASS" : "FAIL", diffs: same ? [] : [`two answers for one car: clicking ${op.label} shows ${ch == null ? "no chip found" : ch} sales, typing "${g.q} ${op.label.toLowerCase()}" shows ${pg.count == null ? "no count" : pg.count}`], shown: `chip ${ch == null ? "-" : ch} vs typed ${pg.count == null ? "-" : pg.count}` });
      checks.push({ name: `option ${op.label}`, cell: ok ? "PASS" : "FAIL", diffs: ok ? [] : [`the question prints ${op.label} (${op.n}); the page it opens shows ${pg.count == null ? "no count" : pg.count} sales`], shown: `${op.n} vs ${pg.count == null ? "-" : pg.count}` });
    }
    for (const op of any.options.filter(o => o.n === 0)) checks.push({ name: `option ${op.label}`, cell: "FAIL", diffs: [`rule 1: an option with zero sales is never shown, the question prints ${op.label} (0)`], shown: "0" });
    const sum = any.options.reduce((a, b) => a + b.n, 0);
    const okSum = any.options.length > 0 && any.count != null && sum === any.count;
    checks.push({ name: "options add up to Any", cell: okSum ? "PASS" : "FAIL", diffs: okSum ? [] : [any.options.length ? `${any.options.map(x => x.n).join(" + ")} = ${sum}, the bare page shows ${any.count == null ? "no count" : any.count} (Any)` : "the bare page prints no identity question"], shown: `${any.options.map(x => x.n).join("+") || "-"} vs ${any.count == null ? "-" : any.count}` });
    identityOut.push({ id: g.id, q: g.q, any, checks });
  }
  // CHIP PAIRS (Oct 16 2026): a question's chip, clicked on the bare page, and the same answer typed in words must show one count (row 5, the Cobra 289 or 427).
  for (const r of rows) for (const cp of r.g.chipPairs || []) {
    let ch = null; try { ch = await chipCount(cp.bare, cp.label); } catch (e) { console.error(`progress: chip read for row ${r.g.id} (${cp.label}) failed: ${String(e && e.message || e).slice(0, 80)}`); }
    let ty = null; try { ty = PARSERS.marketCheck((await readPage("marketCheck", cp.typed)).text).count; } catch (e) {}
    const same = ch != null && ty != null && ch === ty;
    chipPairOut.push({ id: r.g.id, name: `${cp.label}: chip equals typed words`, cell: same ? "PASS" : "FAIL", shown: `chip ${ch == null ? "no chip found" : ch} vs typed ${ty == null ? "no count" : ty}`, diff: same ? null : `two answers for one car: clicking ${cp.label} on "${cp.bare}" shows ${ch == null ? "no chip found" : ch}, typing "${cp.typed}" shows ${ty == null ? "no count" : ty}` });
  }
  // CHASSIS-NUMBER GUARD (Oct 14 2026): a keyword is never read inside a chassis or lot number. The 1969 365 GT 2+2 whose chassis number is 12751
  // holds "275"; the engine's row fence must set it aside for a 275 GTB, not pool it. One read-only poolrows call, run with every full table.
  if (!flag("quick") && !ids.length) {
    const o = await ops(`/api/usageDashboard?view=ops&task=poolrows&make=Ferrari&title=12751&limit=5&fence=1&q=${encodeURIComponent("1966 Ferrari 275 GTB")}`);
    try { const rr = (JSON.parse(o.text).rows || []).filter(x => /12751/.test(x.listing_title || "")); chassisGuard = rr.length ? (rr.every(x => x.engineVerdict) ? "PASS" : "FAIL") : "N/A"; } catch (e) { chassisGuard = "NOREACH"; }
  }
} finally { await browser.close(); }

// ---- the table ----
const pad = (s, n) => String(s).padEnd(n);
const PAGEHEAD = ["MC page", "Buy page", "Sell page", "Task email"];
console.log(`\nGOLDEN TRUTH  ${new Date().toISOString().slice(0, 10)}  (${BASE})  ${rows.length} cars, expected answers from docs/golden-rules.md\n`);
console.log(pad("#", 3) + pad("Car", 44) + pad("MC", 9) + pad("Buy", 9) + pad("Sell", 9) + pad("Tasks", 9) + PAGEHEAD.map(h => pad(h, 11)).join(""));
let nFail = 0, nPend = 0, nPass = 0, nDrift = 0, nRe = 0;
const rereads = [];
for (const r of rows) {
  const eng = PRODUCTS.map(p => r.cells[p].cell);
  const pg = ["marketCheck", "buy", "sell", "tasks"].map(p => r.pages && r.pages[p] ? (r.pages[p].cell === "NOREACH" ? "NOT REACHED" : r.pages[p].cell) : "-");
  console.log(pad(r.g.id, 3) + pad(r.g.q, 44) + eng.map(c => pad(c, 9)).join("") + pad(pg[0], 11) + pad(pg[1], 11) + pad(pg[2], 11) + pad(pg[3], 11));
  for (const c of [...PRODUCTS.map(p => r.cells[p]), ...Object.values(r.pages || {})]) { if (c.cell === "RE-READ") { nRe++; rereads.push(`${r.g.id} ${r.g.q}: ${(c.diffs || [])[0] || ""}`); } else if (c.cell === "FAIL" || c.cell === "NOREACH") nFail++; else if (c.cell === "DRIFT") nDrift++; else if (c.cell === "PENDING") nPend++; else if (c.cell === "PASS") nPass++; }
}
console.log("\nDifferences (same text on several products is shown once; page lines name the page):");
for (const r of rows) {
  const seen = new Map();
  const add = (d, who) => { if (!seen.has(d)) seen.set(d, []); seen.get(d).push(who); };
  for (const p of PRODUCTS) for (const d of r.cells[p].diffs) add(d, p);
  for (const [p, c] of Object.entries(r.pages || {})) for (const d of c.diffs) add(d, p + " page");
  if (!seen.size) continue;
  console.log(`  ${r.g.id}. ${r.g.q}${r.g.status === "pending" ? "  [PENDING: " + r.g.pending + "]" : ""}`);
  for (const [d, ps] of seen) console.log(`      ${ps.length === 4 && !ps.some(x => /page/.test(x)) ? "all four" : ps.join(", ")}: ${d}`);
}
if (rows.some(r => r.pages)) {
  console.log("\nRendered, per page (count, range as the page prints them):");
  for (const r of rows) console.log(`  ${r.g.id}. ${pad(r.g.q, 42)}` + ["marketCheck", "buy", "sell", "tasks"].map(p => `${p}: ${r.pages && r.pages[p] ? r.pages[p].shown : "-"}`).join("   |   "));
  console.log("\nSell page count against the engine count (they must be equal):");
  for (const r of rows) { const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).sell; const sp = r.pages && r.pages.sell; const m = sp && /^(\d+|-)/.exec(sp.shown || ""); console.log(`  ${r.g.id}. ${pad(r.g.q, 42)} page ${m ? m[1] : "-"}   engine ${lane && lane.ok ? lane.count : "-"}`); }
}
// obdiag's included list is the engine's raw pool for the typed words (before a body or variant narrowing); when it is wider than the answer's count
// the line says so, so a country read over more rows than the answer is never taken for the answer's own pool.
const wide = r => { const ml = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).marketCheck; return ml && ml.ok && ml.count != null && r.country.n !== ml.count ? ` (WIDER than the answer: ${ml.count} sales)` : ""; };
if (rows.some(r => r.country)) {
  console.log("\nCountry on the pool rows (US and Canada only; basis shows where the country came from; unknown or outside rows are listed):");
  for (const r of rows) if (r.country) console.log(`  ${r.g.id}. ${pad(r.g.q, 42)} ${r.country.n == null ? r.country.note : r.country.n + " rows" + wide(r) + "  " + Object.entries(r.country.bases).map(([k, v]) => k + " " + v).join(", ") + (r.country.odd.length ? "  UNKNOWN OR OUTSIDE: " + r.country.odd.join("; ") : "")}`);
}
for (const io of identityOut) {
  console.log(`\nIdentity row ${io.id}, ${io.q}: the bare page shows ${io.any.count == null ? "no count" : io.any.count} sales (Any), options ${io.any.options.map(x => x.label + " (" + x.n + ")").join(", ") || "none"}`);
  for (const c of io.checks) { console.log(`  ${pad(c.cell, 6)} ${pad(c.name, 26)} ${c.shown}`); for (const d of c.diffs) console.log(`         ${d}`); if (c.cell === "FAIL") nFail++; else if (c.cell === "PASS") nPass++; }
}
for (const c of cardOut) { console.log(`\nShared card, row ${c.id}, ${c.q}:`); for (const l of c.lines) { console.log(`  ${pad(l.cell, 8)} ${pad(l.name, 14)} ${l.diff || "identical to Market Check"}`); if (l.cell === "FAIL") nFail++; else if (l.cell === "PENDING") nPend++; else if (l.cell !== "N/A") nPass++; } }
for (const c of chipPairOut) { console.log(`\nRow ${c.id}, ${c.name}: ${c.shown}`); if (c.diff) console.log(`  ${c.diff}`); if (c.cell === "FAIL") nFail++; else nPass++; }
if (chassisGuard) console.log(`\nChassis-number guard (365 GT 2+2, chassis 12751, set aside from the 275 GTB pool): ${chassisGuard}`);
if (rereads.length) { console.log("\nRE-READ (a read errored or ran over the " + DEADLINE + " s line; not a mismatch; rerun these rows alone with --ids):"); for (const x of rereads) console.log("  " + x); }
console.log(`\nmode ${MODE}, ${TOTAL_ALL} rows. ${nPass} PASS, ${nFail} FAIL, ${nDrift} RENDER DRIFT, ${nPend} PENDING, ${nRe} RE-READ (report-only; ${flag("strict") ? "strict: failures set the exit code" : "does not set the exit code"}).`);
process.exit(flag("strict") && (nFail || nDrift) ? 1 : 0);
