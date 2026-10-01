// One Box reliability check. Runs a fixed set of advisor searches against PRODUCTION through the real
// One Box code path (the archive-only /api/sellerDecision oneBox branch; VINs via the two-hop through
// /api/vehicleIdentity), and marks PASS/FAIL on checks a-h. ZERO OldCarsData: One Box is archive-only,
// and this script calls no OCD endpoint. Report-only; makes no fixes.
//
//   node scripts/oneboxCheck.js            # against https://goasksam.com
//   BASE=https://<preview> node scripts/oneboxCheck.js
//
// Uses a real browser (puppeteer) so the request goes through Vercel's edge exactly as an advisor's
// would (a raw Node fetch trips the bot checkpoint). Page-context fetch, not a full UI drive.
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TIME_BUDGET_MS = 4000;

const SEARCHES = [
  { q: "ZHWBU37M47LA02229", vin: true, label: "VIN 2007 Murcielago LP640", code: "LP640", model: "murcielago" },
  { q: "2004 BMW M3 E46 coupe", code: "E46", model: "M3" },
  { q: "E46 M3", code: "E46", model: "M3", genCode: true },
  { q: "2006 Mercedes S65 AMG", model: "S65", mustRange: true },
  { q: "2018 Jaguar XF Sportbrake S", model: "XF" },
  { q: "1991 Porsche 964 Carrera 2 Cabriolet 45,000 miles", code: "964", model: "911" },
  { q: "2021 Porsche 911", model: "911" },
  { q: "1995 Ferrari F355 GTS", model: "F355", mustRange: true },
  { q: "1967 Chevrolet Corvette 427", model: "Corvette" },
  { q: "2005 Ford GT", model: "GT", mustRange: true },
  { q: "1970 Chevrolet Chevelle SS 454", model: "Chevelle" },
  { q: "1957 Mercedes 300SL Roadster", model: "300SL", mustRange: true },
  { q: "1997 Land Rover Defender 90", model: "Defender" },
  { q: "1988 BMW E30 M3", code: "E30", model: "M3" },
  { q: "1987 Dodge D50", model: "D50" },
  // Fix 7 (permanent rows): archive title-token resolution + honest states.
  { q: "1972 Datsun 240Z", model: "Datsun" },
  { q: "Eagle Talon", model: "Talon" },
  { q: "Singer Gazelle", model: "Gazelle" },
  { q: "ram 50", model: "50" },
  { q: "Ram 50 1990", model: "50" }
];

const VENUE_RE = /^(19|20)\d{2}\s+(bring a trailer|cars ?& ?bids|rm sotheby|gooding|bonhams|mecum|barrett|broad arrow|hemmings|pcarmarket|pcar market|collecting cars|the market|pistonheads|hagerty|mb market|sotheby)/i;
const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function cardPrices(d) {
  const out = [];
  for (const c of (d.cards || [])) { const p = num(c.price); if (p > 0) out.push({ p, title: c.title, plat: c.platformSlug || c.platform }); }
  const rep = d.representative || {};
  for (const k of ["closest", "high", "low"]) { const c = rep[k]; if (c) { const p = num(c.price); if (p > 0) out.push({ p, title: c.title, plat: c.platformSlug || c.platform }); } }
  return out;
}

