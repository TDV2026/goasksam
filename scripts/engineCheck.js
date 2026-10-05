// engineCheck: run the same rows through every SURFACE and fail when two surfaces disagree on the
// car, the tier, or halo exclusion. The goal of the consolidation work is one engine behind every
// screen; this is the net that catches a surface drifting off it.
//
// Surfaces per row:
//   - One Box   : POST /api/sellerDecision { oneBox:true } (archive-only, ZERO OCD).
//   - /sell     : POST /api/sellerDecision as the wizard posts it (car.raw + region/state +
//                 acceptModelLevel) PLUS archiveOnly:true. This is the REAL deployed /sell engine the
//                 wizard calls (same classification, ladder and decision), but archiveOnly forces it to
//                 read the permanent store/archive instead of a live OCD fetch, so the harness makes
//                 ZERO OCD requests. The rendered-screen agreement is covered separately by the PNG proofs.
//   - Desk      : POST /api/sellerDecision { archiveQuery:"pool" } for the row's title (archive-only)
//                 where the row resolves there; reported, never the disagreement trigger.
//
// Per surface we emit { resolvedCar, tier, poolCount, halosExcluded, range }.
// FAIL a row if One Box and /sell disagree on resolvedCar (make+model) or normalized tier or halo
// exclusion. poolCount and range are compared with tolerance (OCD-freshness vs archive, $500 band
// overlap) and reported as a WARNING, not a failure, until Step 3 unifies the pool.
//
// The harness itself makes ZERO OCD requests: every surface is archive-only - One Box and Desk by
// their own paths, and /sell via archiveOnly:true (store/archive read, no live OCD fetch).
//
// Run: node scripts/engineCheck.js   (needs Chrome + crew cookie; bypass secret optional)

import puppeteer from "puppeteer-core";

const BASE = process.env.ENGINE_CHECK_BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || "";

// make -> halo/other-model tokens that must NEVER appear as a comp for the base model (One Box
// HALO_PATTERNS, restated here so the harness can assert exclusion from the rendered cards).
const HALO = {
  ferrari: /enzo|laferrari|superamerica|barchetta|\bf40\b|\bf50\b|monza\s?sp|daytona\s?sp|sesto|288\s?gto|599\s?gto|250\s?gto/i,
  porsche: /gt3\s?rs|gt2\s?rs|\bgt2\b|sport\s?classic|\bs\/t\b/i,
  bmw: /\bcsl\b|sport\s?evolution|cecotto|\bcrt\b/i,
  chevrolet: /zr1|z06|zl1|callaway/i,
  mercedes: /black\s?series/i
};

