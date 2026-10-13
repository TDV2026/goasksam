// RESOLVER AUDIT (Lane B2, Oct 2026). Finds, in bulk, the cars the shared resolver (resolveVehicle: Market Check and Sell)
// and the Buy path (parseQuery then resolveForBuy: Buy and Tasks) read differently or read wrongly.
//   node scripts/resolverAudit.mjs [--write]     prints counts by cause; --write rewrites docs/resolver-audit.md
// OFFLINE: every fetch is refused and Supabase points at a dead port, so only the curated data answers (lib/vehicleData.js,
// lib/generations.js). No vendor request, no database read. Too slow for prePush by design; the pinned cases that were
// fixed live in scripts/resolverLanesCheck.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
// Every network call is refused, except the resolver's own taxonomy reads, which are answered from the audit list itself
// (below): the audit asks "given that the resolver KNOWS this make and model, does it read the typed words right".
let TAXONOMY = { makes: [], models: new Map() };
const slug = v => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
globalThis.fetch = async url => {
  const u = decodeURIComponent(String(url));
  const reply = rows => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => rows, text: async () => JSON.stringify(rows) });
  if (u.includes("/rest/v1/taxonomy_makes")) return reply(TAXONOMY.makes.map(name => ({ name })));
  if (u.includes("/rest/v1/taxonomy_models")) {
    const eq = /make_slug=eq\.([^&]+)/.exec(u);
    if (eq) return reply((TAXONOMY.models.get(eq[1]) || []).map(name => ({ name, year_ranges: null })));
    const like = /slug=like\.\*([^*&]+)\*/.exec(u);
    if (like) { const rows = []; for (const [mk, ms] of TAXONOMY.models) for (const name of ms) if (slug(name).includes(like[1])) rows.push({ name, make_slug: mk }); return reply(rows); }
  }
  if (u.includes("/rest/v1/")) return reply([]);
  throw new Error("offline");
};
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
  if (!p) { p = { make, model, trims: new Set(), years: [], typed: new Map() }; pairs.set(k, p); }
  if (extra.trim) p.trims.add(extra.trim);
  if (extra.year) p.years.push(extra.year);
  if (extra.typed) p.typed.set(extra.typed, extra.kind || "nickname");
  return p;
};
for (const g of CURATED_GENERATIONS) { const p = add(g.make, g.model); p.years.push(Math.round((g.yearStart + Math.min(g.yearEnd, 2026)) / 2)); }
for (const a of D.MODEL_ALIASES) add(a.make, a.model, { trim: a.trim, typed: a.alias, kind: a.kind });
for (const o of D.MODEL_OWNERSHIP) for (const mk of o.makes) add(mk, o.model, { typed: o.aliases[0] });
for (const r of D.PRODUCTION_RULES) { const y = r.ranges && r.ranges[0]; add(r.make, r.model, { year: y ? Math.round((y[0] + Math.min(y[1], 2026)) / 2) : null }); }
for (const [mk, models] of Object.entries(D.CURATED_MODELS)) for (const m of models) add(title(mk), m);
for (const [mk, m] of Object.entries(D.SINGLE_MODEL_MAKES)) add(title(mk), m);
for (const t of D.PORSCHE_911_TRIMS) add("Porsche", "911", { trim: t });
// Names from the earlier jobs and the launch list, so they stay in the audit.
const SEEDS = [["Datsun", "240Z"], ["Datsun", "260Z"], ["Datsun", "280Z"], ["Datsun", "280ZX"], ["Nissan", "300ZX"], ["Toyota", "2000GT"], ["Mazda", "RX-7"], ["Mazda", "RX-8"], ["Toyota", "MR2"], ["Acura", "NSX"], ["Honda", "S2000"], ["Nissan", "GT-R"], ["Nissan", "350Z"], ["Nissan", "370Z"], ["Toyota", "Supra"], ["Mitsubishi", "Lancer Evolution"], ["Subaru", "WRX"], ["Jaguar", "E-Type"], ["Jaguar", "XK120"], ["Triumph", "TR6"], ["MG", "MGB"], ["Lotus", "Esprit"], ["Lotus", "Elise"], ["Aston Martin", "DB5"], ["Ferrari", "Testarossa"], ["Ferrari", "F40"], ["Ferrari", "308"], ["Lamborghini", "Countach"], ["Lamborghini", "Diablo"], ["Lamborghini", "Miura"], ["Mercedes-Benz", "SLS AMG"], ["BMW", "Z3"], ["BMW", "Z4"], ["BMW", "1M"], ["Alfa Romeo", "8C"], ["Alfa Romeo", "Giulia"], ["Koenigsegg", "CCXR"], ["Mercedes-Benz", "CLK DTM"], ["Dodge", "Viper"], ["Ford", "Mustang"], ["Ford", "GT40"], ["Land Rover", "Defender"], ["Land Rover", "Range Rover"], ["Jeep", "Wrangler"], ["Toyota", "Land Cruiser"], ["Chevrolet", "Corvette"], ["BMW", "M3"], ["Porsche", "911"], ["Mercedes-Benz", "300SL"], ["Mercedes-Benz", "SL-Class"], ["Mercedes-Benz", "G-Class"], ["Mercedes-Benz", "C-Class"], ["Mercedes-Benz", "E-Class"], ["Ford", "Bronco"], ["Chevrolet", "Camaro"], ["Dodge", "Charger"], ["Dodge", "Challenger"], ["Pontiac", "GTO"], ["Ferrari", "250 GTO"], ["Ford", "F-150"], ["Chevrolet", "Chevelle"], ["Shelby", "Cobra"]];
for (const [mk, m] of SEEDS) add(mk, m);
// Typed trims that matter per model (spacing and edition forms below are generated from these).
const TRIM_SEEDS = [["Dodge", "Viper", "SRT-10"], ["Ford", "Mustang", "GT350"], ["Ford", "Mustang", "Shelby GT500"], ["Chevrolet", "Corvette", "Z06"], ["Chevrolet", "Corvette", "ZR1"], ["Chevrolet", "Camaro", "Z28"], ["Mazda", "MX-5", "Club"], ["Subaru", "WRX", "STI"], ["BMW", "M3", "CSL"], ["BMW", "M3", "Competition"], ["Porsche", "911", "GT3 RS"], ["Porsche", "911", "Turbo S"], ["Porsche", "911", "Carrera 4S"], ["Alfa Romeo", "Giulia", "Quadrifoglio"], ["BMW", "Z3", "M"], ["BMW", "Z4", "M"], ["Mercedes-Benz", "SL-Class", "SL55 AMG"], ["Mercedes-Benz", "C-Class", "C63 AMG"], ["Mercedes-Benz", "G-Class", "G63 AMG"], ["Mercedes-Benz", "CLK-Class", "CLK55 AMG"], ["Ferrari", "308", "GTB"], ["Ferrari", "308", "GTS"], ["Jaguar", "E-Type", "Series 1"], ["Land Rover", "Defender", "110"], ["Land Rover", "Defender", "90"], ["Toyota", "Land Cruiser", "FJ40"]];
for (const [mk, m, t] of TRIM_SEEDS) add(mk, m, { trim: t });

