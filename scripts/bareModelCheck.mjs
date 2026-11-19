// A BARE MODEL NAME, A MAKE AND MODEL TYPED WITH ITS MAKE, A BADGE TWIN AND A STYLE WORD NEVER READ AS NOTHING OR AS A TRIM (Lane B, Nov 1 2026; the reader's "Capri" and "Mercury Capri" found nothing while a live BaT listing,
// "RS-Style, 2.8L V6-Powered 1974 Mercury Capri 5-Speed", sat in the table). CAUSES: (1) the resolver knows a model only through the seeded taxonomy, so a bare model name resolved to no car; (2) the listing itself fell out
// of every search on two title rules: "-Style" read as memorabilia and "2.8L V6-Powered" read as an engine swap (the Capri's factory V6); (3) Mercury Capri and Ford Capri were never linked for a request with no make;
// (4) a generation phrase on the typed path became a trim named Mk1. WHO ELSE: every model in the generation table, every twin group in lib/badgeAliases.js, every title with a style word.
// This check walks the tables: every model in the generation table, bare and with its make, on Find (typed search), Market Check (the one resolver + the engine), the chat tool and Tasks; every twin group with no make
// (all makes) and with a make (that make); a style word on a car that never sets its trim. It fails without the fix.
//   node scripts/bareModelCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv.slice(2).find(a => !a.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const STYLE_MODE = process.argv.includes("--style");
let LIVE = [], SALES = [];
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), sp = u.searchParams;
  if (!/fake\.supabase/.test(u.hostname)) return new Response("", { status: 500 });
  if (/generations/.test(u.pathname)) return new Response("", { status: 500 });
  if (/taxonomy/.test(u.pathname)) {   // the style cases run with a small taxonomy (every make and model they use); the walk runs with none, the strict case
    if (!STYLE_MODE) {   // the walk: the taxonomy knows the makes and NO models (the worst case a model name can meet: every model comes from the generation and badge twin tables)
      if (u.pathname.endsWith("taxonomy_makes")) return new Response(JSON.stringify((globalThis.__MAKES || []).map(name => ({ name }))), { status: 200 });
      return new Response("[]", { status: 200 });
    }
    const slug = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const MK = { Ford: ["Mustang"], Mercury: ["Cougar", "Capri"], Porsche: ["911"], Chevrolet: ["Camaro", "Corvette"] };
    if (u.pathname.endsWith("taxonomy_makes")) return new Response(JSON.stringify(Object.keys(MK).map(name => ({ name }))), { status: 200 });
    if (u.pathname.endsWith("taxonomy_aliases")) return new Response("[]", { status: 200 });
    const ms = sp.get("make_slug"), sl = sp.get("slug");
    if (ms) { const mk = Object.keys(MK).find(k => slug(k) === ms.replace(/^eq\./, "")); return new Response(JSON.stringify((MK[mk] || []).map(name => ({ name, year_ranges: null }))), { status: 200 }); }
    if (sl) { const tok = sl.replace(/^(like|eq)\./, "").replace(/\*/g, ""); const rows = []; for (const [k, ms2] of Object.entries(MK)) for (const m of ms2) if (slug(m).includes(tok)) rows.push({ name: m, make_slug: slug(k) }); return new Response(JSON.stringify(rows), { status: 200 }); }
    return new Response("[]", { status: 200 });
  }   // the resolver falls back to its curated lists, as it does with the tables unreachable (the strict case: nothing the taxonomy might add)
  if (u.pathname.endsWith("/live_listings")) {
    const rg = String((init && init.headers && (init.headers.Range || init.headers.range)) || ""), off = Number((/^(\d+)-/.exec(rg) || [])[1] || sp.get("offset") || 0);
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, ""));
    return new Response(JSON.stringify(off > 0 ? [] : LIVE.filter(r => !mk || mk.test(r.make))), { status: 200 });
  }
  if (u.pathname.endsWith("/sales_archive")) {
    const sel = sp.get("select") || "", ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = SALES.filter(r => r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    const cols = sel.split(",").map(it => { const ci = it.indexOf(":"); const a = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null, ex = a ? it.slice(ci + 1) : it; return [a || (ex.startsWith("raw_record->>") ? ex.slice(13) : ex), ex]; });
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(cols.map(([a, ex]) => [a, ex.startsWith("raw_record->>") ? (r.raw_record[ex.slice(13)] ?? null) : (ex === "price" ? r.sale_price : ex === "auction_end_date" ? r.sale_date : r[ex] ?? null)])))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const S = await import(pathToFileURL(path.join(root, "lib/live/samChat.js")).href), L = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const soon = new Date(Date.now() + 6 * 864e5).toISOString();
let id = 0;
const live = (make, model, year, title) => ({ id: "L" + ++id, source: "bringatrailer", make, model, year, listing_title: title || `${year} ${make} ${model}`, current_bid_usd: 21000, end_time: soon, country: "US", photo_url: "https://x/i.jpg", status: "live", mileage: 50000 });
const OTHERS = [live("Ford", "Mustang", 1972, "1972 Ford Mustang Mach 1"), live("Ford", "Ranchero", 1974), live("Ford", "F-350", 1973), live("Ford", "Bronco", 1972), live("Ford", "F-100", 1968), live("Ford", "Mustang", 1968, "1968 Ford Mustang Coupe"),
  live("Porsche", "911", 1972, "1972 Porsche 911 T"), live("Chevrolet", "Corvette", 1970), live("Ford", "Pinto", 1973), live("Mercury", "Cougar", 1972)];
const titles = r => (r.matches || []).map(x => x.r.listing_title);
const CARS = [
  { name: "Ford Capri", p: { make: "Ford", model: "Capri" }, word: /capri/i },
  { name: "Ford Capri RS", p: { make: "Ford", model: "Capri", trim: "RS" }, word: /capri/i },
  { name: "De Tomaso Pantera", p: { make: "De Tomaso", model: "Pantera" }, word: /pantera/i },
  { name: "Opel GT", p: { make: "Opel", model: "GT" }, word: /\bgt\b/i }
];
const sale = (make, year, title, price, model = "Capri") => ({ id: "S" + ++id, source_id: "s" + id, sale_price: price, sale_date: new Date(Date.now() - (30 + id) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + id, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, model_family: model,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + id, source_url: null, city: "Austin", state: "TX", country_code: "US" } });
const FORD = [], M70 = [], M80 = [], M90 = [];
for (let i = 0; i < 6; i++) FORD.push(sale("Ford", 1970 + (i % 4), `${1970 + (i % 4)} Ford Capri 2000 GT`, 14000 + i * 500));
for (let i = 0; i < 5; i++) M70.push(sale("Mercury", 1971 + (i % 4), `${1971 + (i % 4)} Mercury Capri`, 12000 + i * 500));
for (let i = 0; i < 5; i++) M80.push(sale("Mercury", 1980 + i, `${1980 + i} Mercury Capri GS`, 6000 + i * 300));
for (let i = 0; i < 3; i++) M90.push(sale("Mercury", 1991 + i, `${1991 + i} Mercury Capri XR2`, 8000 + i * 300));
const PANTERA = Array.from({ length: 12 }, (_, i) => sale("De Tomaso", 1972 + (i % 3), `${1972 + (i % 3)} De Tomaso Pantera`, 90000 + i * 2500, "Pantera"));
SALES = FORD.slice(0, 3).concat(PANTERA);   // the archive holds three Capri sales (thin) and twelve Pantera sales for every section below

const { CURATED_GENERATIONS } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const BT = await import(pathToFileURL(path.join(root, "lib/badgeAliases.js")).href).catch(() => ({}));
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const O = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const TWINS = BT.BADGE_TWINS || [{ model: "Capri", makes: ["Ford", "Mercury"] }];
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pairs = []; { const seen = new Set(); for (const g of CURATED_GENERATIONS) { const k = g.make + "|" + g.model; if (!seen.has(k)) { seen.add(k); pairs.push({ make: g.make, model: g.model, year: Math.min(g.yearStart + 2, g.yearEnd) }); } } }
for (const t of TWINS) for (const mk of t.makes) if (!pairs.some(p => norm(p.make) === norm(mk) && norm(p.model) === norm(t.model))) pairs.push({ make: mk, model: t.model, year: 1990 });
// one live listing and four sales for every make and model, each titled with its own year, make and model
LIVE = pairs.map(p => live(p.make, p.model, p.year, `${p.year} ${p.make} ${p.model}`));
SALES = pairs.flatMap(p => [0, 1, 2, 3].map(i => sale(p.make, p.year, `${p.year} ${p.make} ${p.model}`, 20000 + i * 500, p.model)));
globalThis.__MAKES = [...new Set(pairs.map(p => p.make).concat(["Ford", "Mercury", "Porsche"]))];
const idx = new Map(pairs.map(p => [norm(p.make) + "|" + norm(p.model), p]));
const gotTitles = rows => (rows || []).map(x => (x.r ? x.r.listing_title : x.listing_title));
const group = p => TWINS.find(t => norm(t.model) === norm(p.model) && t.makes.some(m => norm(m) === norm(p.make)));
const has = (titles, p) => titles.includes(`${p.year} ${p.make} ${p.model}`);
const surfaces = async text => {
  const r = await L.parseQueryResolved(text, env).catch(() => null), v = r && r.vehicle;
  const find = v ? gotTitles((await L.searchLive(env, v, r.filters, r.text).catch(() => ({ rows: [] }))).rows) : [];
  const rv = await V.resolveVehicle(text, {}).catch(() => null), mv = rv && rv.vehicle && rv.vehicle.make && rv.vehicle.model ? rv.vehicle : null;
  const mc = mv ? await O.oneEngineAnswer(mv, null, text, env).catch(() => null) : null;
  const sp = v && v.make && v.model ? (v.bareModel ? { model: v.model } : { make: v.make, model: v.model, ...(v.trim ? { trim: v.trim } : {}) }) : null, tasks = sp ? gotTitles((await S.runSearch(env, sp, {}).catch(() => ({ matches: [] }))).matches) : [];
  return { find, mcPool: mc ? Number(mc.poolSize) || 0 : 0, mcMake: mv && mv.make, tasks, chat: null };
};
if (STYLE_MODE) {
// Market Check reads sales for the Capri under every way of typing it (the engine, not a page, decides the pool)
{ SALES = FORD.concat(M70); LIVE = [];
  for (const t of ["Capri", "Ford Capri", "Mercury Capri", "first gen Capri", "first gen Ford Capri", "1974 Mercury Capri"]) { const rv = await V.resolveVehicle(t, {}); const a = rv && rv.vehicle && rv.vehicle.model ? await O.oneEngineAnswer(rv.vehicle, null, t, env).catch(() => null) : null; ok(`Market Check "${t}": the Capri sales are read`, !!a && Number(a.poolSize) > 0, JSON.stringify(a && { tier: a.tier, pool: a.poolSize })); } }
// ---- the style words: a title word never turns a car into that trim, and never takes the car out of the search
const STYLE = [["Mercury", "Capri", 1974, "RS-Style, 2.8L V6-Powered 1974 Mercury Capri 5-Speed", "RS"], ["Ford", "Mustang", 1969, "Mach 1-Style 1969 Ford Mustang", "Mach 1"], ["Porsche", "911", 1987, "GT3-Look 1987 Porsche 911 Carrera", "GT3"],
  ["Chevrolet", "Camaro", 1969, "Z28-Style 1969 Chevrolet Camaro", "Z28"], ["Chevrolet", "Corvette", 1970, "ZR1-Inspired 1970 Chevrolet Corvette", "ZR1"]];
for (const [mk, md, yr, title, trim] of STYLE) {
  LIVE = [live(mk, md, yr, title)];
  const typed = gotTitles((await S.runSearch(env, { make: mk, model: md }, {}).catch(() => ({ matches: [] }))).matches);
  ok(`"${title}": the ${md} is in a search for the ${mk} ${md}`, typed.includes(title), JSON.stringify(typed));
  const rt = gotTitles((await S.runSearch(env, { make: mk, model: md, trim }, {}).catch(() => ({ matches: [] }))).matches);
  ok(`"${title}": it is not a ${trim}, a search for the ${trim} does not return it`, !rt.includes(title), JSON.stringify(rt));
  const sp = await L.specOf(env, { make: mk, model: md, year: yr, listing_title: title, mileage: 50000 }, L.listingFacts({ make: mk, model: md, year: yr, listing_title: title })).catch(e => { console.log("SPECERR", String(e && e.stack).slice(0, 300)); return null; });
  ok(`"${title}": the engine's read of the car sets no ${trim} trim`, !!(sp && sp.v) && !new RegExp("\\b" + trim.replace(/ /g, "\\s*") + "\\b", "i").test(String(sp.v.trim || "")), JSON.stringify(sp && sp.v && { make: sp.v.make, model: sp.v.model, trim: sp.v.trim }));
}
LIVE = [live("Ford", "Mustang", 1969, "Replica 1969 Ford Mustang Mach 1 Tribute")];
{ const t = gotTitles((await S.runSearch(env, { make: "Ford", model: "Mustang" }, {}).catch(() => ({ matches: [] }))).matches); ok("control: a tribute or replica is still left out of a plain search (only the style words changed)", !t.length, JSON.stringify(t)); }
  console.log(fail ? `bareModelCheck style: ${fail} FAIL` : "bareModelCheck style: all pass");
  process.exit(fail ? 1 : 0);
}
LIVE = pairs.map(p => live(p.make, p.model, p.year, `${p.year} ${p.make} ${p.model}`));
SALES = pairs.flatMap(p => [0, 1, 2, 3].map(i => sale(p.make, p.year, `${p.year} ${p.make} ${p.model}`, 20000 + i * 500, p.model)));
const bad = { bare: [], typed: [], twinBare: [], twinTyped: [] };
for (const p of pairs) {
  const g = group(p);
  const want = g ? pairs.filter(q => g.makes.some(m => norm(m) === norm(q.make)) && norm(q.model) === norm(p.model)) : [p];
  if (!g || norm(g.makes[0]) === norm(p.make)) {                       // the bare model name, once per model (a twin group on its first make)
    const b = await surfaces(p.model);
    const chat = gotTitles((await S.runSearch(env, { model: p.model }, {}).catch(() => ({ matches: [] }))).matches);
    const miss = [];
    for (const q of want) { if (!has(b.find, q)) miss.push("find:" + q.make); if (!has(b.tasks, q)) miss.push("tasks:" + q.make); if (!has(chat, q)) miss.push("chat:" + q.make); }
    if (!b.mcMake) miss.push("market check");
    (g ? bad.twinBare : bad.bare).push(...(miss.length ? [`${p.model} (${p.make}): ${miss.join(", ")}`] : []));
  }
  const t = await surfaces(`${p.make} ${p.model}`);
  const chat = gotTitles((await S.runSearch(env, { make: p.make, model: p.model }, {}).catch(() => ({ matches: [] }))).matches);
  const miss = []; if (!has(t.find, p)) miss.push("find"); if (!has(t.tasks, p)) miss.push("tasks"); if (!has(chat, p)) miss.push("chat"); if (!t.mcMake) miss.push("market check");
  if (miss.length) (g ? bad.twinTyped : bad.typed).push(`${p.make} ${p.model}: ${miss.join(", ")}`);
}
const nm = pairs.length, nt = TWINS.length;
ok(`every bare model name in the generation table finds its car on Find, Market Check, the chat and Tasks (${nm} makes and models)`, bad.bare.length === 0, bad.bare.slice(0, 6).join(" | ") + (bad.bare.length > 6 ? ` ... ${bad.bare.length} in all` : ""));
ok(`every make and model typed with its make finds its car on all four surfaces (${nm})`, bad.typed.length === 0, bad.typed.slice(0, 6).join(" | ") + (bad.typed.length > 6 ? ` ... ${bad.typed.length} in all` : ""));
ok(`a model request with no make reads every make of each badge twin group, all four surfaces (${nt} groups: ${TWINS.map(t => t.makes.join("/") + " " + t.model).join("; ")})`, bad.twinBare.length === 0, bad.twinBare.join(" | "));
ok("a twin typed with its make finds that make's car on all four surfaces", bad.twinTyped.length === 0, bad.twinTyped.join(" | "));
{ const { spawnSync } = await import("node:child_process"); const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), root, "--style"], { encoding: "utf8", timeout: 120000 });
  for (const line of String(r.stdout || "").split("\n")) if (/^(PASS|FAIL)/.test(line)) { console.log(line); if (line.startsWith("FAIL")) fail++; } }
console.log(fail ? `bareModelCheck: ${fail} FAIL` : "bareModelCheck: all pass");
process.exit(fail ? 1 : 0);