const ROWS = [
  { q: "2000 Ferrari 550 Maranello", make: "ferrari" },
  { q: "1902 Pierce Motorette", make: "pierce" },
  { q: "1931 Duesenberg Model J", make: "duesenberg" },
  { q: "1913 Mercer Raceabout", make: "mercer" },
  { q: "1988 BMW E30 M3", make: "bmw" },
  { q: "1995 Ferrari F355 GTS", make: "ferrari" },
  { q: "2005 Ford GT", make: "ford" },
  { q: "1957 Mercedes 300SL Roadster", make: "mercedes" },
  { q: "2008 Porsche 911 Carrera S", make: "porsche" },
  { q: "2015 Mercedes S-Class Coupe", make: "mercedes" },
  // class-era regression cars (Step 1): a model with zero archive sales must still class-era on both.
  { q: "1982 Cadillac Cimarron", make: "cadillac" },
  { q: "1974 Ford Pinto", make: "ford" },
  // Race/road trim-family discipline (items 1-2, Oct 2026). The queried trim IS a GT2, so the model-
  // wide porsche halo token ("gt2") is NOT a leak here (skipHalo); the poolGuard instead asserts the
  // family fence: a GT2 R pool shows ONLY GT2 R / GT2 Evo, and a road GT2 pool shows ONLY road GT2
  // (no R / Evo / Clubsport / RS). familyRe selects which rendered titles to judge.
  { q: "1997 Porsche 911 GT2 R", make: "porsche", skipHalo: true,
    poolGuard: { label: "GT2 R family only", familyRe: /\bgt2\b/i, mustMatch: /\bgt2\s*(?:r\b|evo)/i } },
  { q: "1997 Porsche 911 GT2", make: "porsche", skipHalo: true,
    poolGuard: { label: "road GT2 only", familyRe: /\bgt2\b/i, mustNotMatch: /\bgt2\s*(?:r\b|evo|clubsport)\b|\bgt2\s*rs\b/i } },
  // Shelby Cobra families (Oct 2026): each family is its own pool and never mixes. The queried family
  // IS a Cobra, so the make-wide check is not a leak (skipHalo); the poolGuard asserts the family fence
  // on every rendered title. The "42" row is a ONE-BOX ambiguity ask (obExpectTier), not a pool.
  { q: "1965 Shelby Cobra 427", make: "shelby", skipHalo: true,
    poolGuard: { label: "427 Cobra only", familyRe: /cobra/i, mustMatch: /\b427\b/i, mustNotMatch: /daytona|\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i } },
  { q: "1964 Shelby Cobra 289", make: "shelby", skipHalo: true,
    poolGuard: { label: "289 Cobra only", familyRe: /cobra/i, mustMatch: /\b(289|260)\b|\bmark\s?ii\b/i, mustNotMatch: /\b427\b|daytona|\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i } },
  { q: "Shelby Cobra CSX4000", make: "shelby", skipHalo: true,
    poolGuard: { label: "continuation (CSX) only", familyRe: /cobra/i, mustMatch: /\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i } },
  { q: "1965 Shelby Cobra 42", make: "shelby", obExpectTier: "choice" },
  // RANGE LADDER proof rows (Part 3): read the rangeTier column (cluster 16+ / band 8-15 / thin 3-7).
  // These are the deployed /onebox PNG subjects. rangeTier is reported, never a failure trigger.
  { q: "2023 Porsche 911 Carrera Coupe", make: "porsche" },          // dense -> cluster (16+)
  { q: "2017 Ferrari 812 Superfast", make: "ferrari" },              // mid-volume -> band/cluster
  { q: "2008 Porsche 911 Carrera S 85000 miles", make: "porsche" },  // mileage query: nearestInMiles when band is thin
  // VIN exact-car lookup (Oct 2026): reads sales_archive.vin_norm + auction_attempts.chassis_vin_norm.
  { q: "ZFF74UFA7E0196960", vinExpect: { make: "ferrari", minHistory: 2 } },   // 17-char VIN, 2 BaT sales
  { q: "E56S001824", vinExpect: { make: "chevrolet", minHistory: 2 } },        // pre-1981 chassis, 2 BaT sales
  { q: "ZFF74UFA6E0199705", vinExpect: { absent: true } }                       // reported VIN: genuinely not in the archive
];

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const carKey = c => c ? `${norm(c.make)}|${norm(c.model)}` : "?";

// Coarse, surface-independent tier so One Box and /sell can be compared on the same vocabulary.
function obTier(d) {
  if (!d || d.status === "data_unavailable" || d.tier === "unavailable") return "unavailable";
  if (["body_choice", "model_choice", "generation_choice", "gearbox_choice", "variant_choice", "needs_clarification"].includes(d.tier)) return "choice";
  if (d.tier === "not_tracked") return "not_tracked";
  if (d.tier === "class_era") return "class_era";
  if (d.tier === "thin") return "thin";
  if (d.tier === "result") return "result";
  return d.tier || "?";
}
function sellTier(d) {
  if (!d || d.status === "data_unavailable") return "unavailable";
  const dec = d.decision || {};
  if (dec.classEra) return "class_era";
  if (dec.thin && dec.thin.isThin) return "thin";
  if (d.status === "needs_clarification" || d.status === "needs_confirmation") return "choice";
  if (d.status === "decision_ready") return "result";
  return d.status || "?";
}
function obCar(d) { const c = d && d.resolvedCar; return c && c.make ? { make: c.make, model: c.model } : null; }
function sellCar(d) { const c = d && d.vehicle; return c && c.make ? { make: c.make, model: c.model } : null; }

// RANGE LADDER tier (Part 3): the One Box pool-size bucket (cluster 16+ / band 8-15 / thin 3-7 /
// single 1-2 / none 0). Reported, never a failure trigger (/sell has a different decision shape).
function obRangeTier(d) { return (d && d.rangeTier) || (d && d.thin ? "thin" : null); }
function obPool(d) { return d && (d.poolN != null ? d.poolN : (d.thin && d.thin.totalN)) || null; }
function sellPool(d) { const dec = d && d.decision || {}; return (dec.thin && dec.thin.totalN) != null ? dec.thin.totalN : (dec.priceBand && dec.priceBand.count) != null ? dec.priceBand.count : null; }
function obRange(d) { return Array.isArray(d && d.span) ? d.span : null; }
function sellRange(d) { const dec = d && d.decision || {}; if (Array.isArray(dec.thin && dec.thin.span)) return dec.thin.span; if (dec.priceBand) return [dec.priceBand.low, dec.priceBand.high]; return null; }