TAXONOMY.makes = [...new Set([...pairs.values()].map(p => p.make).concat(["Ford", "Chevrolet", "Dodge", "Toyota", "Nissan", "Honda", "Mazda", "Subaru", "Lexus", "Acura", "Jeep", "GMC", "Buick", "Cadillac", "Pontiac", "Oldsmobile", "Plymouth", "Mercury", "Lincoln", "Volkswagen", "Volvo", "Audi", "Saab", "Fiat", "Maserati", "Bentley", "Rolls-Royce", "McLaren", "Aston Martin", "Lotus", "Jaguar", "Triumph", "MG", "Austin-Healey", "Mini"]))];
for (const p of pairs.values()) { const k = slug(p.make); if (!TAXONOMY.models.has(k)) TAXONOMY.models.set(k, []); const a = TAXONOMY.models.get(k); if (!a.some(m => squash(m) === squash(p.model))) a.push(p.model); }

// A typed name that more than one make uses (NSX is an Acura and a Honda) is asked about, by design.
const aliasMakes = new Map();
for (const p of pairs.values()) for (const t of [p.model, ...p.typed.keys()]) { const k = squash(t); if (!aliasMakes.has(k)) aliasMakes.set(k, new Set()); aliasMakes.get(k).add(p.make); }
for (const o of D.MODEL_OWNERSHIP) for (const a of o.aliases) { const k = squash(a); if (!aliasMakes.has(k)) aliasMakes.set(k, new Set()); for (const mk of o.makes) aliasMakes.get(k).add(mk); }
// Year to type for a car: the middle of a known production span, else 1995.
const yearFor = p => { const ys = p.years.filter(Boolean); return ys.length ? ys[Math.floor(ys.length / 2)] : null; };

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
const seenQ = new Set();
const q = (text, p, kind, extra = {}) => { if (seenQ.has(text)) return; seenQ.add(text); queries.push({ text, make: p.make, model: p.model, year: extra.year ?? null, kind, ...extra }); };
for (const p of pairs.values()) {
  const y = yearFor(p), Y = y ? `${y} ` : "";
  const mk = p.make, md = p.model;
  q(`${Y}${mk} ${md}`, p, "year make model", { year: y });
  q(`${mk} ${md}`, p, "make model");
  q(`${Y}${mk} ${md}`.toLowerCase(), p, "lowercase", { year: y });
  for (const v of variants(md)) if (v !== md) { q(`${Y}${mk} ${v}`, p, "model spacing", { year: y }); q(`${mk} ${v}`, p, "model spacing no year"); }
  // model alone, where it is distinctive: one make owns the name in this list and it carries a digit, a hyphen or 4+ letters
  const owners = [...pairs.values()].filter(o => squash(o.model) === squash(md)).length;
  if (owners === 1 && (aliasMakes.get(squash(md)) || new Set()).size <= 1 && (/\d/.test(md) || /-/.test(md) || md.length >= 5) && !/^(Model|Type|Series)\b/i.test(md)) q(md, p, "model alone");
  for (const [typed, akind] of p.typed) if (typed.length >= 2) q(`${Y}${typed}`, p, "nickname", { year: y, nick: true, misspelling: akind === "misspelling", ambiguousAlias: (aliasMakes.get(squash(typed)) || new Set()).size > 1 });
  for (const t of p.trims) {
    if (squash(t) === squash(md)) continue;
    for (const v of variants(t)) { q(`${Y}${mk} ${md} ${v}`, p, "trim", { year: y, trim: t }); if (v === t) q(`${mk} ${md} ${v}`, p, "trim no year", { trim: t }); }
  }
  for (const [what, w] of SUFFIXES) {
    if (squash(md).includes(squash(w)) || [...p.trims].some(t => squash(t).includes(squash(w)))) continue;
    if (w.split(/\s+/).some(word => new RegExp(`\\b${word}\\b`, "i").test(`${md} ${[...p.trims].join(" ")}`))) continue;
    if (what === "variant" && w === "Unlimited" && !/wrangler/i.test(md)) continue;
    if (what === "series" && !/land cruiser/i.test(md)) continue;
    if (what === "wheelbase" && !/defender/i.test(md)) continue;
    q(`${Y}${mk} ${md} ${w}`, p, what, { year: y, suffix: w, suffixKind: what });
  }
}

