// clock: real-ok the fixture sales are dated relative to now (Lane B, Nov 2026)
import fs from "fs"; import os from "os"; import path from "path"; import { spawnSync } from "child_process"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.includes("--mutants")) {
  const OB = "lib/onebox.js", muts = [
    [OB, "if (wideH && wideH.wideCause === \"mods\" && !(refine && refine.mods)) {", "if (false) {", "(1) the pills are never built"],
    [OB, "if (refine.mods === \"modified\") rows = rows.filter(isModRow);", "if (refine.mods === \"modified\") rows = rows.filter(r => !isModRow(r));", "(2) the Modified pill narrows to the other side"],
    [OB, "x.g.dimension !== \"year\" && x.g !== modsG && x.gap >= SPLIT_MEDIAN_PCT / 100);", "x.g.dimension !== \"year\" && x.gap >= SPLIT_MEDIAN_PCT / 100);", "(1) the pills withhold the pooled headline"],
    [OB, "if (dimension === \"mods\") return value === \"modified\" || value === \"original\" ? { mods: value } : null;", "", "(1) a pill sends back no refine"],
    [OB, "if (refine.mods === \"modified\" || refine.mods === \"original\") out.push({ kind: \"mods\"", "if (false) out.push({ kind: \"mods\"", "(2) the narrowed answer does not say so"],
    [OB, "(/year_widened|generation|model_any_year|any_year/.test(String(d.fallbackRung || \"\")) || yearWide)", "(/year_widened|generation|model_any_year|any_year/.test(String(d.fallbackRung || \"\")))", "(3) a wide line that names the years has no year pills"],
    [OB, "mod: isModRow(r) })", "mod: false })", "(3) the wide line stops counting modified cars (the pills would name a line that is gone)"],
    ["lib/live/search.js", "\"docHistory\", \"mods\",", "\"docHistory\",", "(4) the answer cache does not tell the sides apart"],
    ["api/sellerDecision.js", "mods: rawRefine.mods === \"modified\" ? \"modified\" :", "mods: null && rawRefine.mods === \"modified\" ? \"modified\" :", "(4) the page's refine is dropped on the way in"],
    ["api/partnerAnswer.js", "if (r.mods === \"modified\" || r.mods === \"original\") o.mods = r.mods;", "", "(4) the partner page drops the refine"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", path.join(here, "..") + "/", dir + "/"]); fs.symlinkSync(path.join(here, "..", "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/modsPillCheck.mjs"), dir], { encoding: "utf8", timeout: 120000 }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let MAKE="Datsun", MODEL="240Z";
let rows = [], n = 0;
const sale = (year, date, price, mi, title, mods) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rw" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: MAKE, model: MODEL, year, listing_title: title || `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi || 60000), body_style: null, modifications: mods || null, title: title || `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
// MODIFIED AND ORIGINAL AS A NARROW BY DIMENSION (Lane B, Nov 9 2026). The 1972 Datsun 240Z read "The range is wide because 14 of the 17 sales are modified cars" and gave no way to split them.
//   (1) when the wide line names modified cars and 3 or more of each side are in the pool: both pills, with counts and a range for each (or "too few for a range"); the headline stays the whole pool
//   (2) the pill's refine narrows the pool to that side, the answer says so (applied filter) and the filter can be cleared
//   (3) the CLASS: every pool whose wide line names modified cars gets the pills, and a pool whose line does not gets none (a sweep of pool shapes); every wide reason the engine names has a pill
//   node scripts/modsPillCheck.mjs [repo root]     --mutants proves each rule by breaking it in a copy
const day2 = i => day(10 + i * 7);
const world = (mods, orig, o = {}) => { MAKE = "Datsun"; MODEL = "240Z"; rows = []; n = 0;
  for (let i = 0; i < mods; i++) sale(o.year || 1972, day2(i % 40), 12000 + i * 2000, 60000, "1972 Datsun 240Z", "Koni shocks, aftermarket stereo, 15-inch wheels");
  for (let i = 0; i < orig; i++) sale(o.year || 1972, day2(i % 40), 34000 + i * 1500, 60000, "1972 Datsun 240Z", null);
  return E.oneEngineAnswer({ make: "Datsun", model: "240Z", year: 1972, bodyStyle: null }, null, "1972 Datsun 240Z", { ...env, asked: 2 }, o.refine || null).then(a => a && a.raw); };
const pills = d => [...(d.options || []), ...(d.refineOptions || [])].filter(o => o && o.dimension === "mods");
{ // (1) the 240Z
  const d = await world(14, 3);
  ok("(1) the wide line names the modified cars", d && d.wideCause === "mods" && /^The range is wide because 14 of the 17 sales are modified cars\.$/.test(d.wideLine || ""), JSON.stringify(d && [d.tier, d.wideCause, d.wideLine, d.poolN]));
  const p = pills(d), mo = p.find(o => o.value === "modified"), og = p.find(o => o.value === "original");
  ok("(1) both pills, Modified 14 and Original 3, each with the refine a click sends back", mo && og && mo.n === 14 && og.n === 3 && mo.refine && mo.refine.mods === "modified" && og.refine && og.refine.mods === "original", JSON.stringify(p.map(o => o.refine)));
  ok("(1) the headline stays the whole pool: one range over all 17, no split state", d.poolN === 17 && Array.isArray(d.cluster) && d.optionsState === "alike" && d.headlineLines.length === 0, JSON.stringify([d.poolN, d.cluster, d.optionsState]));
  const lines = d.optionLines || [];
  ok("(1) a range for Modified (14 sales) and 'too few for a range' for Original (3 sales)", lines.some(l => /^Modified \$[\d,]+ to \$[\d,]+, 14 sales/.test(l)) && lines.some(l => /^Original, 3 sales, too few for a range$/.test(l)), JSON.stringify(lines));
  ok("(1) the pill's own range is the engine's: Modified low and high are the option's, Original has none (no number made for the thin side)", mo.low > 0 && mo.high > mo.low && og.low === null && og.high === null && og.rangeFloor === true);
}
{ // (1b) both sides have a range of their own: still one pooled headline, never the split or apart state (the headline stays the whole pool)
  const d = await world(10, 10), p = pills(d);
  ok("(1b) 10 modified and 10 original, each with a range: the pooled range stands over all 20, the options are lines under it", d.wideCause === "mods" && d.poolN === 20 && Array.isArray(d.cluster) && d.optionsState === "alike" && d.headlineLines.length === 0 && p.length === 2 && p.every(o => o.low > 0 && o.high > o.low), JSON.stringify([d.wideCause, d.poolN, d.optionsState, d.headlineLines, p.map(o => [o.n, o.low, o.high])]));
}
{ // (2) a click: the pool is that side, the answer says so, the filter clears
  const m = await world(14, 3, { refine: { mods: "modified" } }), o = await world(14, 3, { refine: { mods: "original" } });
  ok("(2) Modified: the pool is the 14 modified sales and the answer says 'Modified cars'", m.poolN === 14 && (m.appliedFilters || []).some(f => f.kind === "mods" && f.words === "Modified cars" && f.clear && !f.clear.mods) && /Modified cars/.test(m.appliedLine || ""), JSON.stringify([m.poolN, m.appliedLine]));
  ok("(2) Original: the pool is the 3 original sales, thin, and the answer says 'Original cars'", o.poolN === 3 || (o.cards || []).length === 3, JSON.stringify([o.tier, o.poolN, (o.cards || []).length, o.appliedLine]));
  ok("(2) a narrowed pool offers no Modified and Original pills again", pills(m).length === 0 && pills(o).length === 0);
}
{ // (3) THE CLASS: whatever pool the wide line says is wide because of modified cars has the pills, and no other pool does
  let named = 0, shapes = 0; const bad = [];
  for (const [a, b] of [[14, 3], [8, 8], [3, 14], [10, 4], [2, 15], [15, 2], [17, 0], [0, 17], [5, 5], [12, 6]]) {
    const d = await world(a, b); shapes++; if (!d || d.tier !== "result") continue;
    const p = pills(d), isMods = d.wideCause === "mods"; if (isMods) named++;
    const both = p.length === 2 && p.every(o => o.n >= 3) && p.reduce((t, o) => t + o.n, 0) === d.poolN;
    if (isMods && !both) bad.push(a + "/" + b + " names modified cars and has " + p.length + " pills"); if (!isMods && p.length) bad.push(a + "/" + b + " has pills and does not name modified cars");
  }
  ok(`(3) the class: every pool shape whose wide line names modified cars gets both pills with counts that add to the pool, and no other does (${named} of ${shapes} shapes name them; wrong: ${bad.join("; ") || "none"})`, named >= 3 && bad.length === 0);
  // every wide reason the engine names has a pill dimension: mods (above), mileage (mileage bands), year (years), period (the chart, no pill: the period is a time span the chart already shows)
  const yrs = [], y0 = 1970; let id = 0;
  for (let y = 0; y < 5; y++) for (let k = 0; k < 6; k++) { id++; yrs.push({ id: "y" + id, year: y0 + y, _usd: 12000 + y * 4000 + k * 7000, mi: 60000 + k, source: "bringatrailer", date: "2026-0" + (1 + (k % 6)) + "-10" }); }
  const prices = yrs.map(r => r._usd).sort((a, b) => a - b), q = f => prices[Math.floor((prices.length - 1) * f)];
  const dd = { tier: "result", cluster: [q(0.25), q(0.75)], rawPool: yrs, cards: yrs.map(r => ({ id: r.id, price: r._usd })), poolN: yrs.length, fallbackRung: "exact", resolvedCar: { year: 1972, make: "Datsun", model: "240Z" }, windowMonths: 12, windowWords: "over the last 12 months" };
  const wide = E.wideOf(dd.rawPool, dd.cluster), yd = E.pooledApartGuard(dd, null), yp = [...(yd.options || []), ...(yd.refineOptions || [])].filter(o => o.dimension === "year");
  ok("(3) the class: a wide line that names the years (on a set that was not widened) has the years as pills, and the headline stays the whole pool", wide.wideCause === "year" && yp.length >= 2 && yp.every(o => o.refine && o.refine.year) && Array.isArray(yd.cluster) && yd.optionsState === "alike" && yd.headlineLines.length === 0, JSON.stringify([wide.wideCause, yd.optionsState, yp.map(o => o.value), yd.cluster]));
  // the period reason names a time span the chart shows; it is a chart, not a pool dimension, so it has no pill. No wide line names a body: the bodies are the apart state's own test.
  const reasons = [...new Set((fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8").match(/wideCause: "([a-z]+)"/g) || []).map(x => x.slice(12, -1)))].filter(x => x !== "none");
  const HAS_PILL = { mods: "mods pills (here)", mileage: "mileage bands", year: "year pills (here)", period: "the chart (no pool dimension)" };
  ok(`(3) the class: every wide reason the engine names has a pill or a stated reason it has none (${reasons.join(", ")})`, reasons.every(r => HAS_PILL[r]) && reasons.length >= 4, reasons.filter(r => !HAS_PILL[r]).join(","));
}

{ // (4) THE REFINE REACHES THE ENGINE: the answer cache, the page's sanitizer and the partner page all carry it
  const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href), v = { make: "Datsun", model: "240Z", year: 1972 };
  const k0 = S.specKeyFor(v, null, null), k1 = S.specKeyFor(v, null, { mods: "modified" }), k2 = S.specKeyFor(v, null, { mods: "original" });
  ok("(4) the answer cache keys the bare pool, the Modified pool and the Original pool apart", new Set([k0, k1, k2]).size === 3);
  const sd = fs.readFileSync(path.join(root, "api/sellerDecision.js"), "utf8"), pa = fs.readFileSync(path.join(root, "api/partnerAnswer.js"), "utf8");
  ok("(4) the page's refine sanitizer (sellerDecision) and the partner page's keep mods, and nothing else is made of it", /mods: rawRefine\.mods === "modified" \? "modified" : rawRefine\.mods === "original" \? "original" : null/.test(sd) && /if \(r\.mods === "modified" \|\| r\.mods === "original"\) o\.mods = r\.mods;/.test(pa));
}

console.log(failed ? "\nmodsPillCheck: " + failed + " FAIL" : "\nmodsPillCheck: all pass"); process.exit(failed ? 1 : 0);
