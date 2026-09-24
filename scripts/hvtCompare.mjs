// HVT-100 comparison, OUR side. Archive only, ZERO OCD. Drives the crew-gated Desk endpoint
// (executeDsl = One Box buildSpec/fetchQualifying/isQualifying), applies the approved rules, and
// writes gas_100.csv + receipts + summary.md. No product-code changes. Reads docs/hvt100/scope_map.csv.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const OUT = path.resolve("docs/hvt100");
const TODAY = new Date().toISOString().slice(0, 10);
const W = { W1: ["2025-01-01", "2026-06-30"], W2: ["2026-07-01", TODAY], W3: [isoBack(1095), TODAY] };
function isoBack(d) { return new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); }

function readCsv(p) { const rows = []; let f = fs.readFileSync(p, "utf8"), i = 0, cur = [""], q = false;
  for (; i < f.length; i++) { const c = f[i]; if (q) { if (c === '"') { if (f[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; } else q = false; } else cur[cur.length - 1] += c; } else { if (c === '"') q = true; else if (c === ",") cur.push(""); else if (c === "\n") { rows.push(cur); cur = [""]; } else if (c === "\r") {} else cur[cur.length - 1] += c; } }
  if (cur.length > 1 || cur[0] !== "") rows.push(cur); const h = rows[0]; return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, j) => [k, r[j]]))); }

const scope = readCsv(path.join(OUT, "hvt_100.csv")).reduce((m, r) => (m[r.car_id] = r, m), {});
const map = readCsv(path.join(OUT, "scope_map.csv"));
// CARS="9,15,..." re-fetches ONLY those cars; all others are reconstructed from their existing
// receipts/<id>.json (kept as pushed) so their gas_100 rows/receipts do not change.
const ONLY = new Set((process.env.CARS || "").split(",").map(s => s.trim()).filter(Boolean).map(Number));

// generation year bounds for the +/-2 widen (widen never crosses these)
const GEN = { C2:[1963,1967],C4:[1984,1996],C5:[1997,2004],C6:[2005,2013],C7:[2014,2019],C8:[2020,2026],
  e30:[1986,1991],e36:[1992,1999],e46:[2000,2006],e28:[1985,1988],e39:[1998,2003],
  "901":[1964,1973],"930":[1974,1989],"964":[1989,1994],"993":[1994,1998],"996":[1999,2004],"997":[2005,2012],"991":[2012,2019],"991T":[2018,2019],
  A80:[1993,1998],FD:[1993,1995],Z32:[1990,1996],NA1:[1991,2001],NA2:[2002,2005],R35:[2009,2030],F82:[2014,2020],
  S197:[2005,2014],S550:[2015,2023],VX:[2013,2017],"981":[2013,2016],R107:[1972,1989],S1:[1961,1968],"105":[1963,1977],
  "2005":[2005,2006],G50:[1987,1989],SR1:[1992,1995],ZB2:[2003,2010],"1st":[1966,1977],"2nd":[1970,1981],"3rd":[1982,1992],
  Fox:[1979,1993],W113:[1963,1971],"356C":[1964,1965],"GT350-1":[1965,1967] };