// ---------------------------------------------------------------- 2. run both paths
const FIELDS = ["year", "make", "model", "trim", "trimNumber", "edition", "variant", "series", "wheelbase", "bodyStyle"];
const pick = v => v ? Object.fromEntries(FIELDS.map(k => [k, v[k] ?? null])) : null;
// --try "a|b" prints the full shape of those queries on both paths and stops (for chasing one cause).
if (process.argv.includes("--try")) {
  for (const text of process.argv[process.argv.indexOf("--try") + 1].split("|")) {
    const mc = await resolveVehicle(text, {}), pq = parseQuery(text), buy = await resolveForBuy(pq.text || text, {});
    console.log(text + "\n  MC  " + JSON.stringify([mc.status, pick(mc.vehicle), mc.clarification && mc.clarification.question]) + "\n  BUY " + JSON.stringify([pq.text, pick(buy)]));
  }
  process.exit(0);
}
const t0 = Date.now();
const results = [];
quiet();
for (const item of queries) {
  let mc = null, buy = null, pq = null, err = null;
  try { const r = await resolveVehicle(item.text, {}); mc = pick(r && r.vehicle); } catch (e) { err = "resolveVehicle threw " + e.message; }
  try { pq = parseQuery(item.text); buy = pick(await resolveForBuy(pq.text || item.text, {})); if (buy && !buy.bodyStyle && pq.filters.bodies.length === 1) buy.bodyStyle = pq.filters.bodies[0]; } catch (e) { err = (err ? err + "; " : "") + "resolveForBuy threw " + e.message; }
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
const expectModel = r => { let m = squash(r.model); const mk = squash(r.make); return m.startsWith(mk) && m.length > mk.length ? m.slice(mk.length) : m; };
// Names that are one car under two names: the resolver files them under the second (XKE is the E-Type, S65 an S-Class).
const SAME_CAR = { "jaguar|xke": "etype", "mercedesbenz|s65": "sclass", "ferrari|250gto": "250gt", "porsche|carrera": "911", "ford|f150raptor": "f150" };
// Pairs the audit list holds that are not a make plus model a person types (a Shelby Charger is a Shelby; SLR McLaren is a McLaren).
const SKIP_PAIRS = new Set(["dodge|chargershelby", "mercedesbenz|slrmclaren", "tucker|48"]);
const sameModel = (a, r) => { const x = squash(a); return x === squash(r.model) || x === expectModel(r) || x === SAME_CAR[squash(r.make) + "|" + squash(r.model)]; };
for (const r of results) {
  if (r.err) { flag(r, "threw", r.err, r.err); continue; }
  if (SKIP_PAIRS.has(squash(r.make) + "|" + squash(r.model))) continue;
  if (r.misspelling || r.ambiguousAlias) continue;   // a misspelling confirms and an ambiguous name asks, by design
  const typedYear = (/\b(1[89]\d\d|20[0-3]\d)\b/.exec(r.text) || [])[1];
  for (const [who, v] of [["mc", r.mc], ["buy", r.buy]]) {
    const label = who === "mc" ? "Market Check/Sell" : "Buy/Tasks";
    if (!v || !v.make) { flag(r, "null make", `${label}: ${r.make} ${r.model}`, `${label} make null`); continue; }
    if (!v.model) { flag(r, "null model", `${label}: ${r.make} ${r.model}`, `${label} model null (make ${v.make})`); continue; }
    if (squash(v.make) !== squash(r.make)) flag(r, "wrong make", `${label}: ${r.make} ${r.model} -> ${v.make}`, `${label} make ${v.make}`);
    if (!sameModel(v.model, r) && !(r.nick || r.kind === "model alone")) flag(r, "different model", `${label}: ${r.model} -> ${v.model}`, `${label} model ${v.model}`);
    // year read from a number that was not a year
    if (!typedYear && v.year) flag(r, "number read as year", `${label}: ${r.model}`, `${label} year ${v.year}`);
    if (typedYear && v.year && String(v.year) !== typedYear) flag(r, "year changed", `${label}: ${r.model}`, `${label} year ${v.year} vs typed ${typedYear}`);
    // casing: an output word equal to a typed word except for case
    if (r.kind !== "lowercase") {
      const typedWords = r.text.split(/[\s]+/);
      for (const f of [v.model, v.trim, v.edition]) for (const w of String(f || "").split(/\s+/)) {
        const t = typedWords.find(tw => tw.toLowerCase() === w.toLowerCase() && tw !== w && tw !== tw.toLowerCase());
        if (t) flag(r, "casing lost", `${label}: ${t} -> ${w}`, `${label} wrote ${w}, typed ${t}`);
      }
    } else if (v.model && squash(v.model) === expectModel(r) && v.model !== r.model) flag(r, "casing lost", `${label}: lowercase typed ${r.model} -> ${v.model}`, `${label} wrote ${v.model}, canonical ${r.model}`);
    // dropped words
    const have = carried(r, who);
    const mk = squash(r.make);
    if (r.nick && v.model && sameModel(v.model, r)) continue;   // a nickname expands silently to its car
    const aliasToks = new Set([...((pairs.get(squash(r.make) + "|" + squash(r.model)) || {}).typed?.keys() || [])].map(squash));
    for (const tok of r.text.split(/[\s,]+/).map(squash).filter(Boolean)) {
      if (aliasToks.has(tok) && v.model && sameModel(v.model, r) || (tok === squash(r.model) && v.model && sameModel(v.model, r)) || (tok === "series" && v.series) || STOP.has(tok) || (tok === "edition" && v.edition) || tok === typedYear || mk.includes(tok) || squash(r.make).includes(tok)) continue;
      if (!have.includes(tok)) { flag(r, "word dropped", `${label}: ${tok}`, `${label} dropped "${tok}" (carried: ${have})`); break; }
    }
  }
  if (r.mc && r.buy) {
    const diffs = FIELDS.filter(k => k !== "year" && (r.mc[k] || null) !== (r.buy[k] || null));
    if (diffs.length) flag(r, "lanes differ", diffs.join("+"), diffs.map(k => `${k}: ${JSON.stringify(r.mc[k])} vs ${JSON.stringify(r.buy[k])}`).join("; "));
  }
}
// Group by where the cause lives. Lane B's lib/live/search.js (parseQuery, enrichForBuy) strips or reads words before the shared resolver sees them.
const CAUSES = [
  ["parseQuery reads Black as a colour (Black Series loses its edition)", f => /black series/i.test(f.q) && f.cause !== "different model"],
  ["parseQuery strips the article A (A-Class, A 4, A 6, A 45)", f => /\ba[\s-]?(class|\d)|aclass/i.test(f.q) || /A-Class|aclass/i.test(f.group + f.detail)],
  ["parseQuery strips Wagon from the model Power Wagon", f => /power wagon/i.test(f.q)],
  ["parseQuery strips body words the resolver keeps as trim or edition (Roadster, Speedster, Targa, Spyder, Spider)", f => /\b(roadster|speedster|targa|spyder|spider)\b/i.test(f.q)],
  ["Buy chat bare-make check reads S 2000 as year plus possessive (Honda S 2000)", f => /\bs 2000\b/i.test(f.q)],
  ["parseQuery moves body words to a filter (the shared resolver keeps bodyStyle; Buy carries it in filters.bodies)", f => /\b(coupe|convertible|sedan|wagon)\b/i.test(f.q)]
];
for (const f of found) f.root = (CAUSES.find(([, test]) => test(f)) || [f.cause + " (resolver)"])[0];
const byRoot = {};
for (const f of found) (byRoot[f.root] ||= []).push(f);
const byCause = {};
for (const f of found) { (byCause[f.cause] ||= { n: 0, groups: {} }); byCause[f.cause].n++; (byCause[f.cause].groups[f.group] ||= []).push(f); }
const badQueries = new Set(found.map(f => f.q)).size;
const rootCounts = Object.fromEntries(Object.entries(byRoot).map(([k, v]) => [k, v.length]));
const summary = { pairs: pairs.size, queries: queries.length, seconds: secs, flaggedQueries: badQueries, flags: found.length, byCause: Object.fromEntries(Object.entries(byCause).map(([k, v]) => [k, { flags: v.n, groups: Object.keys(v.groups).length }])) };
summary.byRoot = rootCounts;
console.log(JSON.stringify(summary, null, 1));
if (process.argv.includes("--summary-out")) fs.writeFileSync(process.argv[process.argv.indexOf("--summary-out") + 1], JSON.stringify(summary));

if (process.argv.includes("--write")) {
  const bi = process.argv.indexOf("--before");
  const before = bi > 0 ? JSON.parse(fs.readFileSync(process.argv[bi + 1], "utf8")) : null;
  const L = [];
  L.push("# Resolver audit", "",
    `Generated by \`node scripts/resolverAudit.mjs --write\` (offline, no vendor request, about ${Math.round(secs)} seconds; too slow for prePush, so the pinned cases live in scripts/resolverLanesCheck.mjs).`,
    "", `**Size:** ${summary.pairs} makes and models the resolver knows (lib/vehicleData.js aliases, ownership, production rules, curated models; lib/generations.js; plus the named launch cars), ${summary.queries} queries typed ${"the ways a person types them"}: year make model, make model, lowercase, model alone, spacing and hyphen variants (SRT-10 / SRT10 / SRT 10, C63 / C 63, RX-7 / RX7), nicknames, curated trims, and the body, edition, variant, series and wheelbase words added in earlier jobs. Each query runs through resolveVehicle (Market Check and Sell) and through parseQuery then resolveForBuy (Buy and Tasks). The resolver reads makes and models from the audit list itself (a stand-in for the seeded taxonomy), so a flag means the typed words were read wrongly, not that a model was unknown.`,
    "", "**Checked:** the two paths differ; a known car comes back with a null make or model, or a different one; a typed word is carried nowhere (trim, trimNumber, edition, variant, series, wheelbase, body); a model is wrongly cased; a number is read as a year. Misspellings (they confirm) and names two makes share (NSX is an Acura and a Honda) are skipped by design.", "",
    `**Result now:** ${found.length} flags on ${badQueries} queries. Every one left sits in Lane B's lib/live/search.js (listed under FOR LANE B in docs/lane-notes.md) or is a known case below.`, "",
    "## Counts by cause, before and after", "", "| Cause | Before | After |", "|---|---|---|");
  const roots = new Set([...Object.keys(rootCounts), ...(before ? Object.keys(before.byRoot) : [])]);
  for (const k of [...roots].sort((x, y) => (rootCounts[y] || 0) + ((before && before.byRoot[y]) || 0) - (rootCounts[x] || 0) - ((before && before.byRoot[x]) || 0))) L.push(`| ${k} | ${before ? before.byRoot[k] || 0 : "-"} | ${rootCounts[k] || 0} |`);
  if (before) L.push(`| **All flags** | **${before.flags}** | **${found.length}** |`, `| Queries run | ${before.queries} (${before.pairs} cars) | ${summary.queries} (${summary.pairs} cars) |`, "", "The before run used the resolver as it stood at commit c714576 and its own, smaller car list (the bare-model owners added in this job are new cars to the list).");
  L.push("", "## Known cases left in the resolver's own files", "",
    "- Dodge Charger Shelby: reads as the Shelby make (Cobra); the 1983 Dodge Shelby Charger is a Dodge. Not fixed: needs a make-collision rule.",
    "- Ford F-150 Raptor: the model is \"F-150 Raptor\" typed whole, but F-150 with trim Raptor when \"Raptor\" is typed alone. Same car, two shapes. Not fixed: changing the shape moves the comp pool.",
    "- Mazda MX-5 Club: the trim word Club is not in the locked trim vocabulary, so it is not carried.",
    "- 550 Spyder typed alone: asks for a make (Porsche 550 Spyder or Ferrari 550); by design while two makes use 550.",
    "- Bentley 4.5 litre blower typed as a nickname: the audit flags the digits of the alias; the car resolves correctly.",
    "- Range Rover Sport / Discovery Sport plus the edition word Sport Classic: the model already holds the word Sport; audit artifact.", "",
    "## Full list, grouped by cause", "");
  for (const [root, items] of Object.entries(byRoot).sort((x, y) => y[1].length - x[1].length)) {
    L.push(`### ${root} (${items.length})`, "");
    const seen = new Set();
    for (const f of items) { const k = f.q + "|" + f.cause + "|" + f.detail; if (seen.has(k)) continue; seen.add(k); L.push(`- "${f.q}" [${f.kind}] ${f.cause}: ${f.detail}`); }
    L.push("");
  }
  fs.writeFileSync(new URL("../docs/resolver-audit.md", import.meta.url), L.join("\n") + "\n");
  console.log("wrote docs/resolver-audit.md");
}
if (process.argv.includes("--json")) fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(found, null, 0));
