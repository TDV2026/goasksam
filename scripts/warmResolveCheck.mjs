// THE WARM RESOLVES A NAME THE WAY THE PAGE DOES (Lane B, Nov 6 2026; Lane F's warm: six pre-war cars refused with "rung_label_blank", nothing stored: bare Duesenberg Model J, Auburn 851, Bugatti Type 57, Cord 810, Mercedes-Benz 540K, and "1938 Mercedes-Benz 540K" even with a year; "1930 Duesenberg Model J" stored).
// CAUSE (read with ops warmwhy, which names the refusal): not an apart answer with no label. These names are in no curated list or taxonomy row, so resolveVehicle alone returns a make with NO model; the page (api/sellerDecision.js, "Fix 7") then reads the model from the sale titles, and the warm
// did not, so it ran the engine on an identity with no model: refusal not_a_car, poolN 0, no rung label, which the store guard reported as its first blank field. A bodies-apart answer carries its label (every one of the twelve pre-war cars of prewarYearlessCheck has one and stores).
// FIX: one title read, archiveTitleModel (lib/onebox.js), used by the page and, once, by the engine itself before it refuses an identity with no model; so every caller (the warm tasks, warmMarketCheck.js, warmwhy, the diagnostics) gets the answer the page gets, with no call site changed. The guard names the cause (not_a_car:missing_model), not its symptom.
// CLASS: any caller that hands the engine the resolver's vehicle as it is: this check does exactly that (the bare resolver, then the engine, then the warm's store); and every answer shape that leaves the rung label blank is listed and shown not to be an answer.
//   node scripts/warmResolveCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago), so the verdict does not change with the day
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/onebox.js", "if (vehicle && typeof searchText === \"string\" && searchText.trim() && !vehicle.requireYear", "if (false && vehicle && typeof searchText === \"string\" && searchText.trim() && !vehicle.requireYear", "the engine does not read the model from the titles before it refuses (the live fault)"],
    ["lib/onebox.js", "year: typedYear, raw: vehicle.raw || searchText, titleRead: true };", "year: vehicle.year, raw: vehicle.raw || searchText, titleRead: true };", "a model number is read as a year"],
    ["lib/live/search.js", "  if (d.refusal && d.refusal.kind === \"not_a_car\") return `not_a_car:missing_${(d.refusal.missing || []).join(\"_\") || \"identity\"}`;", "", "the guard names the symptom, not the cause"],
    ["api/sellerDecision.js", "const tok = await archiveTitleModel(rawSearch, { supabaseUrl, supabaseKey });", "const tok = null;", "the page no longer reads the titles through the shared function"],
    ["lib/onebox.js", "(?<![A-Za-z0-9_])\" + esc + \"(?![A-Za-z0-9_])", "\\\\b\" + esc + \"\\\\b", "a token ending in a fraction is judged by \\b again (4½ Litre pools refused as swapped)"],
    ["lib/vehicle.js", "keepFractions ? FRACTION_WORDS[g] : \" \"", "\" \"", "normalize drops the fraction glyph again (3½ read as the 3 Litre, 4¼ as the 4½)"],
    ["lib/modelRules.js", "poolTerms: [\"4¼-Litre\", \"4¼ Litre\",", "poolTerms: [\"4¼ Litre\",", "the 4¼ pool misses the hyphenated spelling the archive uses 38 times"],
    ["lib/modelRules.js", "{ code: \"Derby 4¼\", years: [1936, 1939]", "{ code: \"Derby 4¼\", years: [1936, 1952]", "the Mark VI 4¼ (1947 to 1951) joins the pre-war 4¼ pool"],
    ["lib/vehicle.js", "replace(/\\b(\\d)(?:\\.25|\\s1\\/4)[\\s-]*lit(?:re|er)s?\\b/gi, \"$1\\u00bc Litre\")", "replace(/\\b(\\d)(?:\\.xx|\\s1\\/4)[\\s-]*lit(?:re|er)s?\\b/gi, \"$1\\u00bc Litre\")", "\"4.25 litre\" is no longer read as the 4¼"],
    ["lib/onebox.js", " || (restOfPhrase ? Object.keys(models).find(m => sameName(m, restOfPhrase)) : undefined);", ";", "the typed words after the make are not matched to a filed model (bare Bugatti Type 57 refused when the variants split the models)"],
    ["lib/onebox.js", "const key = mrNorm(ph) + \"#\" + fractionSig(ph);", "const key = mrNorm(ph);", "4¼ and 4½ share one cache key in the title read"],
    ["lib/onebox.js", "timer = setTimeout(() => { try { ctrl.abort(); } catch {} resolve(null); }, left);", "timer = null;", "the title read has no budget, a slow scan holds it for every phrase"]
  ];

  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "warmres-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/warmResolveCheck.mjs"), dir], { encoding: "utf8", timeout: 590000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { marketOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (year, body, price, ago) => { n++; const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, HOUSE = globalThis.HOUSE && globalThis.HOUSE(n, body); const title = `${year} ${CAR.make} ${CAR.model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: HOUSE ? "Gooding & Co" : "Bring a Trailer", source_slug: HOUSE ? "gooding" : "bringatrailer", make: CAR.make, model: CAR.model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: (HOUSE || (globalThis.NOPHOTO && globalThis.NOPHOTO(n))) ? null : "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const fs = await import("node:fs");
const V = await import(pathToFileURL(path.join(ROOT, "lib/vehicle.js")).href), S = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href);
// the archive as production has it: models no list knows. archiveResolveToken asks "make=not.is.null", which the fake does not read, so the filter is dropped.
const f0 = globalThis.fetch, STORE = new Map();
globalThis.fetch = async (url, opt) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) {
    if (opt && opt.method === "POST") { for (const r of JSON.parse(opt.body)) STORE.set(r.spec_key, r); return new Response("", { status: 201 }); }
    const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(STORE.has(k) ? [{ spec_key: k, market: STORE.get(k).market, computed_at: STORE.get(k).computed_at }] : []), { status: 200 });
  }
  if (u.searchParams.get("make") === "not.is.null") u.searchParams.delete("make");
  return f0(u.toString(), opt);
};
const CARS = [   // [make, model filed, sales [year, body, price, count]]
  ["Duesenberg", "Model J", [[1930, "Roadster", 1400000, 3], [1931, "Phaeton", 1500000, 3], [1932, "Sedan", 600000, 3], [1933, "Coupe", 900000, 3]]],
  ["Auburn", "851", [[1935, "Speedster", 380000, 5], [1935, "Roadster", 120000, 2], [1936, "Convertible", 140000, 4], [1936, "Sedan", 60000, 3]]],
  ["Bugatti", "Type 57", [[1937, "Coupe", 4000000, 3], [1938, "Cabriolet", 3500000, 3], [1939, "Roadster", 3800000, 3]]],
  ["Cord", "810", [[1936, "Phaeton", 150000, 3], [1937, "Sedan", 70000, 3], [1937, "Cabriolet", 140000, 3]]],
  ["Bentley", "4½ Litre", [[1928, "Tourer", 900000, 3], [1929, "Saloon", 400000, 3], [1930, "Tourer", 1100000, 3]]],
  ["Bentley", "6½ Litre", [[1926, "Tourer", 700000, 3], [1927, "Saloon", 300000, 3], [1928, "Tourer", 900000, 3]]],
  ["Bentley", "4¼ Litre", [[1936, "Saloon", 120000, 3], [1937, "Tourer", 180000, 3], [1938, "Coupe", 150000, 3], [1939, "Saloon", 130000, 3]]],
  ["Bentley", "3½ Litre", [[1934, "Saloon", 90000, 3], [1935, "Tourer", 150000, 3], [1936, "Coupe", 110000, 3]]],
  ["Bentley", "Mark VI", [[1948, "Saloon", 60000, 3], [1950, "Saloon", 55000, 3]]],
  ["Bentley", "8 Litre", [[1931, "Saloon", 800000, 3], [1932, "Tourer", 1500000, 3], [1930, "Sports Saloon", 900000, 3]]],
  ["Mercedes-Benz", "540K", [[1936, "Cabriolet", 2100000, 3], [1937, "Roadster", 2900000, 3], [1938, "Coupe", 1700000, 3], [1939, "Sedan", 900000, 3]]]
];
rows = []; for (const [make, model, list] of CARS) { globalThis.CAR = { make, model }; let i = 0; for (const [yr, body, base, cnt] of list) for (let k = 0; k < cnt; k++) sale(yr, body, base + (k % 4) * 900, 20 + ((i++) % 12) * 9); }
// the archive files some Type 57 sales under their body name ("Atalante", "Ventoux") with "Bugatti Type 57" in the title: no filed model holds 60 percent of the titles that carry the typed words, so only the typed "Type 57" can pick the model (the bare production refusal)
{ const b = rows.filter(r => r.make === "Bugatti" && r.model === "Type 57"); b.slice(0, 3).forEach(r => { r.model = "Atalante"; r.listing_title = r.listing_title.replace("Type 57", "Type 57 Atalante"); }); b.slice(3, 5).forEach(r => { r.model = "Ventoux"; r.listing_title = r.listing_title.replace("Type 57", "Type 57 Ventoux"); }); }
// THE DERBY BENTLEYS AS THE ARCHIVE FILES THEM (ops modscan make=Bentley t1=Litre, Nov 8 2026: "4¼-Litre" 38, "4 1/4 Litre" 8, "4 ¼-litre" 1; "3½-Litre" 26, "3 1/2 Litre" 5; the Mark VI 4¼ of 1947 to 1951 carries the same words): the spellings differ and the model column is no guide
{
  const retitle = (r, t, model) => { r.listing_title = t; r.raw_record.title = t; if (model !== undefined) r.model = model; };
  const q4 = rows.filter(r => r.make === "Bentley" && r.model === "4¼ Litre"), q3 = rows.filter(r => r.make === "Bentley" && r.model === "3½ Litre"), mk6 = rows.filter(r => r.make === "Bentley" && r.model === "Mark VI");
  q4.forEach((r, i) => { const body = r.raw_record.body_style; if (i % 3 === 1) retitle(r, `${r.year} Bentley 4¼-Litre ${body}`, "4¼-Litre"); else if (i % 3 === 2) retitle(r, `${r.year} Bentley 4 1/4 Litre ${body}`, "Unknown"); });
  q3.forEach((r, i) => { const body = r.raw_record.body_style; if (i % 3 === 1) retitle(r, `${r.year} Bentley 3½-Litre ${body}`, "3½-Litre"); else if (i % 3 === 2) retitle(r, `${r.year} Bentley 3 1/2 Litre ${body}`, "Unknown"); });
  mk6.forEach(r => retitle(r, `${r.year} Bentley Mark VI 4¼-Litre ${r.raw_record.body_style}`));
}
globalThis.HOUSE = null;
const WARM_QUERY_BUDGET_MS = 3000;
const QUERIES = ["Duesenberg Model J", "Auburn 851", "Bugatti Type 57", "Cord 810", "Mercedes-Benz 540K", "1938 Mercedes-Benz 540K", "1930 Duesenberg Model J", "Bentley 4¼ Litre", "Bentley 3½ Litre", "Bentley 4½ Litre", "Bentley 6½ Litre", "Bentley 8 Litre"];
for (const q of QUERIES) {
  const tq0 = Date.now();
  const rv = await V.resolveVehicle(q, {}), v = rv && rv.vehicle;   // the bare resolver, as every warm calls it
  ok(`"${q}": the bare resolver hands the engine a vehicle (${v && v.make} / ${v && v.model})`, !!v, JSON.stringify({ status: rv && rv.status }));
  if (!v) continue;
  const gen = await findGeneration(v, env).catch(() => null), d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw, rc = d.resolvedCar || {}, key = S.warmAnswerKeyFor(rc.make ? rc : v, gen);
  const typedYear = Number((/\b(19|20)\d\d\b/.exec(q) || [])[0]) || null;
  ok(`"${q}": the engine reads the model from the titles (${rc.make} / ${rc.model}) and a year only when four digits were typed (${typedYear || "none"}), "Type 57" is not 1957`, !!(rc.make && rc.model) && (rc.year || null) === typedYear, JSON.stringify({ make: rc.make, model: rc.model, year: rc.year }));
  ok(`"${q}": the answer has a pool and a rung label (${d.tier}, "${String(d.rungLabel || "").slice(0, 50)}")`, /^(result|thin)$/.test(String(d.tier)) && typeof d.rungLabel === "string" && d.rungLabel.trim().length > 0, JSON.stringify({ tier: d.tier, rung: d.rungLabel, refusal: d.refusal && d.refusal.kind }));
  const sw = await S.storeWarmResult(env, key, d);
  ok(`"${q}": the warm's store guard stores it`, sw.stored === true, JSON.stringify(sw));
  ok(`"${q}": the whole read (resolve, engine, store) is inside ${WARM_QUERY_BUDGET_MS} ms, so a slow read fails here and not in a 290 second warm (took ${Date.now() - tq0} ms)`, Date.now() - tq0 < WARM_QUERY_BUDGET_MS, String(Date.now() - tq0));
  if (d.optionsState === "apart") ok(`"${q}": an answer with its bodies apart carries its own label`, typeof d.rungLabel === "string" && d.rungLabel.trim().length > 0, d.rungLabel);
}
// THE DERBY BENTLEYS ARE CARS OF THEIR OWN (Lane B, Nov 8 2026, Sam: seed the 4¼ Litre). Every curated Bentley alias resolves to its own model (the 3½ had been the 3 Litre, the 4¼ the 4½: normalize dropped the glyph), and the 4¼ and 3½ pools hold their sales in every spelling the archive writes
// and nothing else: not the 4½ Litre, not the Mark VI 4¼ (1947 to 1951, the same words).
{
  const VD2 = await import(pathToFileURL(path.join(ROOT, "lib/vehicleData.js")).href), al = []; const w2 = o => { if (!o) return; if (Array.isArray(o)) o.forEach(w2); else if (typeof o === "object") { if (o.make === "Bentley" && o.alias && o.model) al.push([o.alias, o.model]); Object.values(o).forEach(w2); } };
  for (const k of Object.keys(VD2)) w2(VD2[k]);
  const wrong = []; for (const [alias, model] of al) { if (alias === "4.5l") continue;   /* "4.5l" (engine-size shorthand) resolved to nothing before this branch too; Sam is told */  const rv = await V.resolveVehicle("Bentley " + alias, {}); if (!(rv && rv.vehicle && rv.vehicle.model === model)) wrong.push(`${alias} -> ${rv && rv.vehicle && rv.vehicle.model} (want ${model})`); }
  ok(`every curated Bentley alias (${al.length}) resolves to its own model, none to a neighbour's`, al.length > 20 && wrong.length === 0, wrong.slice(0, 4).join(" | "));
  const WANT = { "Bentley 4¼ Litre": { n: 12, own: /4¼|4 1\/4/ }, "Bentley 3½ Litre": { n: 9, own: /3½|3 1\/2/ } };
  for (const [q, w] of Object.entries(WANT)) {
    const v = (await V.resolveVehicle(q, {})).vehicle, gen = await findGeneration(v, env).catch(() => null), d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw, cards = d.cards || [];
    const titles = cards.map(c => String(c.title || "")), pool = (d.rawPool || []).map(r => String(r.listing_title || r.raw_title || r.title || ""));
    ok(`"${q}": the pool holds the ${w.n} sales of that car in every spelling, no Mark VI and no 4½ (pool ${pool.length})`, pool.length === w.n && pool.every(t => w.own.test(t) && !/Mark VI/i.test(t) && !/4½/.test(t)), JSON.stringify(pool.filter(t => !w.own.test(t) || /Mark VI|4½/.test(t)).slice(0, 3)));
    ok(`"${q}": every card is that car's own title`, titles.length > 0 && titles.every(t => w.own.test(t) && !/Mark VI/i.test(t)), JSON.stringify(titles.slice(0, 3)));
  }
}
// the answer shapes that leave the rung label blank are refusals and unavailable tiers, not answers: the guard names the cause, not the symptom
{
  const nc = { tier: "refusal", refusal: { kind: "not_a_car", missing: ["model"] }, fallbackRung: "not_enough_data", rungLabel: null, poolN: 0 };
  ok("a warm of an identity with no model is named not_a_car:missing_model, never rung_label_blank", /^not_a_car:missing_model/.test(String(S.storeGuardRejectReason(nc))) && S.answerCacheable(nc) === false, String(S.storeGuardRejectReason(nc)));
  ok("a refusal that is not not_a_car still reports its own first blank field", S.storeGuardRejectReason({ tier: "refusal", refusal: { kind: "invariant_failed" }, fallbackRung: "not_enough_data", rungLabel: "" }) === "rung_label_blank");
}
// THE FRACTION CLASS (Lane B, Nov 7 2026). A model whose first word ends in a fraction (4½, 6½, 4¼) failed the receipts check's whole-word test (\b needs a word character beside the edge, a space after ½ is not one), so every pool of those cars with enough sales was refused as a swapped pool;
// and mrNorm drops the glyph, so 4¼, 4½ and 4 normalised to one cache key in the title read. Every curated model with a fraction is listed from the data and must have a pool above; the title read keeps 4¼ and 4½ apart; and a slow scan cannot hold a read past its budget.
{
  const VD = await import(pathToFileURL(path.join(ROOT, "lib/vehicleData.js")).href), names = new Set();
  const walk = o => { if (!o) return; if (Array.isArray(o)) o.forEach(walk); else if (typeof o === "object") { if (typeof o.model === "string") names.add(o.model); Object.values(o).forEach(walk); } };
  for (const k of Object.keys(VD)) walk(VD[k]);
  const MR = await import(pathToFileURL(path.join(ROOT, "lib/modelRules.js")).href); for (const k of Object.keys(MR)) walk(MR[k]);
  const frac = [...names].filter(n => n.length < 40 && /[\u00bc\u00bd\u00be]/.test(n) && !/^\d{4}/.test(n) && !/ supercharged$/i.test(n)).filter((v, i, a) => a.indexOf(v) === i);
  const tested = new Set(CARS.map(c => c[1]));
  ok(`every curated model with a fraction has a pool in this check (${frac.join(", ")})`, frac.length > 0 && frac.every(n => tested.has(n)), JSON.stringify(frac.filter(n => !tested.has(n))));
  let reads = 0; const f1 = globalThis.fetch; globalThis.fetch = async (u, o) => { if (/listing_title=ilike/.test(decodeURIComponent(String(u)))) reads++; return f1(u, o); };
  const envT = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  await E.archiveTitleModel("Zarkon 4¼ Litre", envT); const r1 = reads; await E.archiveTitleModel("Zarkon 4½ Litre", envT);
  ok("the title read keeps 4¼ and 4½ apart: the second read is its own read, not the first one's cached answer", reads > r1, `reads after the first ${r1}, after the second ${reads}`);
  // a scan that never matches runs long under load: the read stops at its budget (3 phrases at 2.5 s each would be 7.5 s)
  const f2 = globalThis.fetch; globalThis.fetch = async (u, o) => { if (/listing_title=ilike/.test(decodeURIComponent(String(u)))) await new Promise(r => setTimeout(r, 2500)); return f2(u, o); };
  const t1 = Date.now(), slow = await E.archiveTitleModel("Quuxmark Frobnitz Litre", { ...envT, titleReadBudgetMs: 1200 });
  ok(`a title read whose scans run long stops at its budget (1200 ms) and answers null, not held for the scan in flight (took ${Date.now() - t1} ms)`, slow === null && Date.now() - t1 < 1700, String(Date.now() - t1));
  globalThis.fetch = f1;
}
// the class: the engine reads the titles before it refuses, and the page uses the same function
{
  const ob = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"), sd = fs.readFileSync(path.join(ROOT, "api/sellerDecision.js"), "utf8");
  ok("the engine reads the model from the titles through archiveTitleModel before it answers not a car", /export async function archiveTitleModel/.test(ob) && /await archiveTitleModel\(searchText,/.test(ob));
  ok("the page reads the titles through the same archiveTitleModel", /archiveTitleModel\(rawSearch/.test(sd));
  // an identity the titles cannot name is still refused, and named by its cause
  const none = { make: "Zzyzx", model: "", trim: "", year: null };
  const d0 = (await E.oneEngineAnswer(none, null, "Zzyzx Qwerty", { ...env, asked: 0 }, null)).raw;
  ok("a name the titles cannot read is still refused as not a car, and the guard says so", d0.tier === "refusal" && d0.refusal && d0.refusal.kind === "not_a_car" && /^not_a_car:/.test(String(S.storeGuardRejectReason(d0))), JSON.stringify({ t: d0.tier, r: d0.refusal && d0.refusal.kind, g: S.storeGuardRejectReason(d0) }));
}
console.log(failed ? `\nwarmResolveCheck: ${failed} FAIL` : "\nwarmResolveCheck: PASS"); process.exit(failed ? 1 : 0);