// Halo exclusion: scan every title the surface would render; true when none match the make's halo set.
function haloExcluded(titles, make) {
  const re = HALO[norm(make).replace(/benz$/, "").replace("mercedes", "mercedes")] || HALO[norm(make)] || null;
  if (!re) return true;
  return !titles.some(t => re.test(String(t || "")));
}
function obTitles(d) {
  const out = [];
  for (const c of (d.cards || [])) out.push(c.title);
  const rep = d.representative || {}; for (const k of ["closest", "high", "low"]) if (rep[k]) out.push(rep[k].title);
  for (const set of [d.thin && d.thin.receipts, d.htMeta && d.htMeta.receipts]) if (Array.isArray(set)) for (const r of set) out.push(r.title);
  return out.filter(Boolean);
}
function sellTitles(d) {
  const dec = d && d.decision || {}; const out = [];
  for (const src of [dec.thin && dec.thin.receipts, dec.classEra && dec.classEra.receipts, dec.houseComparison && dec.houseComparison.houses]) {
    if (!Array.isArray(src)) continue;
    for (const x of src) { if (x.title) out.push(x.title); if (Array.isArray(x.receipts)) for (const r of x.receipts) out.push(r.title); }
  }
  return out.filter(Boolean);
}

const within500 = (a, b) => { if (!a || !b) return null; const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return hi >= lo - 500; };

