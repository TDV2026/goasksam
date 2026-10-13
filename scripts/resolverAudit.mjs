// RESOLVER AUDIT (Lane B2, Oct 2026). Finds, in bulk, the cars the shared resolver (resolveVehicle: Market Check and Sell)
// and the Buy path (parseQuery then resolveForBuy: Buy and Tasks) read differently or read wrongly.
//   node scripts/resolverAudit.mjs [--write]     prints counts by cause; --write rewrites docs/resolver-audit.md
// OFFLINE: every fetch is refused and Supabase points at a dead port, so only the curated data answers (lib/vehicleData.js,
// lib/generations.js). No vendor request, no database read. Too slow for prePush by design; the pinned cases that were
// fixed live in scripts/resolverLanesCheck.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
globalThis.fetch = async () => { throw new Error("offline"); };
const origLog = console.log, origWarn = console.warn, origErr = console.error;
const quiet = () => { console.log = console.warn = console.error = () => {}; };
const loud = () => { console.log = origLog; console.warn = origWarn; console.error = origErr; };
const D = await import("../lib/vehicleData.js");
const { CURATED_GENERATIONS } = await import("../lib/generations.js");
const { resolveVehicle } = await import("../lib/vehicle.js");
const { resolveForBuy, parseQuery } = await import("../lib/live/search.js");
import fs from "node:fs";

const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const title = s => String(s).split(/(\s+|-)/).map(w => w && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w).join("");

// ---------------------------------------------------------------- 1. the list of every car the resolver knows
const pairs = new Map();   // squash(make|model) -> { make, model, trims:Set, year, typed:Set }
const add = (make, model, extra = {}) => {
  if (!make || !model) return;
  const k = squash(make) + "|" + squash(model);
  let p = pairs.get(k);
  if (!p) { p = { make, model, trims: new Set(), years: [], typed: new Set() }; pairs.set(k, p); }
  if (extra.trim) p.trims.add(extra.trim);
  if (extra.year) p.years.push(extra.year);
  if (extra.typed) p.typed.add(extra.typed);
  return p;
};
for (const g of CURATED_GENERATIONS) { const p = add(g.make, g.model); p.years.push(Math.round((g.yearStart + Math.min(g.yearEnd, 2026)) / 2)); }
for (const a of D.MODEL_ALIASES) add(a.make, a.model, { trim: a.trim, typed: a.alias });
for (const o of D.MODEL_OWNERSHIP) for (const mk of o.makes) add(mk, o.model, { typed: o.aliases[0] });
for (const r of D.PRODUCTION_RULES) { const y = r.ranges && r.ranges[0]; add(r.make, r.model, { year: y ? Math.round((y[0] + Math.min(y[1], 2026)) / 2) : null }); }
for (const [mk, models] of Object.entries(D.CURATED_MODELS)) for (const m of models) add(title(mk), m);
for (const [mk, m] of Object.entries(D.SINGLE_MODEL_MAKES)) add(title(mk), m);
for (const t of D.PORSCHE_911_TRIMS) add("Porsche", "911", { trim: t });
// Names from the earlier jobs and the launch list, so they stay in the audit.
const SEEDS = [["Datsun", "240Z"], ["Datsun", "260Z"], ["Datsun", "280Z"], ["Datsun", "280ZX"], ["Nissan", "300ZX"], ["Toyota", "2000GT"], ["Mazda", "RX-7"], ["Mazda", "RX-8"], ["Toyota", "MR2"], ["Acura", "NSX"], ["Honda", "S2000"], ["Nissan", "GT-R"], ["Nissan", "350Z"], ["Nissan", "370Z"], ["Toyota", "Supra"], ["Mitsubishi", "Lancer Evolution"], ["Subaru", "WRX"], ["Jaguar", "E-Type"], ["Jaguar", "XK120"], ["Triumph", "TR6"], ["MG", "MGB"], ["Lotus", "Esprit"], ["Lotus", "Elise"], ["Aston Martin", "DB5"], ["Ferrari", "Testarossa"], ["Ferrari", "F40"], ["Ferrari", "308"], ["Lamborghini", "Countach"], ["Lamborghini", "Diablo"], ["Lamborghini", "Miura"], ["Mercedes-Benz", "SLS AMG"], ["BMW", "Z3"], ["BMW", "Z4"], ["BMW", "1M"], ["Alfa Romeo", "8C"], ["Alfa Romeo", "Giulia"], ["Koenigsegg", "CCXR"], ["Mercedes-Benz", "CLK DTM"], ["Dodge", "Viper"], ["Ford", "Mustang"], ["Ford", "GT40"], ["Land Rover", "Defender"], ["Land Rover", "Range Rover"], ["Jeep", "Wrangler"], ["Toyota", "Land Cruiser"], ["Chevrolet", "Corvette"], ["BMW", "M3"], ["Porsche", "911"], ["Mercedes-Benz", "300SL"], ["Mercedes-Benz", "SL-Class"], ["Mercedes-Benz", "G-Class"], ["Mercedes-Benz", "C-Class"], ["Mercedes-Benz", "E-Class"], ["Ford", "Bronco"], ["Chevrolet", "Camaro"], ["Dodge", "Charger"], ["Dodge", "Challenger"], ["Pontiac", "GTO"], ["Ferrari", "250 GTO"], ["Ford", "F-150"], ["Chevrolet", "Chevelle"], ["Shelby", "Cobra"]];
for (const [mk, m] of SEEDS) add(mk, m);
// Typed trims that matter per model (spacing and edition forms below are generated from these).
const TRIM_SEEDS = [["Dodge", "Viper", "SRT-10"], ["Ford", "Mustang", "GT350"], ["Ford", "Mustang", "Shelby GT500"], ["Chevrolet", "Corvette", "Z06"], ["Chevrolet", "Corvette", "ZR1"], ["Chevrolet", "Camaro", "Z28"], ["Mazda", "MX-5 Miata", "Club"], ["Subaru", "WRX", "STI"], ["BMW", "M3", "CSL"], ["BMW", "M3", "Competition"], ["Porsche", "911", "GT3 RS"], ["Porsche", "911", "Turbo S"], ["Porsche", "911", "Carrera 4S"], ["Alfa Romeo", "Giulia", "Quadrifoglio"], ["BMW", "Z3", "M"], ["BMW", "Z4", "M"], ["Mercedes-Benz", "SL-Class", "SL55 AMG"], ["Mercedes-Benz", "C-Class", "C63 AMG"], ["Mercedes-Benz", "G-Class", "G63 AMG"], ["Mercedes-Benz", "CLK-Class", "CLK55 AMG"], ["Ferrari", "308", "GTB"], ["Ferrari", "308", "GTS"], ["Jaguar", "E-Type", "Series 1"], ["Land Rover", "Defender", "110"], ["Land Rover", "Defender", "90"], ["Toyota", "Land Cruiser", "FJ40"]];
for (const [mk, m, t] of TRIM_SEEDS) add(mk, m, { trim: t });