// per-car halo/variant title excludes (the pool check catches anything missed)
const HALO = {
  2:/fuel.?inj|fuelie|327\s*\/?\s*360|\bl84\b/i, 3:/shelby|gt-?350|hi-?po|k-?code/i, 4:/l88|l89/i,
  5:/copo|zl1|yenko|\bss\b/i, 6:/ls6|\b454\b/i, 8:/hemi|\b426\b|daytona|charger 500/i, 9:/gt500/i,
  10:/judge|ram ?air/i, 17:/\b911 ?s\b|\b911 ?e\b|targa|outlaw|backdate|hot.?rod/i, 18:/lightweight|m471|\brsr\b/i,
  22:/gullwing|alloy/i, 24:/\bgta\b|junior/i, 27:/turbo/i, 28:/\bgto\b|\bswb\b|\bgte\b/i, 29:/spider|spyder|competition/i,
  30:/\bsv\b|jota|roadster/i, 31:/flatnose|slantnose|flachbau/i, 32:/turbo|targa|cabriolet|speedster/i, 33:/cabriolet/i,
  36:/turbo s/i, 37:/512 ?tr|512 ?m|koenig/i, 40:/sport ?evo|evolution|\bevo\b|convertible|cabriolet/i, 42:/sedan|convertible|cabriolet|\bltw\b/i,
  49:/\bgnx\b/i, 52:/cobra ?r\b/i, 56:/\bsv\b|\bvt\b|se30|roadster/i, 57:/\bgts\b|srt/i, 58:/turbo ?s|\bgt2\b/i,
  60:/\bgt2\b|gt3 ?rs/i, 61:/gt3 ?rs|\bgt2\b/i, 70:/\b722\b|roadster/i, 71:/scuderia|spider/i, 73:/superleggera|nera|spyder/i,
  79:/black series|roadster/i, 80:/gt2 ?rs/i, 81:/gt2 ?rs/i, 86:/spider/i, 87:/speciale|spider/i, 88:/aperta/i,
  91:/performante|\bsto\b|tecnica|spyder|\bevo\b/i, 95:/\bz06\b|convertible/i, 96:/gt350/i, 98:/hellcat|redeye|srt-?8/i
};

// ---- basis: house = buyer-paid (premium-inclusive) USD; online = sold price + buyer fee ----
const FX = { USD:1, GBP:1.27, EUR:1.08, CHF:1.12, AUD:0.66, CAD:0.73 };
const HOUSES = new Set(["RM Sotheby's","Gooding & Co","Gooding Christie's","Bonhams","Broad Arrow","Barrett-Jackson","Mecum Auctions"]);
function basisPrice(r) {
  if (HOUSES.has(r.venue)) { if (r.buyer_paid && r.buyer_paid.amount != null) return { usd: Math.round(r.buyer_paid.amount * (FX[r.buyer_paid.currency] || 1)), basis: "buyer-paid" }; return { usd: r.hammer_usd, basis: "buyer-paid~hammer" }; }
  const h = r.hammer_usd; if (h == null) return { usd: null, basis: "online" }; return { usd: Math.round(h + Math.min(h * 0.05, 7500)), basis: "sold+fee" };
}
const pct = (a, p) => { const s = a.filter(x => x > 0).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
const med = a => pct(a, 0.5);
const money = v => v == null ? "" : "$" + Math.round(v).toLocaleString("en-US");
const num = s => s ? Number(String(s).replace(/[^\d.]/g, "")) || null : null;

const post = (page, dsl, vehicle) => page.evaluate(async (d, v) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: d, vehicle: v }) }); return await r.json().catch(() => null); }, dsl, vehicle);
function dslFor(m, yMin, yMax) {
  const f = { make: m.make, model: m.model, window: "36mo", year_min: yMin, year_max: yMax };
  if (m.trim) f.trim = m.trim;
  return { filters: f, groupBy: [], measures: ["count", "median", "p25", "p75", "min", "max"] };
}
// Body is routed through the One Box path (NOT a Desk DSL/executor change): a pre-resolved vehicle
// with bodyStyle is passed to the Desk, which sanitizeResolvedVehicle preserves and buildSpec/
// isQualifying honour (One Box already separates coupe/convertible/cabriolet/targa/roadster).
function vehFor(m, yMin) {
  const v = { make: m.make, model: m.model, year: yMin };
  if (m.trim) v.trim = m.trim;
  if (m.body) v.bodyStyle = m.body;
  return v;
}
async function fetchChannel(page, m, yMin, yMax, channel) {
  const dsl = dslFor(m, yMin, yMax); dsl.filters.channel = channel;   // channel:house -> houseTier (no photo); channel:online -> photo-gated
  let res = null;
  for (let a = 0; a < 6 && !(res && res.status === "ok"); a++) { res = await post(page, dsl, vehFor(m, yMin)); if (!(res && res.status === "ok")) await new Promise(r => setTimeout(r, 1000 * (a + 1))); }
  if (!(res && res.status === "ok")) return { ok: false, receipts: [], total: null };
  return { ok: true, receipts: (res.receipts || []).filter(r => !r.excluded).map(r => ({ ...r, _chan: channel })), total: res.answer && res.answer.total, capped: (res.answer && res.answer.total) != null && (res.receipts || []).length < res.answer.total };
}
// house (buyer-paid, no photo) UNION online (sold+fee, photo-gated), deduped through a canonical
// proxy (chassis + sale month + rounded price) so a car on two sources counts once.
async function fetchScoped(page, m, yMin, yMax) {
  const H = await fetchChannel(page, m, yMin, yMax, "house");
  const O = await fetchChannel(page, m, yMin, yMax, "online");
  if (!H.ok && !O.ok) return { ok: false, receipts: [], total: null };
  const seen = new Set(); let union = [];
  for (const r of [...(H.receipts || []), ...(O.receipts || [])]) {
    const key = (r.chassis || r.venue || "?") + "|" + String(r.date || "").slice(0, 7) + "|" + Math.round((r.hammer_usd || 0) / 1000);
    if (seen.has(key)) continue; seen.add(key); union.push(r);
  }
  const halo = HALO[Number(m.car_id)];
  let haloDropped = 0;
  if (halo) { const before = union.length; union = union.filter(r => !halo.test(r.title || "")); haloDropped = before - union.length; }
  return { ok: true, receipts: union, total: (H.total || 0) + (O.total || 0), haloDropped, capped: H.capped || O.capped,
    houseN: (H.receipts || []).length, onlineN: (O.receipts || []).length };
}