async function main() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
  const p = await b.newPage();
  await p.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
  if (BYPASS) await p.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "samesitenone" });
  await p.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });

  const call = (body) => p.evaluate(async (base, body) => {
    const r = await fetch(base + "/api/sellerDecision", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    try { return await r.json(); } catch (e) { return { status: "parse_error" }; }
  }, BASE, body);
  // The One Box VIN exact-car match is computed by /api/vehicleIdentity (vinResolve), so a VIN row
  // asserts on that response's vinArchiveMatch (sales + unsold attempts in a date-ordered history).
  const callVI = (text) => p.evaluate(async (base, text) => {
    const r = await fetch(base + "/api/vehicleIdentity", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    try { return await r.json(); } catch (e) { return { status: "parse_error" }; }
  }, BASE, text);

  const results = [];
  for (const row of ROWS) {
    const anon = "ec-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
    // VIN exact-car rows: assert the archive match (zero OCD) rather than the cross-surface pool.
    if (row.vinExpect) {
      const vi = await callVI(row.q);
      const m = vi && vi.vinArchiveMatch;
      const hist = (m && m.history) || [];
      const fails = [];
      const got = { make: m && m.make ? String(m.make).toLowerCase() : null, history: hist.length, sales: (m && m.count) || 0, attempts: (m && m.attemptCount) || 0 };
      if (row.vinExpect.absent) {
        if (m) fails.push(`expected NO archive match, got ${got.make} with ${got.history} record(s)`);
      } else {
        if (!m) fails.push("no vinArchiveMatch");
        else {
          if (row.vinExpect.make && got.make !== row.vinExpect.make) fails.push(`make ${got.make} != ${row.vinExpect.make}`);
          if (row.vinExpect.minHistory && hist.length < row.vinExpect.minHistory) fails.push(`history ${hist.length} < ${row.vinExpect.minHistory}`);
        }
      }
      results.push({ q: row.q, vin: true, got, fails, warns: [] });
      continue;
    }
    let ob = null, sell = null, desk = null;
    try { ob = await call({ oneBox: true, anonId: anon + "o", car: { raw: row.q } }); } catch (e) { ob = { status: "err" }; }
    try { sell = await call({ anonId: anon + "s", archiveOnly: true, car: { raw: row.q, region: "US", state: "California", acceptModelLevel: true } }); } catch (e) { sell = { status: "err" }; }
    try { desk = await call({ archiveQuery: "pool", terms: [String(row.q).replace(/^\d{4}\s+/, "").split(/\s+/).slice(1).join(" ") || row.q], dateFrom: "2023-01-01", dateTo: "2027-12-31" }); } catch (e) { desk = null; }

    const obT = { car: obCar(ob), tier: obTier(ob), rangeTier: obRangeTier(ob), pool: obPool(ob), halo: haloExcluded(obTitles(ob), row.make), range: obRange(ob) };
    const seT = { car: sellCar(sell), tier: sellTier(sell), pool: sellPool(sell), halo: haloExcluded(sellTitles(sell), row.make), range: sellRange(sell) };
    const deskN = desk && Array.isArray(desk.rows) ? desk.rows.length : null;

    const fails = [], warns = [];
    // One-Box-only expectation (e.g. an ambiguous-family ASK): assert the One Box tier and skip the
    // cross-surface comparison (the family clarify is a One Box behaviour; /sell routes differently).
    if (row.obExpectTier) {
      if (obT.tier !== row.obExpectTier) fails.push(`ob tier ${obT.tier} != expected ${row.obExpectTier}`);
      results.push({ q: row.q, obT, seT, deskN, fails, warns });
      continue;
    }
    if (carKey(obT.car) !== carKey(seT.car)) fails.push(`car ${carKey(obT.car)} vs ${carKey(seT.car)}`);
    if (obT.tier !== seT.tier) fails.push(`tier ${obT.tier} vs ${seT.tier}`);
    if (!row.skipHalo && (!obT.halo || !seT.halo)) fails.push(`halo leak (ob=${obT.halo} sell=${seT.halo})`);
    // Per-row trim-family pool guard (items 1-2): every rendered title the fence selects must obey the
    // family rule on BOTH surfaces, or a race car leaked into a road pool (or vice versa).
    if (row.poolGuard) {
      const g = row.poolGuard;
      // De-glue a garbled raw title ("GT2 RGT2 R" -> "GT2 R") so a malformed title can't false-pass
      // the guard the same way it once defeated the fence.
      const degl = s => String(s || "").replace(/\b([A-Za-z])([A-Za-z]*\d[A-Za-z0-9]*)\s+\1\b/g, "$2 $1")
        .replace(/\b((?:[A-Za-z0-9][A-Za-z0-9/.\-]*\s+){0,2}[A-Za-z0-9][A-Za-z0-9/.\-]*)(?:\s+\1\b)+/ig, "$1").replace(/\s{2,}/g, " ").trim();
      for (const [surf, titles] of [["OB", obTitles(ob)], ["SELL", sellTitles(sell)]]) {
        for (const raw of titles) {
          const t = degl(raw);
          if (!g.familyRe.test(t)) continue;
          if (g.mustMatch && !g.mustMatch.test(t)) fails.push(`${g.label}: ${surf} leaked "${raw}"`);
          if (g.mustNotMatch && g.mustNotMatch.test(t)) fails.push(`${g.label}: ${surf} leaked "${raw}"`);
        }
      }
    }
    if (obT.pool != null && seT.pool != null && Math.abs(obT.pool - seT.pool) > Math.max(5, obT.pool * 0.5)) warns.push(`pool ${obT.pool} vs ${seT.pool}`);
    if (obT.range && seT.range && within500(obT.range, seT.range) === false) warns.push(`range ${JSON.stringify(obT.range)} vs ${JSON.stringify(seT.range)}`);

    results.push({ q: row.q, obT, seT, deskN, fails, warns });
  }
  await b.close();

  console.log("\nengineCheck vs " + BASE + "  (OB=One Box archive, SELL=/sell engine, Desk pool count; zero OCD from harness)\n");
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const rng = a => Array.isArray(a) && a[0] != null && a[1] != null ? "$" + Math.round(a[0] / 1000) + "k-" + Math.round(a[1] / 1000) + "k" : "-";
  console.log(pad("row", 28) + pad("OB car|tier|rangeTier|pool|range", 46) + pad("SELL car|tier|pool|range", 40) + pad("desk", 6) + "verdict");
  console.log("-".repeat(150));
  let failN = 0;
  for (const r of results) {
    const v = r.fails.length ? "FAIL: " + r.fails.join("; ") : (r.warns.length ? "pass (warn: " + r.warns.join("; ") + ")" : "PASS");
    if (r.fails.length) failN++;
    if (r.vin) {
      const g = r.got;
      console.log(pad(r.q, 28) + pad(`VIN exact-car: make=${g.make} hist=${g.history} (sales ${g.sales}/attempts ${g.attempts})`, 80) + v);
      continue;
    }
    const obс = `${carKey(r.obT.car)}|${r.obT.tier}|${r.obT.rangeTier ?? "-"}|${r.obT.pool ?? "-"}|${rng(r.obT.range)}`;
    const seс = `${carKey(r.seT.car)}|${r.seT.tier}|${r.seT.pool ?? "-"}|${rng(r.seT.range)}`;
    console.log(pad(r.q, 28) + pad(obс, 46) + pad(seс, 40) + pad(r.deskN ?? "-", 6) + v);
  }
  console.log("\n" + (failN ? failN + " ROW(S) FAILED (surfaces disagree on car/tier/halo)" : "ALL ROWS AGREE on car, tier and halo exclusion"));
  process.exit(failN ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
