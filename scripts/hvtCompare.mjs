// HVT-100 comparison — OUR side. Archive only, ZERO OCD. Drives the crew-gated Desk endpoint
// (executeDsl = the One Box buildSpec/fetchQualifying/isQualifying scoping path) per car, then
// recomputes prices on the requested basis (auction houses = buyer-paid; online = sold + buyer fee),
// slices into W1/W2/W3, and writes gas_100.csv + receipts + summary.md. Does NOT change product code.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const OUT = path.resolve("docs/hvt100");
const TODAY = new Date().toISOString().slice(0, 10);
const W = { W1: ["2025-01-01", "2026-06-30"], W2: ["2026-07-01", TODAY], W3: [isoBack(1095), TODAY] };
function isoBack(d) { return new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); }

const cars = JSON.parse(fs.readFileSync("/tmp/hvtcars.json", "utf8"));

// Per-car scoping overrides (make/model/trim/generation/body/year) where the plain make+model+trim
// from the Hagerty row is not enough for exact-variant scoping, plus the status flags the task set.
// status: "nohvt" (run our side, exclude from comparison), "coverage" (not in HVT, coverage only).
const OV = {
  5:  { model: "Camaro", trim: "Z/28", body: null },                 // 1969 Z/28 includes RS
  7:  { model: "Barracuda", trim: "340", status: "nohvt" },          // HVT gave an AAR
  17: { model: "911", trim: "911T", gen: "930" },
  18: { model: "911", trim: "Carrera RS 2.7", year_min: 1973, year_max: 1973 },
  30: { model: "Miura", trim: "P400 S" },
  31: { model: "911", trim: "930 Turbo", gen: "930" },
  32: { model: "911", trim: "Carrera", gen: "930", body: "coupe" },
  34: { model: "911", trim: "Turbo", gen: "964", year_min: 1994, year_max: 1994 },
  40: { model: "M3", gen: "e30" },
  41: { model: "M5", gen: "e28" },
  42: { model: "M3", gen: "e36", body: "coupe" },
  43: { model: "560SL", year: 1989, year_min: 1989, year_max: 1989 }, // no 1990; read as 1989
  50: { model: "Corvette", trim: "ZR-1", body: "coupe" },
  54: { model: "Defender", trim: "90" },
  55: { model: "Land Cruiser", trim: "FJ60" },
  58: { model: "911", trim: "Turbo", gen: "993" },
  59: { model: "911", trim: "Carrera", gen: "996", body: "coupe" },
  60: { model: "911", trim: "GT3", gen: "996" },
  61: { model: "911", trim: "GT3", gen: "997" },
  63: { model: "M3", gen: "e46", body: "coupe", trim: "M3" },
  64: { model: "M5", gen: "e39" },
  68: { model: "Corvette", trim: "Z06", year_min: 2001, year_max: 2004, body: "coupe" }, // C5
  69: { model: "Corvette", trim: "Z06", year_min: 2006, year_max: 2013, body: "coupe" }, // C6
  74: { model: "NSX", body: "targa", year_min: 2002, year_max: 2005 },
  77: { model: "Viper", trim: "SRT-10", body: "coupe" },
  78: { model: "Land Cruiser", trim: "100", status: "nohvt" },       // HVT gave a 1997 FJ80
  80: { model: "911", trim: "GT3 RS", gen: "991" },
  81: { model: "911", trim: "GT3 RS", gen: "991", year_min: 2019, year_max: 2019 },
  82: { model: "911", trim: "Carrera T", gen: "991" },
  83: { model: "Cayman", trim: "GT4", gen: "981" },
  89: { model: "MP4-12C", status: "coverage" },
  90: { model: "720S", status: "coverage" },
  92: { model: "Aventador", trim: "S", status: "coverage" },
  93: { model: "Corvette", trim: "Z51", year_min: 2014, year_max: 2019, body: "coupe" },
  94: { model: "Corvette", trim: "ZR1", year_min: 2019, year_max: 2019, body: "coupe" },
  95: { model: "Corvette", trim: "Stingray", year_min: 2020, year_max: 2023, body: "coupe" },
  96: { model: "Mustang", trim: "Shelby GT500", body: "coupe" },
  97: { model: "Mustang", trim: "Shelby GT350R" },
  99: { model: "M4", trim: "Competition", body: "coupe", status: "coverage" },
  100:{ model: "Focus", trim: "RS", status: "coverage" }
};