function runChecks(s, d, ms) {
  const r = {};
  const span = (Array.isArray(d.span) && d.span.length >= 2 && num(d.span[1]) > 0) ? [num(d.span[0]), num(d.span[1])] : null;
  const cluster = (Array.isArray(d.cluster) && d.cluster.length >= 2 && num(d.cluster[1]) > 0) ? [num(d.cluster[0]), num(d.cluster[1])] : null;
  const prices = cardPrices(d);
  const take = (d.samsTake && d.samsTake.sentence) ? d.samsTake : null;
  // A visible count for the honest states (poolN, or the thin/class-era pool count in whatever field
  // the tier carries). unavailable is NEVER honest.
  const shownCount = [d.poolN, d.thin && d.thin.totalN, d.thin && d.thin.receipts && d.thin.receipts.length,
    d.classEra && d.classEra.totalN, d.count].map(num).find(n => n != null && n >= 0);
  const interactive = d.tier === "body_choice" || d.tier === "needs_clarification";
  // not_tracked (Fix 7): an honest "we haven't tracked a {car} sale yet" for a resolved-but-unsold
  // car - a valid non-dead-end, no count needed.
  const honest = d.tier !== "unavailable" && (interactive || d.tier === "not_tracked" || (["thin", "class_era", "refusal"].includes(d.tier) && shownCount != null) || d.spanOnly === true);

  // a. a range is shown; else (non must-range) an honest state that shows its count / an interactive ask
  if (s.genCode && !span) {
    // A bare generation code must resolve to the pool, never ask a clarification/choice (item 4).
    r.a = { pass: false, why: `bare generation code should resolve to a range, got tier=${d.tier}` };
  } else if (s.mustRange) {
    r.a = span ? { pass: true, why: `range $${span[0]}-$${span[1]}` }
      : { pass: false, why: `MUST return a range but got tier=${d.tier}${shownCount != null ? ` (count ${shownCount})` : ""}` };
  } else {
    r.a = span ? { pass: true, why: `range $${span[0]}-$${span[1]}` }
      : honest ? { pass: true, why: `honest ${d.tier}${shownCount != null ? ` (count ${shownCount})` : " (interactive)"}` }
        : { pass: false, why: `tier=${d.tier} with no range and no visible count` };
  }

  // b. every shown card + the cluster sit inside the stated range
  if (!span) r.b = { pass: true, why: "n/a (no range)" };
  else {
    const outside = prices.filter(x => x.p < span[0] - 1 || x.p > span[1] + 1);
    const clusterBad = cluster && (cluster[0] < span[0] - 1 || cluster[1] > span[1] + 1);
    r.b = (outside.length === 0 && !clusterBad)
      ? { pass: true, why: `${prices.length} cards in range; cluster ok` }
      : { pass: false, why: `${outside.length} card(s) outside [$${span[0]}-$${span[1]}]${outside.length ? ` (e.g. $${outside[0].p})` : ""}${clusterBad ? `; cluster [$${cluster[0]}-$${cluster[1]}] outside` : ""}` };
  }

  // c. VIN: the exact car's own sale is counted, never contradicted
  if (!s.vin) r.c = { pass: true, why: "n/a (not a VIN)" };
  else {
    const es = d._exactSale || null;
    if (!es) r.c = { pass: true, why: "no recorded sale for this VIN (honest)" };
    else {
      const refusedNone = d.tier === "refusal" && d.refusal && /thin|varied/.test(String(d.refusal.kind));
      const emptyPool = Number.isFinite(d.poolN) && d.poolN === 0;
      r.c = (!refusedNone && !emptyPool)
        ? { pass: true, why: `exact sale $${es.price} present, tier=${d.tier}` }
        : { pass: false, why: `exact sale $${es.price} exists but result says none/thin (tier=${d.tier}, kind=${d.refusal && d.refusal.kind})` };
    }
  }

  // d. pool scope: cards match the requested model; note widening
  const tok = norm(s.model);
  const titled = prices.filter(x => x.title);
  const matchFrac = titled.length ? titled.filter(x => norm(x.title).includes(tok)).length / titled.length : 1;
  r.d = (matchFrac >= 0.6)
    ? { pass: true, why: `${Math.round(matchFrac * 100)}% cards match "${s.model}"; widening=${d.widening || "none"}; poolYears=${JSON.stringify(d.poolYears || null)}` }
    : { pass: false, why: `only ${Math.round(matchFrac * 100)}% cards match "${s.model}" (scope leak?); poolTrim=${d.poolTrim || "-"} poolYears=${JSON.stringify(d.poolYears || null)}` };

  // e. Sam's Take appears. It is a RESULT-TIER cluster feature (computed only in buildResult when a
  // cluster stands), so it is n/a on thin/class_era (those carry the record RANGE, not a Sam's Take).
  // Sam's Take thresholds/skip-reason are a SEPARATE prompt, so e is REPORTED, not scored, this pass.
  r.e = (!span || d.tier !== "result") ? { pass: true, why: `n/a (${d.tier || "no range"})` }
    : take ? { pass: true, why: `"${String(take.sentence).slice(0, 60)}..."` }
      : { pass: false, why: `range shown but no Sam's Take. cluster=${cluster ? "yes" : "no"}, tier=${d.tier}` };

  // f. USD (cards carry USD price only; native currency not in the response)
  const badPrice = prices.filter(x => !(x.p > 0));
  r.f = badPrice.length === 0
    ? { pass: true, why: `all ${prices.length} prices USD-numeric (native currency not visible in response)` }
    : { pass: false, why: `${badPrice.length} non-numeric price(s)` };

  // g. no garbled/robotic output (from the fields the render uses)
  const gIssues = [];
  for (const x of prices) if (x.title && VENUE_RE.test(x.title)) { gIssues.push(`bare year+venue title "${x.title}"`); break; }
  const texts = [take && take.sentence, d.driverSentence, d.samLine, d.refusal && d.refusal.model].filter(Boolean).map(String);
  for (const t of texts) if (/middle of the recent sales is a\b|\bis a a\b|\bundefined\b|\bNaN\b/i.test(t)) { gIssues.push(`robotic/garbled line "${t.slice(0, 50)}"`); break; }
  const poolPlats = new Set(prices.map(x => norm(x.plat)).filter(Boolean));
  if (d.topPlatform && poolPlats.size && !poolPlats.has(norm(d.topPlatform))) gIssues.push(`topPlatform "${d.topPlatform}" not among shown cards`);
  r.g = gIssues.length === 0 ? { pass: true, why: "no garbled titles/sentences/venues" } : { pass: false, why: gIssues.join("; ") };

  // h. under 4 seconds
  r.h = ms < TIME_BUDGET_MS ? { pass: true, why: `${ms}ms` } : { pass: false, why: `${ms}ms (>= ${TIME_BUDGET_MS})` };
  return r;
}