// Year to type for a car: the middle of a known production span, else 1995.
const yearFor = p => { const ys = p.years.filter(Boolean); return ys.length ? ys[Math.floor(ys.length / 2)] : 1995; };

// Spacing and hyphen variants of a name: SRT-10 / SRT10 / SRT 10, C63 / C 63, RX-7 / RX7 / RX 7.
const variants = s => {
  const out = new Set([s]);
  out.add(s.replace(/-/g, " "));
  out.add(s.replace(/-/g, ""));
  out.add(s.replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2"));
  out.add(s.replace(/([A-Za-z])[\s-]+(\d)/g, "$1$2"));
  return [...out].filter(v => v && v.length);
};
// Words added by the earlier jobs: body, edition, variant, series.
const SUFFIXES = [
  ["body", "Coupe"], ["body", "Convertible"], ["body", "Roadster"], ["body", "Targa"], ["body", "Sedan"], ["body", "Wagon"],
  ["edition", "Black Series"], ["edition", "Launch Edition"], ["edition", "Final Edition"], ["edition", "Edition 1"], ["edition", "Anniversary"],
  ["edition", "Heritage Edition"], ["edition", "Signature"], ["edition", "Sport Classic"], ["edition", "Competition"], ["edition", "CS"], ["edition", "CSL"],
  ["edition", "GTS"], ["edition", "Touring"], ["edition", "Speedster"], ["edition", "Series 1"],
  ["variant", "LWB"], ["variant", "SWB"], ["variant", "Unlimited"], ["series", "Series 80"], ["wheelbase", "110"]
];

const queries = [];
const q = (text, p, kind, extra = {}) => queries.push({ text, make: p.make, model: p.model, year: extra.year ?? null, kind, ...extra });
for (const p of pairs.values()) {
  const y = yearFor(p);
  const mk = p.make, md = p.model;
  q(`${y} ${mk} ${md}`, p, "year make model", { year: y });
  q(`${mk} ${md}`, p, "make model");
  q(`${y} ${mk} ${md}`.toLowerCase(), p, "lowercase", { year: y });
  for (const v of variants(md)) if (v !== md) { q(`${y} ${mk} ${v}`, p, "model spacing", { year: y }); q(`${mk} ${v}`, p, "model spacing no year"); }
  // model alone, where it is distinctive: one make owns the name in this list and it carries a digit, a hyphen or 4+ letters
  const owners = [...pairs.values()].filter(o => squash(o.model) === squash(md)).length;
  if (owners === 1 && (/\d/.test(md) || /-/.test(md) || md.length >= 5) && !/^(Model|Type|Series)\b/i.test(md)) q(md, p, "model alone");
  for (const typed of p.typed) if (typed.length >= 2) q(`${y} ${typed}`, p, "nickname", { year: y, nick: true });
  for (const t of p.trims) {
    if (squash(t) === squash(md)) continue;
    for (const v of variants(t)) { q(`${y} ${mk} ${md} ${v}`, p, "trim", { year: y, trim: t }); if (v === t) q(`${mk} ${md} ${v}`, p, "trim no year", { trim: t }); }
  }
  for (const [what, w] of SUFFIXES) {
    if (squash(md).includes(squash(w)) || [...p.trims].some(t => squash(t).includes(squash(w)))) continue;
    if (what === "variant" && w === "Unlimited" && !/wrangler/i.test(md)) continue;
    if (what === "series" && !/land cruiser/i.test(md)) continue;
    if (what === "wheelbase" && !/defender/i.test(md)) continue;
    q(`${y} ${mk} ${md} ${w}`, p, what, { year: y, suffix: w, suffixKind: what });
  }
}

// ---------------------------------------------------------------- 2. run both paths
const FIELDS = ["year", "make", "model", "trim", "trimNumber", "edition", "variant", "series", "wheelbase", "bodyStyle"];
const pick = v => v ? Object.fromEntries(FIELDS.map(k => [k, v[k] ?? null])) : null;
const t0 = Date.now();
const results = [];
quiet();
for (const item of queries) {
  let mc = null, buy = null, pq = null, err = null;
  try { const r = await resolveVehicle(item.text, {}); mc = pick(r && r.vehicle); } catch (e) { err = "resolveVehicle threw " + e.message; }
  try { pq = parseQuery(item.text); buy = pick(await resolveForBuy(pq.text || item.text, {})); } catch (e) { err = (err ? err + "; " : "") + "resolveForBuy threw " + e.message; }
  results.push({ ...item, mc, buy, pq, err });
}
loud();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ---------------------------------------------------------------- 3. checks
const STOP = new Set(["the", "a", "an", "and", "of", "in"]);
const carried = (r, who) => {
  const v = r[who]; if (!v) return "";
  let s = [v.make, v.model, v.trim, v.trimNumber, v.edition, v.variant, v.series, v.wheelbase, v.bodyStyle].filter(Boolean).join(" ");
  if (who === "buy" && r.pq) { const f = r.pq.filters; s += " " + [...f.bodies, ...f.colours, f.gearbox, ...f.houses].filter(Boolean).join(" "); }
  return squash(s);
};
const found = [];   // { cause, group, item }
const flag = (r, cause, group, detail) => found.push({ cause, group, q: r.text, kind: r.kind, detail });
const expectModel = r => squash(r.model);
for (const r of results) {
  if (r.err) { flag(r, "threw", r.err, r.err); continue; }
  const typedYear = (/\b(1[89]\d\d|20[0-3]\d)\b/.exec(r.text) || [])[1];
  for (const [who, v] of [["mc", r.mc], ["buy", r.buy]]) {
    const label = who === "mc" ? "Market Check/Sell" : "Buy/Tasks";
    if (!v || !v.make) { flag(r, "null make", `${label}: ${r.make} ${r.model}`, `${label} make null`); continue; }
    if (!v.model) { flag(r, "null model", `${label}: ${r.make} ${r.model}`, `${label} model null (make ${v.make})`); continue; }
    if (squash(v.make) !== squash(r.make)) flag(r, "wrong make", `${label}: ${r.make} ${r.model} -> ${v.make}`, `${label} make ${v.make}`);
    if (squash(v.model) !== expectModel(r) && !(r.nick || r.kind === "model alone")) flag(r, "different model", `${label}: ${r.model} -> ${v.model}`, `${label} model ${v.model}`);
    // year read from a number that was not a year
    if (!typedYear && v.year) flag(r, "number read as year", `${label}: ${r.model}`, `${label} year ${v.year}`);
    if (typedYear && v.year && String(v.year) !== typedYear) flag(r, "year changed", `${label}: ${r.model}`, `${label} year ${v.year} vs typed ${typedYear}`);
    // casing: an output word equal to a typed word except for case
    if (r.kind !== "lowercase") {
      const typedWords = r.text.split(/[\s]+/);
      for (const f of [v.model, v.trim, v.edition]) for (const w of String(f || "").split(/\s+/)) {
        const t = typedWords.find(tw => tw.toLowerCase() === w.toLowerCase() && tw !== w);
        if (t) flag(r, "casing lost", `${label}: ${t} -> ${w}`, `${label} wrote ${w}, typed ${t}`);
      }
    } else if (v.model && squash(v.model) === expectModel(r) && v.model !== r.model) flag(r, "casing lost", `${label}: lowercase typed ${r.model} -> ${v.model}`, `${label} wrote ${v.model}, canonical ${r.model}`);
    // dropped words
    const have = carried(r, who);
    const mk = squash(r.make);
    for (const tok of r.text.split(/[\s,]+/).map(squash).filter(Boolean)) {
      if (STOP.has(tok) || tok === typedYear || mk.includes(tok) || squash(r.make).includes(tok)) continue;
      if (!have.includes(tok)) { flag(r, "word dropped", `${label}: ${tok}`, `${label} dropped "${tok}" (carried: ${have})`); break; }
    }
  }
  if (r.mc && r.buy) {
    const diffs = FIELDS.filter(k => k !== "year" && (r.mc[k] || null) !== (r.buy[k] || null));
    if (diffs.length) flag(r, "lanes differ", diffs.join("+"), diffs.map(k => `${k}: ${JSON.stringify(r.mc[k])} vs ${JSON.stringify(r.buy[k])}`).join("; "));
  }
}
const byCause = {};
for (const f of found) { (byCause[f.cause] ||= { n: 0, groups: {} }); byCause[f.cause].n++; (byCause[f.cause].groups[f.group] ||= []).push(f); }
const badQueries = new Set(found.map(f => f.q)).size;
const summary = { pairs: pairs.size, queries: queries.length, seconds: secs, flaggedQueries: badQueries, flags: found.length, byCause: Object.fromEntries(Object.entries(byCause).map(([k, v]) => [k, { flags: v.n, groups: Object.keys(v.groups).length }])) };
console.log(JSON.stringify(summary, null, 1));

if (process.argv.includes("--write")) {
  const L = [];
  L.push("# Resolver audit", "", `Generated by scripts/resolverAudit.mjs (offline, curated data only, no vendor request). ${summary.pairs} makes and models, ${summary.queries} queries, ${badQueries} queries flagged (${found.length} flags), run in ${secs}s.`, "",
    "Both paths are run on every query: resolveVehicle (Market Check, Sell) and parseQuery then resolveForBuy (Buy, Tasks).", "", "## Counts by cause", "", "| Cause | Flags | Groups |", "|---|---|---|");
  for (const [k, v] of Object.entries(byCause).sort((a, b) => b[1].n - a[1].n)) L.push(`| ${k} | ${v.n} | ${Object.keys(v.groups).length} |`);
  for (const [k, v] of Object.entries(byCause).sort((a, b) => b[1].n - a[1].n)) {
    L.push("", `## ${k} (${v.n})`, "");
    for (const [g, items] of Object.entries(v.groups).sort((a, b) => b[1].length - a[1].length)) {
      L.push(`- ${g} (${items.length}): ${items.slice(0, 4).map(i => `"${i.q}"`).join(", ")}${items.length > 4 ? ", ..." : ""}`);
    }
  }
  fs.writeFileSync(new URL("../docs/resolver-audit.md", import.meta.url), L.join("\n") + "\n");
  console.log("wrote docs/resolver-audit.md");
}
if (process.argv.includes("--json")) fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(found, null, 0));