// derive make/model from the Hagerty trim string when no override
function baseModel(c) {
  const t = c.trim.replace(/\b(coupe|convertible|roadster|fastback|sedan|hardtop|targa|spider|cabriolet|pickup|wagon|short bed)\b/gi, "").trim();
  return t.split(/\s+/).slice(0, 2).join(" ");
}
function bodyFromSpec(spec) {
  const s = (spec || "").toLowerCase();
  if (/convertible|roadster|cabriolet|drophead|speedster/.test(s)) return "convertible";
  if (/targa|t-top|t-roof/.test(s)) return "targa";
  if (/fastback/.test(s)) return "fastback";
  if (/coupe|hardtop|sport coupe/.test(s)) return "coupe";
  return null;
}

function dslFor(c) {
  const ov = OV[c.id] || {};
  const f = { make: c.mk, window: "36mo" };
  f.model = ov.model || baseModel(c);
  const trim = ov.trim !== undefined ? ov.trim : trimOf(c);
  if (trim) f.trim = trim;
  if (ov.gen) f.generation = ov.gen;
  const body = ov.body !== undefined ? ov.body : bodyFromSpec(c.spec);
  // year scope: exact year unless an override widens it (generation families)
  const y = ov.year || Number(c.y);
  if (ov.year_min || ov.year_max) { f.year_min = ov.year_min; f.year_max = ov.year_max; }
  else if (!ov.gen) { f.year_min = y; f.year_max = y; }
  return { dsl: { filters: f, groupBy: [], measures: ["count", "median", "p25", "p75", "min", "max"] }, body, status: ov.status || null };
}
function trimOf(c) {
  // strip body words + leading year/make; keep the distinctive trim tokens
  let t = c.trim.replace(/\b(coupe|convertible|roadster|fastback|sedan|hardtop coupe|hardtop|targa|spider|cabriolet|pickup|wagon|short bed|sport coupe)\b/gi, "").trim();
  // drop a leading model word (best effort; Desk resolver handles the model separately)
  return t;
}

// ---- basis: house = buyer-paid (premium-inclusive) USD; online = sold price + buyer fee ----
const FX = { USD: 1, GBP: 1.27, EUR: 1.08, CHF: 1.12, AUD: 0.66, CAD: 0.73 };
const HOUSES = new Set(["RM Sotheby's", "Gooding & Co", "Gooding Christie's", "Bonhams", "Broad Arrow", "Barrett-Jackson", "Mecum Auctions"]);
function batFee(hammer) { return Math.min(hammer * 0.05, 7500); }  // BaT 5% capped $7,500
function basisPrice(r) {
  const house = HOUSES.has(r.venue) || (r.sale_type && false);
  if (house) {
    if (r.buyer_paid && r.buyer_paid.amount != null) return { usd: Math.round(r.buyer_paid.amount * (FX[r.buyer_paid.currency] || 1)), basis: "buyer-paid" };
    return { usd: r.hammer_usd, basis: "buyer-paid(approx=hammer)" };
  }
  // online: sold price + buyer fee (BaT 5% cap $7.5k; others treat hammer as sold + ~5%)
  const h = r.hammer_usd; if (h == null) return { usd: null, basis: "online" };
  return { usd: Math.round(h + batFee(h)), basis: "sold+fee" };
}
const med = a => pct(a, 0.5);
function pct(arr, p) { const s = arr.filter(x => x > 0).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); }
function money(v) { return v == null ? "" : "$" + Math.round(v).toLocaleString("en-US"); }
function num(s) { return s ? Number(String(s).replace(/[^\d.]/g, "")) || null : null; }

const post = (page, dsl) => page.evaluate(async (d) => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: d }) }); return await r.json().catch(() => null); }, dsl);