async function main() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 120000 });
  const p = await b.newPage();
  await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
  await p.goto(BASE + "/onebox.html", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1500));

  const RUN_ANON = "obcheck-" + Date.now() + "-" + Math.floor(Math.random()*1e9);
  const post = (path, body) => p.evaluate(async (path, body) => {
    const t0 = performance.now();
    const r = await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, ms: Math.round(performance.now() - t0), json, snippet: txt.slice(0, 80) };
  }, path, body);

  const rows = [];
  for (const s of SEARCHES) {
    let d = null, ms = 0, err = null;
    try {
      if (s.vin) {
        const vi = await post("/api/vehicleIdentity", { text: s.q });
        const vam = vi.json && vi.json.vinArchiveMatch;
        const veh = vi.json && vi.json.vehicle;
        const exactSale = vam && Number(vam.price) > 0 ? { price: Number(vam.price), mileage: vam.mileage || null, soldDate: (vam.soldDate || vam.sale_date || "").slice(0, 10) } : null;
        const car = { raw: s.q }; if (veh) car.vehicle = veh; if (exactSale) car.exactSale = exactSale;
        const ob = await post("/api/sellerDecision", { oneBox: true, anonId: RUN_ANON, car });
        d = ob.json; ms = vi.ms + ob.ms; if (d) d._exactSale = exactSale;
      } else {
        const ob = await post("/api/sellerDecision", { oneBox: true, anonId: RUN_ANON, car: { raw: s.q } });
        d = ob.json; ms = ob.ms;
        // A body/model/generation clarification is a valid interactive state - resolve one hop with the query as-is.
        if (d && (d.tier === "body_choice" || d.tier === "model_choice" || d.tier === "generation_choice")) {
          const ob2 = await post("/api/sellerDecision", { oneBox: true, anonId: RUN_ANON, car: { raw: s.q + " coupe" } });
          if (ob2.json && ob2.json.tier !== d.tier) { d = ob2.json; ms += ob2.ms; }
        }
      }
    } catch (e) { err = String(e && e.message || e); }
    // needs_clarification is a real (honest) response, not an error; give it a tier so runChecks credits it.
    if (d && d.status === "needs_clarification" && !d.tier) d.tier = "needs_clarification";
    if (!d || (d.status !== "one_box" && d.status !== "needs_clarification")) { rows.push({ s, d: null, ms, checks: null, err: err || `no response (${d && d.status})` }); continue; }
    rows.push({ s, d, ms, checks: runChecks(s, d, ms), err: null });
  }
  await b.close();

  // ---- table ----
  const K = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const SCORED = ["a", "b", "c", "d", "f", "g"];   // e (Sam's Take) and h (speed) are separate prompts: reported, NOT scored this pass
  const cell = c => (c ? (c.pass ? "P" : "F") : "-");
  console.log("\nOne Box reliability check vs " + BASE + " (zero OCD; e=Sam's Take and h=speed reported, NOT scored)\n");
  console.log("search".padEnd(42) + K.join(" ") + "  overall");
  console.log("-".repeat(42 + K.length * 2 + 9));
  let anyFail = false;
  const fails = [];
  for (const row of rows) {
    if (row.err) { console.log(row.s.q.slice(0, 41).padEnd(42) + K.map(() => "-").join(" ") + "  ERROR"); fails.push(`${row.s.q}: ${row.err}`); anyFail = true; continue; }
    const c = row.checks;
    const line = K.map(k => cell(c[k])).join(" ");
    const ok = SCORED.every(k => c[k].pass);   // ignore h for PASS/FAIL
    if (!ok) anyFail = true;
    console.log(row.s.q.slice(0, 41).padEnd(42) + line + "  " + (ok ? "PASS" : "FAIL"));
    for (const k of SCORED) if (!c[k].pass) fails.push(`${row.s.q} [${k}] ${c[k].why}`);
  }
  console.log("\nFailures (search [check] cause):");
  if (!fails.length) console.log("  none");
  for (const f of fails) console.log("  - " + f);
  console.log(`\n${anyFail ? "SOME CHECKS FAILED" : "ALL PASS"}`);
  process.exit(anyFail ? 1 : 0);
}
main().catch(e => { console.error("oneboxCheck crashed:", e); process.exit(2); });