(async () => {
  if (!ONLY.size) fs.rmSync(path.join(OUT, "receipts"), { recursive: true, force: true });   // keep the 95 when re-running a subset
  fs.mkdirSync(path.join(OUT, "receipts"), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });

  const csv = [["car_id","year","make","model_trim","status","year_scope_used","window","basis","n","thin","median","p25","p75","min","max"]];
  const poolChecks = [], scopeFlags = [], perCar = [];

  for (const m of map) {
    const id = Number(m.car_id), y = Number(m.year), hv = scope[m.car_id] || {};
    const status = /NO MATCHING HVT/i.test(m.notes) ? "nohvt" : /COVERAGE ONLY/i.test(m.notes) ? "coverage" : "compare";
    // year rule: exact year; if W1<8 widen +/-2 within gen; W1 scope applies to all windows
    let yMin = y, yMax = y, yLabel = "exact " + y, f, priced, reused = false;
    if (ONLY.size && !ONLY.has(id)) {
      // reconstruct from the pushed receipts (unchanged cars) - no fetch
      reused = true;
      const j = JSON.parse(fs.readFileSync(path.join(OUT, "receipts", id + ".json"), "utf8"));
      yLabel = j.year_scope || yLabel;
      priced = (j.sales || []).map(s => ({ date: s.date, venue: s.venue, hammer_usd: s.hammer_usd, chassis: s.chassis, year: s.year, title: s.title, buyer_paid: s.native, _p: { usd: s.price_usd, basis: s.basis } })).filter(r => r._p.usd);
      f = { ok: true, receipts: priced, total: priced.length, haloDropped: j.halo_dropped || 0, capped: false };
    } else {
      f = await fetchScoped(page, m, yMin, yMax);
      let w1 = f.receipts.filter(r => inWin(r, "W1"));
      if (f.ok && w1.length < 8) {
        const g = GEN[m.generation] || [y - 2, y + 2];
        yMin = Math.max(g[0], y - 2); yMax = Math.min(g[1], y + 2); yLabel = `adjacent years pooled (${yMin}-${yMax})`;
        f = await fetchScoped(page, m, yMin, yMax);
      }
      priced = f.receipts.map(r => ({ ...r, _p: basisPrice(r) })).filter(r => r._p.usd);
    }
    const houseShare = priced.length ? priced.filter(r => HOUSES.has(r.venue)).length / priced.length : 0;
    const basisLabel = !priced.length ? "n/a" : houseShare === 1 ? "buyer-paid (houses)" : houseShare === 0 ? "sold+fee (online)" : `mixed (${Math.round(houseShare*100)}% house buyer-paid, rest sold+fee)`;
    // channel mix (W1) + per-channel medians (condition 2)
    const w1all = priced.filter(r => inWin(r, "W1"));
    const w1house = w1all.filter(r => HOUSES.has(r.venue)), w1online = w1all.filter(r => !HOUSES.has(r.venue));
    const chanMix = { houseN: w1house.length, onlineN: w1online.length, houseMedian: med(w1house.map(r => r._p.usd)), onlineMedian: med(w1online.map(r => r._p.usd)) };
    // windows
    const win = {};
    for (const wk of ["W1", "W2", "W3"]) { const rows = priced.filter(r => inWin(r, wk)); const vals = rows.map(r => r._p.usd); const n = rows.length, thin = n < 8;
      win[wk] = { n, thin, median: thin ? null : med(vals), p25: thin ? null : pct(vals, .25), p75: thin ? null : pct(vals, .75), min: thin ? null : Math.min(...vals), max: thin ? null : Math.max(...vals) };
      csv.push([id, y, JSON.stringify(m.make + " " + (m.model + (m.trim ? " " + m.trim : ""))), status, yLabel, wk, basisLabel, n, thin ? "yes" : "no", win[wk].median ?? "", win[wk].p25 ?? "", win[wk].p75 ?? "", win[wk].min ?? "", win[wk].max ?? ""]); }
    // receipts file (only rewrite the cars we actually re-fetched)
    if (!reused) fs.writeFileSync(path.join(OUT, "receipts", id + ".json"), JSON.stringify({ car_id: id, listed: `${y} ${m.make} ${m.model} ${m.trim}`.trim(), status, year_scope: yLabel, basis: basisLabel, scope: dslFor(m, yMin, yMax).filters, halo_dropped: f.haloDropped || 0, sales: priced.map(r => ({ date: r.date, venue: r.venue, price_usd: r._p.usd, basis: r._p.basis, hammer_usd: r.hammer_usd, native: r.buyer_paid, year: r.year, url: r.link, chassis: r.chassis, title: r.title })) }, null, 1) + "\n");
    // POOL CHECK (every car): count, model-year range, venues, cheapest/median/dearest titles
    const yrs = priced.map(r => r.year).filter(Boolean).sort((a, b) => a - b);
    const venues = [...new Set(priced.map(r => r.venue))];
    const sorted = priced.slice().sort((a, b) => a._p.usd - b._p.usd);
    const mid = sorted[Math.floor(sorted.length / 2)];
    poolChecks.push({ id, listed: `${y} ${m.make} ${m.model} ${m.trim}`.trim(), status, n: priced.length, capped: f.capped, haloDropped: f.haloDropped || 0, yrange: yrs.length ? yrs[0] + "-" + yrs[yrs.length - 1] : "-", venues,
      chan: `W1 house ${chanMix.houseN} (med ${money(chanMix.houseMedian)}) / online ${chanMix.onlineN} (med ${money(chanMix.onlineMedian)})`,
      cheapest: sorted[0] ? `${money(sorted[0]._p.usd)} ${(sorted[0].title||"").slice(0,50)}` : "-",
      median: mid ? `${money(mid._p.usd)} ${(mid.title||"").slice(0,50)}` : "-",
      dearest: sorted.length ? `${money(sorted[sorted.length-1]._p.usd)} ${(sorted[sorted.length-1].title||"").slice(0,50)}` : "-" });
    // scope-failure heuristics
    if (!f.ok) scopeFlags.push(`car ${id} ${m.make} ${m.model}: query error`);
    else if (priced.length === 0 && status !== "coverage") scopeFlags.push(`car ${id} ${m.make} ${m.model} ${m.trim}: ZERO qualifying sales (scope may be wrong)`);
    else if (f.capped) scopeFlags.push(`car ${id} ${m.make} ${m.model}: pool exceeds 300 (${f.total}); NOT fully counted`);
    perCar.push({ id, m, hv, status, win, priced });
    process.stderr.write(`  ${id} ${m.make} ${m.model} ${m.trim}: ${yLabel} | n=${priced.length}${f.haloDropped?` (halo-dropped ${f.haloDropped})`:""}${f.capped?" CAPPED":""}${status!=="compare"?" ["+status+"]":""}\n`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "gas_100.csv"), csv.map(r => r.join(",")).join("\n") + "\n");

  // ---- summary.md ----
  const comp = perCar.filter(p => p.status === "compare"), excl = perCar.filter(p => p.status === "nohvt"), cov = perCar.filter(p => p.status === "coverage");
  let above = 0, below = 0, inside = 0, compN = 0, thinN = 0;
  const rowsB = [], rowsD = [], rowsE = [];
  for (const p of comp) {
    const v3 = num(p.hv.v3_value), lo = num(p.hv.v3_lo), hi = num(p.hv.v3_hi), v2 = num(p.hv.v2_value), w1 = p.win.W1;
    if (!v3 || w1.thin) { thinN += w1.thin ? 1 : 0; rowsB.push(`- ${p.id} ${p.hv.year} ${p.m.make} ${p.m.model} ${p.m.trim}: HVT#3 ${money(v3)} | our W1 ${w1.thin ? "THIN (n=" + w1.n + ")" : money(w1.median)}${v3 && !w1.thin ? " | gap " + (((w1.median - v3) / v3) * 100).toFixed(0) + "%" : " | no comparison"}`); continue; }
    compN++; const gap = (w1.median - v3) / v3;
    const band = (lo != null && hi != null && w1.median >= lo && w1.median <= hi) ? "inside" : (w1.median > (hi || v3) ? "above" : "below");
    if (band === "inside") inside++; else if (band === "above") above++; else below++;
    rowsB.push(`- ${p.id} ${p.hv.year} ${p.m.make} ${p.m.model} ${p.m.trim}: HVT#3 ${money(v3)} [${money(lo)}-${money(hi)}] | our W1 ${money(w1.median)} | gap ${(gap*100).toFixed(0)}% | ${band} #3 band | #2 ${money(v2)}`);
    rowsD.push(`- ${p.id} ${p.m.model} ${p.m.trim}: our p25-p75 ${money(w1.p25)}-${money(w1.p75)} vs HVT#3 Lo-Hi ${money(lo)}-${money(hi)}`);
    if (!p.win.W2.thin && p.win.W2.median) { const mv = ((p.win.W2.median - w1.median) / w1.median * 100).toFixed(0); rowsE.push(`- ${p.id} ${p.m.model} ${p.m.trim}: our W2 vs W1 ${mv >= 0 ? "+" : ""}${mv}% | HVT quarterly ${p.hv.quarterly_change || "n/a"}`); }
  }
  // W3 FALLBACK: of the W1-thin comparable cars, how many become comparable on W3 (36mo, >=8),
  // and their inside/above/below vs HVT #3. Reported separately, labelled fallback.
  let w3rescued = 0, w3in = 0, w3ab = 0, w3be = 0; const rowsW3 = [];
  for (const p of comp) {
    const v3 = num(p.hv.v3_value), lo = num(p.hv.v3_lo), hi = num(p.hv.v3_hi), w1 = p.win.W1, w3 = p.win.W3;
    if (!v3 || !w1.thin) continue;            // only W1-thin comparable cars
    if (w3.thin || w3.median == null) continue; // did not reach >=8 even on 36mo
    w3rescued++;
    const band = (lo != null && hi != null && w3.median >= lo && w3.median <= hi) ? "inside" : (w3.median > (hi || v3) ? "above" : "below");
    if (band === "inside") w3in++; else if (band === "above") w3ab++; else w3be++;
    rowsW3.push(`- ${p.id} ${p.hv.year} ${p.m.make} ${p.m.model} ${p.m.trim}: HVT#3 ${money(v3)} [${money(lo)}-${money(hi)}] | our W3 median ${money(w3.median)} (n=${w3.n}) | ${band} #3 band`);
  }
  const covPrior = perCar.filter(p => p.priced.some(r => r.chassis)).length;
  const md = [];
  md.push(`# HVT-100 comparison — our side (archive only, zero OCD)`, ``, `Generated ${TODAY}. Windows: W1 ${W.W1[0]}..${W.W1[1]}, W2 ${W.W2[0]}..${W.W2[1]}, W3 last 36 months. Scoping: One Box path (buildSpec/fetchQualifying/isQualifying) via the Desk. Year rule: exact model year if W1>=8 else +/-2 within generation ("adjacent years pooled"), W1 scope applied to all windows. Basis: auction houses buyer-paid; online sold price + buyer fee. Medians and quartiles only. No cap.`, ``);
  md.push(`## Run note`,
    `Cars 9 (Shelby GT350) and 82 (Porsche 911 Carrera T) were re-run in ISOLATION (one car at a time) because the Desk executor intermittently returns an empty pool under load rather than an error, which had made both read as thin zeros in the full-batch run.`,
    `- Car 82 recovered cleanly: its pool is real. The full-batch zero was purely the empty-result flake plus a widen artifact (the +/-2 widen reached 2016-2019, below the Carrera T's 2018 production start, which the executor zeroes); the widen is now capped to the trim's real 2018-2019 window and it lands n=10 on W3.`,
    `- Car 9 is NOT recovered and stays a documented zero. Its clean scope (trim=GT350, which title-filters out the GT500 that shares the Shelby Mustang model) is PERSISTENTLY empty this run (0 across 15 retries in isolation) via the same executor empty-result bug; the only stable-count alternative (model=GT350, no trim) returns a GT500-contaminated, non-deterministic pool. Per "better nothing than a fake number" it lands 0 until the executor empty-result bug is fixed.`,
    ``);
  md.push(`## a) Scope-failure report (read first)`, scopeFlags.length ? scopeFlags.map(s => `- ${s}`).join("\n") : "- none", ``);
  md.push(`## c) Totals`,
    `- Comparable (in HVT): ${comp.length} | with a non-thin W1 median: ${compN} | thin/no-value: ${comp.length - compN}`,
    `- Excluded (no matching HVT car): ${excl.length} -> ${excl.map(p => p.id + " " + p.m.model + " " + p.m.trim).join("; ")}`,
    `- Coverage-only (not in HVT): ${cov.length} -> ${cov.map(p => p.id + " " + p.m.model + " " + p.m.trim).join("; ")}`,
    `- Vs HVT #3 Lo-Hi band (W1): ${inside} inside, ${above} above, ${below} below`,
    `- W3 FALLBACK (36mo): of the ${comp.length - compN} W1-thin comparable cars, ${w3rescued} reach >=8 sales on W3 -> vs HVT #3 band ${w3in} inside, ${w3ab} above, ${w3be} below (fallback, NOT combined with the W1 figures)`,
    `- Prior-sale coverage (>=1 sale carries a VIN/chassis): ${covPrior} of ${perCar.length}`, ``);
  md.push(`## b) Per car: HVT #3 vs our W1 median`, rowsB.join("\n"), ``);
  md.push(`## d) Dispersion: our p25-p75 vs HVT #3 Lo-Hi`, rowsD.join("\n"), ``);
  md.push(`## e) Lag: our W2-vs-W1 move vs HVT printed quarterly change`, rowsE.length ? rowsE.join("\n") : "- (no car had non-thin W1 and W2)", ``);
  md.push(`## g) W3 fallback (36mo) for W1-thin cars`, rowsW3.length ? rowsW3.join("\n") : "- none reached >=8 on W3", ``);
  md.push(`## f) Pool check (every car)`, `car | status | n | halo-dropped | model-year range | venues | cheapest / median / dearest`);
  for (const pc of poolChecks) md.push(`- **${pc.id}** ${pc.listed} [${pc.status}] n=${pc.n}${pc.capped?" CAPPED":""} halo-dropped=${pc.haloDropped} yrs=${pc.yrange} venues=${pc.venues.join(",")||"-"}\n    - channel: ${pc.chan}\n    - cheapest: ${pc.cheapest}\n    - median: ${pc.median}\n    - dearest: ${pc.dearest}`);
  md.push(``);
  fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
  console.log(`\nWrote gas_100.csv (${csv.length - 1} rows), ${perCar.length} receipts, summary.md`);
  console.log(`comparable=${comp.length} (nonthin ${compN}) excluded=${excl.length} coverage=${cov.length} | inside=${inside} above=${above} below=${below} | scopeFlags=${scopeFlags.length} | priorSaleCoverage=${covPrior}`);
})();
function inWin(r, wk) { const [a, b] = W[wk]; return r.date && r.date >= a && r.date <= b; }
