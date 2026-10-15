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
import { crewCookie } from "./_crewCookie.mjs";

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
// An identity row (the bare 1965 Mustang) checks the question's option counts, not a range; it has its own block below.
const IDENT = GOLDEN.filter(g => g.identity);
GOLDEN = GOLDEN.filter(g => !g.identity);

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

const CREW = flag("pages") ? await crewCookie() : null;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
const rows = [];
const byQ = {};
let chassisGuard = null;
let identityOut = null;   // the identity row: { q, checks: [{ name, cell, diffs, shown }] }
try {
  // The ops task is a keyed GET; plain curl is turned away by Vercel's bot protection, so the request is made from a real page
  // on the site's own address. The key travels only in the x-ops-key header.
  let home = await browser.newPage();
  const openHome = async () => { home = await browser.newPage(); await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 2000)); };
  await home.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const ops1 = (url) => home.evaluate(async (u, k) => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 290000);
    try { const r = await fetch(u, { headers: { "x-ops-key": k }, signal: ac.signal }); const text = await r.text(); return { status: r.status, text }; }
    catch (e) { return { status: 0, text: String(e && e.message || e) }; } finally { clearTimeout(t); }
  }, url, KEY);
  // The page can navigate itself (a detached frame); open a fresh one and ask again, once.
  const ops = async (url) => { try { return await ops1(url); } catch (e) { await openHome(); return await ops1(url); } };

  
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
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = w => { const t = String(w || "").toLowerCase().replace(/,/g, ""); return /^\d+$/.test(t) ? Number(t) : (WORDS[t] || null); };
  const parseRange = t => { const m = /\$([\d,]+)\s+to\s+\$([\d,]+)/.exec(t); return m ? { low: Number(m[1].replace(/,/g, "")), high: Number(m[2].replace(/,/g, "")) } : null; };
  const PARSERS = {
    marketCheck(text) {
      const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
      const i = lines.findIndex(x => /^MARKET CHECK$/.test(x));
      const scope = i >= 0 ? (lines[i + 2] || "") : "";
      const cm = /(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+sales?\b/i.exec(scope);
      const k = lines.findIndex(x => /^WHERE (THE MIDDLE HALF|THEY) SOLD/.test(x));
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
  async function readPage(product, q) {
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
      return { path: new URL(page.url()).pathname, text };
    } finally { await ctx.close().catch(() => {}); }
  }
  // Compare one rendered page with the same product's engine lane. Returns drift strings.
  function drift(product, rendered, lane, facts) {
    const out = [];
    if (!lane || !lane.ok) return out;
    if (rendered.count != null && lane.count != null && rendered.count !== lane.count) out.push(`count ${rendered.count} on the page, ${lane.count} in its engine answer`);
    // The Market Check page of a pool with no band prints the engine's factsBlock lowest and highest (all-in, the real sales), not the thin span (hammer).
    const want = lane.low != null ? { low: lane.low, high: lane.high } : (product === "marketCheck" && facts ? facts : (product === "marketCheck" ? null : (Array.isArray(lane.span) ? { low: lane.span[0], high: lane.span[1] } : null)));
    if (rendered.range && want && (rendered.range.low !== want.low || rendered.range.high !== want.high)) out.push(`range ${money(rendered.range.low)} to ${money(rendered.range.high)} on the page, ${money(want.low)} to ${money(want.high)} in its engine answer${lane.low == null ? " (factsBlock)" : ""}`);
    else if (rendered.range && !want) out.push(`page prints ${money(rendered.range.low)} to ${money(rendered.range.high)}, engine answer has no range`);
    else if (!rendered.range && want && product === "marketCheck") out.push(`page prints no range, engine answer has ${money(want.low)} to ${money(want.high)}`);
    const yrs = /\d{4} to \d{4}/.exec(String(lane.rungLabel || ""));
    if (yrs && rendered.scope && !rendered.scope.includes(yrs[0])) out.push(`scope line "${rendered.scope.slice(0, 60)}" lacks "${yrs[0]}" from its engine label`);
    return out;
  }
  const PAGE_PRODUCTS = flag("pages") ? ["marketCheck", "buy", "sell"] : ["marketCheck"];
  // factsBlock lowest and highest for a pool with 8+ sales and no band (the thin tier): the cards' lowest and highest price (lib/live/search.js
  // factsBlockFrom reads exactly this), taken from obdiag's cards.
  const facts = {};
  for (const r of rows) {
    const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).marketCheck;
    if (!(flag("pages") || r.g.page) || !lane || !lane.ok || lane.low != null || !(lane.count >= 8)) continue;
    const o = await ops(`/api/usageDashboard?view=ops&task=obdiag&detail=1&qs=${encodeURIComponent(r.g.q)}`);
    try { const c = JSON.parse(o.text).cars[0]; const pr = (c.cardDetail || []).map(x => x.price).filter(Number.isFinite); if (pr.length >= 8) facts[r.g.q] = { low: Math.min(...pr), high: Math.max(...pr) }; } catch (e) {}
  }
  const jobs = [];
  for (const r of rows) if (flag("pages") || r.g.page) for (const pr of PAGE_PRODUCTS) jobs.push({ r, pr });
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { r, pr } = jobs[next++];
      const g = r.g, engineCell = r.cells[pr];
      let rd; try { rd = await readPage(pr, g.q); } catch (e) { rd = { path: "", text: "", err: String(e && e.message || e) }; }
      r.pages = r.pages || {};
      if (!rd.path.startsWith("/" + ({ marketCheck: "market-check", buy: "buy", sell: "sell" })[pr])) { r.pages[pr] = { cell: "FAIL", diffs: [rd.path.startsWith("/sell") && pr !== "sell" ? "redirected to /sell: key rejected" : `ended on ${rd.path || "nothing"}`] }; continue; }
      const parsed = PARSERS[pr](rd.text);
      if (pr === "buy") { r.buyListings = parsed.listings; r.pages.buy = { cell: parsed.listings.length ? "PENDING" : "N/A", diffs: [], shown: parsed.listings.length ? `${parsed.listings.length} live car(s)` : "no live car" }; continue; }
      const lane = (byQ[g.q] && byQ[g.q].lanes || {})[pr];
      const dr = drift(pr, parsed, lane, facts[g.q]);
      if (dr.length) r.pages[pr] = { cell: "DRIFT", diffs: dr.map(d => "RENDER DRIFT, " + d) };
      else r.pages[pr] = { cell: engineCell.cell, diffs: [] };
      r.pages[pr].shown = `${parsed.count == null ? "-" : parsed.count} ${parsed.range ? money(parsed.range.low) + "-" + money(parsed.range.high) : "no range"}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));

  // BUY PAGE (Part 2b): each live car's line is compared with the engine's answer for THAT car (its own year, make and model, the title the
  // page shows), not with the typed car's answer. A difference is RENDER DRIFT with both figures.
  const titles = [...new Set(rows.flatMap(r => (r.buyListings || []).map(l => l.title)))];
  const listingLane = {};
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const o = await ops(`/api/usageDashboard?view=ops&task=enginecheck&buypaths=0&livefences=0&representative=0&splitpools=0&overtime=0&livelisting=0&cacheconsistency=0&specs=${encodeURIComponent(chunk.join("|"))}`);
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
  if (flag("pages") || flag("tasks")) for (const r of rows) {
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
    const j = judge({ ...r.g, labelHas: [] }, asLane);
    const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).tasks;
    const dr = lane && lane.ok ? drift("tasks", { count, range: low != null ? { low, high } : null, scope: "" }, lane) : [];
    r.pages.tasks = { cell: dr.length ? "DRIFT" : j.cell, diffs: [...dr.map(d => "RENDER DRIFT, " + d), ...j.diffs.map(d => "Task email: " + d)], shown: `${count == null ? "-" : count} ${low != null ? money(low) + "-" + money(high) : "no range"} (${out.email}${rung ? ", " + rung : ""})` };
  }
  // COUNTRY (Oct 15 2026, e39 country rule): every pool row carries country and countryBasis (obdiag rows=1, considered.included). The pool is the
  // United States and Canada; a row whose country is missing, outside both, or only assumed from the venue is listed per car. Read only.
  if (flag("pages") || flag("country")) for (const r of rows) {
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
      const pg = await facts(`${g.q} ${op.label.toLowerCase()}`);
      const ok = pg.count === op.n;
      checks.push({ name: `option ${op.label}`, cell: ok ? "PASS" : "FAIL", diffs: ok ? [] : [`the question prints ${op.label} (${op.n}); the page it opens shows ${pg.count == null ? "no count" : pg.count} sales`], shown: `${op.n} vs ${pg.count == null ? "-" : pg.count}` });
    }
    const sum = any.options.reduce((a, b) => a + b.n, 0);
    const okSum = any.options.length > 0 && any.count != null && sum === any.count;
    checks.push({ name: "options add up to Any", cell: okSum ? "PASS" : "FAIL", diffs: okSum ? [] : [any.options.length ? `${any.options.map(x => x.n).join(" + ")} = ${sum}, the bare page shows ${any.count == null ? "no count" : any.count} (Any)` : "the bare page prints no identity question"], shown: `${any.options.map(x => x.n).join("+") || "-"} vs ${any.count == null ? "-" : any.count}` });
    identityOut = { q: g.q, any, checks };
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
let nFail = 0, nPend = 0, nPass = 0, nDrift = 0;
for (const r of rows) {
  const eng = PRODUCTS.map(p => r.cells[p].cell);
  const pg = ["marketCheck", "buy", "sell", "tasks"].map(p => r.pages && r.pages[p] ? (r.pages[p].cell === "NOREACH" ? "NOT REACHED" : r.pages[p].cell) : "-");
  console.log(pad(r.g.id, 3) + pad(r.g.q, 44) + eng.map(c => pad(c, 9)).join("") + pad(pg[0], 11) + pad(pg[1], 11) + pad(pg[2], 11) + pad(pg[3], 11));
  for (const c of [...PRODUCTS.map(p => r.cells[p]), ...Object.values(r.pages || {})]) { if (c.cell === "FAIL" || c.cell === "NOREACH") nFail++; else if (c.cell === "DRIFT") nDrift++; else if (c.cell === "PENDING") nPend++; else if (c.cell === "PASS") nPass++; }
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
if (flag("pages")) {
  console.log("\nRendered, per page (count, range as the page prints them):");
  for (const r of rows) console.log(`  ${r.g.id}. ${pad(r.g.q, 42)}` + ["marketCheck", "buy", "sell", "tasks"].map(p => `${p}: ${r.pages && r.pages[p] ? r.pages[p].shown : "-"}`).join("   |   "));
  console.log("\nSell page count against the engine count (they must be equal):");
  for (const r of rows) { const lane = (byQ[r.g.q] && byQ[r.g.q].lanes || {}).sell; const sp = r.pages && r.pages.sell; const m = sp && /^(\d+|-)/.exec(sp.shown || ""); console.log(`  ${r.g.id}. ${pad(r.g.q, 42)} page ${m ? m[1] : "-"}   engine ${lane && lane.ok ? lane.count : "-"}`); }
}
if (rows.some(r => r.country)) {
  console.log("\nCountry on the pool rows (US and Canada only; basis shows where the country came from; unknown or outside rows are listed):");
  for (const r of rows) if (r.country) console.log(`  ${r.g.id}. ${pad(r.g.q, 42)} ${r.country.n == null ? r.country.note : r.country.n + " rows  " + Object.entries(r.country.bases).map(([k, v]) => k + " " + v).join(", ") + (r.country.odd.length ? "  UNKNOWN OR OUTSIDE: " + r.country.odd.join("; ") : "")}`);
}
if (identityOut) {
  console.log(`\nIdentity row 21, ${identityOut.q}: the bare page shows ${identityOut.any.count == null ? "no count" : identityOut.any.count} sales (Any), options ${identityOut.any.options.map(x => x.label + " (" + x.n + ")").join(", ") || "none"}`);
  for (const c of identityOut.checks) { console.log(`  ${pad(c.cell, 6)} ${pad(c.name, 26)} ${c.shown}`); for (const d of c.diffs) console.log(`         ${d}`); if (c.cell === "FAIL") nFail++; else if (c.cell === "PASS") nPass++; }
}
if (chassisGuard) console.log(`\nChassis-number guard (365 GT 2+2, chassis 12751, set aside from the 275 GTB pool): ${chassisGuard}`);
console.log(`\n${nPass} PASS, ${nFail} FAIL, ${nDrift} RENDER DRIFT, ${nPend} PENDING (report-only; ${flag("strict") ? "strict: failures set the exit code" : "does not set the exit code"}).`);
process.exit(flag("strict") && (nFail || nDrift) ? 1 : 0);
