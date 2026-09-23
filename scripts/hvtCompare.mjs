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

// generation year bounds for the +/-2 widen (widen never crosses these)
const GEN = { C2:[1963,1967],C4:[1984,1996],C5:[1997,2004],C6:[2005,2013],C7:[2014,2019],C8:[2020,2026],
  e30:[1986,1991],e36:[1992,1999],e46:[2000,2006],e28:[1985,1988],e39:[1998,2003],
  "901":[1964,1973],"930":[1974,1989],"964":[1989,1994],"993":[1994,1998],"996":[1999,2004],"997":[2005,2012],"991":[2012,2019],
  A80:[1993,1998],FD:[1993,1995],Z32:[1990,1996],NA1:[1991,2001],NA2:[2002,2005],R35:[2009,2030],F82:[2014,2020],
  S197:[2005,2014],S550:[2015,2023],VX:[2013,2017],"981":[2013,2016],R107:[1972,1989],S1:[1961,1968],"105":[1963,1977],
  "2005":[2005,2006],G50:[1987,1989],SR1:[1992,1995],ZB2:[2003,2010],"1st":[1966,1977],"2nd":[1970,1981],"3rd":[1982,1992],
  Fox:[1979,1993],W113:[1963,1971],"356C":[1964,1965] };

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

const post = (page, dsl) => page.evaluate(async d => { const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desk: true, action: "run", dsl: d }) }); return await r.json().catch(() => null); }, dsl);
function dslFor(m, yMin, yMax) {
  const f = { make: m.make, model: m.model, window: "36mo", year_min: yMin, year_max: yMax };
  if (m.trim) f.trim = m.trim;
  if (m.body) f.body = m.body;   // Desk buildSpec detects body from searchText; trim carries most scoping
  return { filters: f, groupBy: [], measures: ["count", "median", "p25", "p75", "min", "max"] };
}
async function fetchScoped(page, m, yMin, yMax) {
  let res = null;
  for (let a = 0; a < 4 && !(res && res.status === "ok"); a++) { res = await post(page, dslFor(m, yMin, yMax)); if (!(res && res.status === "ok")) await new Promise(r => setTimeout(r, 900 * (a + 1))); }
  if (!(res && res.status === "ok")) return { ok: false, receipts: [], total: null };
  let receipts = (res.receipts || []).filter(r => !r.excluded);
  // car-2 fuelie + per-car halo title excludes
  const halo = HALO[Number(m.car_id)];
  let haloDropped = 0;
  if (halo) { const before = receipts.length; receipts = receipts.filter(r => !halo.test(r.title || "")); haloDropped = before - receipts.length; }
  return { ok: true, receipts, total: res.answer && res.answer.total, haloDropped, capped: (res.answer && res.answer.total) != null && (res.receipts || []).length < res.answer.total };
}