(async () => {
  fs.mkdirSync(path.join(OUT, "receipts"), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
  await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });

  const csv = [["car_id", "year", "make", "model_trim", "window", "basis", "n", "thin", "median", "p25", "p75", "min", "max", "capped", "status"]];
  const rec = {};
  const per = [];   // per-car summary rows
  const scopeFlags = [];

  for (const c of cars) {
    const { dsl, body, status } = dslFor(c);
    let res = null;
    for (let a = 0; a < 4 && !(res && res.status === "ok"); a++) { res = await post(page, dsl); if (!(res && res.status === "ok")) await new Promise(r => setTimeout(r, 900 * (a + 1))); }
    const ok = res && res.status === "ok";
    const receipts = ok ? (res.receipts || []).filter(r => !r.excluded) : [];
    const total = ok ? (res.answer && res.answer.total) : null;
    const capped = ok && total != null && receipts.length < total;
    // basis price + window slice
    const priced = receipts.map(r => ({ ...r, _p: basisPrice(r) })).filter(r => r._p.usd);
    const basisLabel = priced.some(r => HOUSES.has(r.venue)) ? (priced.every(r => HOUSES.has(r.venue)) ? "buyer-paid (houses)" : "mixed: houses buyer-paid, online sold+fee") : "sold+fee (online)";
    for (const wk of ["W1", "W2", "W3"]) {
      const [from, to] = W[wk];
      const inWin = priced.filter(r => r.date && r.date >= from && r.date <= to);
      const vals = inWin.map(r => r._p.usd);
      const n = inWin.length, thin = n < 8;
      csv.push([c.id, c.y, JSON.stringify(c.mk + " " + c.trim), wk, basisLabel, n, thin ? "yes" : "no",
        thin ? "" : med(vals), thin ? "" : pct(vals, .25), thin ? "" : pct(vals, .75), thin ? "" : Math.min(...vals), thin ? "" : Math.max(...vals), capped ? "yes" : "", status || ""]);
      if (wk === "W1") c._w1 = { n, thin, median: thin ? null : med(vals) };
      if (wk === "W2") c._w2 = { n, thin, median: thin ? null : med(vals) };
    }
    // receipts file
    rec[c.id] = priced.map(r => ({ date: r.date, venue: r.venue, price_usd: r._p.usd, basis: r._p.basis, hammer_usd: r.hammer_usd, native: r.buyer_paid, url: r.link, chassis: r.chassis, mileage: r.mileage }));
    fs.writeFileSync(path.join(OUT, "receipts", c.id + ".json"), JSON.stringify({ car_id: c.id, listed: `${c.y} ${c.mk} ${c.trim}`, scope: dsl.filters, status: status || "compared", basis: basisLabel, sales: rec[c.id] }, null, 1) + "\n");
    // scope-failure heuristics
    const w3n = priced.length;
    if (!ok) scopeFlags.push(`car ${c.id} ${c.mk} ${c.trim}: query error (status ${res && res.status})`);
    else if (w3n === 0 && !status) scopeFlags.push(`car ${c.id} ${c.mk} ${c.trim}: ZERO qualifying sales over 36mo (scope may be wrong)`);
    else if (capped) scopeFlags.push(`car ${c.id} ${c.mk} ${c.trim}: pool exceeds 300 (${total}); receipts sampled, median from ${w3n}`);
    per.push({ c, status, w3n, capped });
    process.stderr.write(`  car ${c.id} ${c.mk} ${c.trim}: W3 n=${w3n}${capped ? " (capped of " + total + ")" : ""}${status ? " [" + status + "]" : ""}\n`);
  }
  await browser.close();

  fs.writeFileSync(path.join(OUT, "gas_100.csv"), csv.map(r => r.join(",")).join("\n") + "\n");

  // ---- summary.md ----
  const hv = {}; cars.forEach(c => hv[c.id] = c);
  const excluded = cars.filter(c => (OV[c.id] || {}).status === "nohvt");
  const coverage = cars.filter(c => (OV[c.id] || {}).status === "coverage");
  const comparable = cars.filter(c => !(OV[c.id] || {}).status);
  let above = 0, below = 0, inside = 0, thinN = 0, compN = 0;
  const rowsB = [];
  for (const c of comparable) {
    const v3 = num(c.v3), lo = num(c.v3lo), hi = num(c.v3hi), v2 = num(c.v2);
    const w1 = c._w1 || { thin: true };
    if (w1.thin || !v3) { thinN += !v3 ? 0 : (w1.thin ? 1 : 0); rowsB.push(`- ${c.id} ${c.y} ${c.mk} ${c.trim}: HVT#3 ${money(v3)} | our W1 ${w1.thin ? "THIN (n=" + (w1.n || 0) + ")" : money(w1.median)} | ${v3 && !w1.thin ? gapStr(w1.median, v3) : "no comparison"}`); continue; }
    compN++;
    const gap = (w1.median - v3) / v3;
    const band = (lo != null && hi != null && w1.median >= lo && w1.median <= hi) ? "inside" : (w1.median > (hi || v3) ? "above" : "below");
    if (band === "inside") inside++; else if (band === "above") above++; else below++;
    rowsB.push(`- ${c.id} ${c.y} ${c.mk} ${c.trim}: HVT#3 ${money(v3)} [${money(lo)}-${money(hi)}] | our W1 median ${money(w1.median)} | gap ${(gap * 100).toFixed(0)}% | ${band} #3 band | #2 ${money(v2)}`);
  }
  function gapStr(m, v3) { return v3 ? `gap ${(((m - v3) / v3) * 100).toFixed(0)}%` : ""; }

  const md = [];
  md.push(`# HVT-100 comparison — our side (archive only, zero OCD)`, ``, `Generated ${TODAY}. Windows: W1 ${W.W1[0]}..${W.W1[1]}, W2 ${W.W2[0]}..${W.W2[1]}, W3 last 36 months (fallback). Scoping via the One Box path (buildSpec/fetchQualifying/isQualifying) through the Desk. Basis: auction houses buyer-paid; online sold price plus buyer fee. Medians and quartiles only.`, ``);
  md.push(`## a) Scope-failure report (read first)`, scopeFlags.length ? scopeFlags.map(s => `- ${s}`).join("\n") : "- none", ``);
  md.push(`## c) Totals`,
    `- Comparable cars (in HVT, scoped): ${comparable.length}`,
    `- Excluded (no matching HVT car): ${excluded.length} -> ${excluded.map(c => c.id + " " + c.mk + " " + c.trim).join("; ")}`,
    `- Coverage-only (not in HVT): ${coverage.length} -> ${coverage.map(c => c.id + " " + c.mk + " " + c.trim).join("; ")}`,
    `- Of comparable: ${compN} had a non-thin W1 median; ${comparable.length - compN} thin/no-value`,
    `- Vs HVT #3 Lo-Hi band: ${inside} inside, ${above} above, ${below} below`, ``);
  md.push(`## b) Per car: HVT #3 vs our W1 median`, rowsB.join("\n"), ``);
  // e) lag
  md.push(`## e) Lag: our W2 vs W1 move next to HVT printed quarterly change`);
  for (const c of comparable) {
    const w1 = c._w1 || {}, w2 = c._w2 || {};
    if (w1.thin || w2.thin || !w1.median || !w2.median) continue;
    const mv = ((w2.median - w1.median) / w1.median * 100).toFixed(0);
    md.push(`- ${c.id} ${c.mk} ${c.trim}: our W2 vs W1 ${mv >= 0 ? "+" : ""}${mv}% | HVT quarterly ${c.qc || "n/a"}`);
  }
  md.push(``);
  fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
  console.log(`\nWrote gas_100.csv (${csv.length - 1} rows), ${Object.keys(rec).length} receipts, summary.md`);
  console.log(`comparable=${comparable.length} excluded=${excluded.length} coverage=${coverage.length} | inside=${inside} above=${above} below=${below} | scopeFlags=${scopeFlags.length}`);
})();