(async () => {
  fs.rmSync(path.join(OUT, "receipts"), { recursive: true, force: true });
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
    let yMin = y, yMax = y, yLabel = "exact " + y;
    let f = await fetchScoped(page, m, yMin, yMax);
    let w1 = f.receipts.filter(r => inWin(r, "W1"));
    if (f.ok && w1.length < 8) {
      const g = GEN[m.generation] || [y - 2, y + 2];
      yMin = Math.max(g[0], y - 2); yMax = Math.min(g[1], y + 2); yLabel = `adjacent years pooled (${yMin}-${yMax})`;
      f = await fetchScoped(page, m, yMin, yMax);
    }
    const priced = f.receipts.map(r => ({ ...r, _p: basisPrice(r) })).filter(r => r._p.usd);
    const houseShare = priced.length ? priced.filter(r => HOUSES.has(r.venue)).length / priced.length : 0;
    const basisLabel = !priced.length ? "n/a" : houseShare === 1 ? "buyer-paid (houses)" : houseShare === 0 ? "sold+fee (online)" : `mixed (${Math.round(houseShare*100)}% house buyer-paid, rest sold+fee)`;
    // windows
    const win = {};
    for (const wk of ["W1", "W2", "W3"]) { const rows = priced.filter(r => inWin(r, wk)); const vals = rows.map(r => r._p.usd); const n = rows.length, thin = n < 8;
      win[wk] = { n, thin, median: thin ? null : med(vals), p25: thin ? null : pct(vals, .25), p75: thin ? null : pct(vals, .75), min: thin ? null : Math.min(...vals), max: thin ? null : Math.max(...vals) };
      csv.push([id, y, JSON.stringify(m.make + " " + (m.model + (m.trim ? " " + m.trim : ""))), status, yLabel, wk, basisLabel, n, thin ? "yes" : "no", win[wk].median ?? "", win[wk].p25 ?? "", win[wk].p75 ?? "", win[wk].min ?? "", win[wk].max ?? ""]); }
    // receipts file
    fs.writeFileSync(path.join(OUT, "receipts", id + ".json"), JSON.stringify({ car_id: id, listed: `${y} ${m.make} ${m.model} ${m.trim}`.trim(), status, year_scope: yLabel, basis: basisLabel, scope: dslFor(m, yMin, yMax).filters, halo_dropped: f.haloDropped || 0, sales: priced.map(r => ({ date: r.date, venue: r.venue, price_usd: r._p.usd, basis: r._p.basis, hammer_usd: r.hammer_usd, native: r.buyer_paid, year: r.year, url: r.link, chassis: r.chassis, title: r.title })) }, null, 1) + "\n");
    // POOL CHECK (every car): count, model-year range, venues, cheapest/median/dearest titles
    const yrs = priced.map(r => r.year).filter(Boolean).sort((a, b) => a - b);
    const venues = [...new Set(priced.map(r => r.venue))];
    const sorted = priced.slice().sort((a, b) => a._p.usd - b._p.usd);
    const mid = sorted[Math.floor(sorted.length / 2)];
    poolChecks.push({ id, listed: `${y} ${m.make} ${m.model} ${m.trim}`.trim(), status, n: priced.length, capped: f.capped, haloDropped: f.haloDropped || 0, yrange: yrs.length ? yrs[0] + "-" + yrs[yrs.length - 1] : "-", venues,
      cheapest: sorted[0] ? `${money(sorted[0]._p.usd)} ${(sorted[0].title||"").slice(0,50)}` : "-",
      median: mid ? `${money(mid._p.usd)} ${(mid.title||"").slice(0,50)}` : "-",
      dearest: sorted.length ? `${money(sorted[sorted.length-1]._p.usd)} ${(sorted[sorted.length-1].title||"").slice(0,50)}` : "-" });
    // scope-failure heuristics
    if (!f.ok) scopeFlags.push(`car ${id} ${m.make} ${m.model}: query error`);
    else if (priced.length === 0 && status !== "coverage") scopeFlags.push(`car ${id} ${m.make} ${m.model} ${m.trim}: ZERO qualifying sales (scope may be wrong)`);
    else if (f.capped) scopeFlags.push(`car ${id} ${m.make} ${m.model}: pool exceeds 300 (${f.total}); NOT fully counted`);
    else if (yrs.length && (yrs[0] < (GEN[m.generation]?.[0] || yMin) - 0 || yrs[yrs.length-1] > (GEN[m.generation]?.[1] || yMax))) scopeFlags.push(`car ${id} ${m.make} ${m.model}: year range ${yrs[0]}-${yrs[yrs.length-1]} outside expected scope`);
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
  const covPrior = perCar.filter(p => p.priced.some(r => r.chassis)).length;
  const md = [];
  md.push(`# HVT-100 comparison — our side (archive only, zero OCD)`, ``, `Generated ${TODAY}. Windows: W1 ${W.W1[0]}..${W.W1[1]}, W2 ${W.W2[0]}..${W.W2[1]}, W3 last 36 months. Scoping: One Box path (buildSpec/fetchQualifying/isQualifying) via the Desk. Year rule: exact model year if W1>=8 else +/-2 within generation ("adjacent years pooled"), W1 scope applied to all windows. Basis: auction houses buyer-paid; online sold price + buyer fee. Medians and quartiles only. No cap.`, ``);
  md.push(`## a) Scope-failure report (read first)`, scopeFlags.length ? scopeFlags.map(s => `- ${s}`).join("\n") : "- none", ``);
  md.push(`## c) Totals`,
    `- Comparable (in HVT): ${comp.length} | with a non-thin W1 median: ${compN} | thin/no-value: ${comp.length - compN}`,
    `- Excluded (no matching HVT car): ${excl.length} -> ${excl.map(p => p.id + " " + p.m.model + " " + p.m.trim).join("; ")}`,
    `- Coverage-only (not in HVT): ${cov.length} -> ${cov.map(p => p.id + " " + p.m.model + " " + p.m.trim).join("; ")}`,
    `- Vs HVT #3 Lo-Hi band: ${inside} inside, ${above} above, ${below} below`,
    `- Prior-sale coverage (>=1 sale carries a VIN/chassis): ${covPrior} of ${perCar.length}`, ``);
  md.push(`## b) Per car: HVT #3 vs our W1 median`, rowsB.join("\n"), ``);
  md.push(`## d) Dispersion: our p25-p75 vs HVT #3 Lo-Hi`, rowsD.join("\n"), ``);
  md.push(`## e) Lag: our W2-vs-W1 move vs HVT printed quarterly change`, rowsE.length ? rowsE.join("\n") : "- (no car had non-thin W1 and W2)", ``);
  md.push(`## f) Pool check (every car)`, `car | status | n | halo-dropped | model-year range | venues | cheapest / median / dearest`);
  for (const pc of poolChecks) md.push(`- **${pc.id}** ${pc.listed} [${pc.status}] n=${pc.n}${pc.capped?" CAPPED":""} halo-dropped=${pc.haloDropped} yrs=${pc.yrange} venues=${pc.venues.join(",")||"-"}\n    - cheapest: ${pc.cheapest}\n    - median: ${pc.median}\n    - dearest: ${pc.dearest}`);
  md.push(``);
  fs.writeFileSync(path.join(OUT, "summary.md"), md.join("\n") + "\n");
  console.log(`\nWrote gas_100.csv (${csv.length - 1} rows), ${perCar.length} receipts, summary.md`);
  console.log(`comparable=${comp.length} (nonthin ${compN}) excluded=${excl.length} coverage=${cov.length} | inside=${inside} above=${above} below=${below} | scopeFlags=${scopeFlags.length} | priorSaleCoverage=${covPrior}`);
})();
function inWin(r, wk) { const [a, b] = W[wk]; return r.date && r.date >= a && r.date <= b; }
