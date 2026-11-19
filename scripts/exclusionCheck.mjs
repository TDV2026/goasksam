// EXCLUSIONS: A WORD AFTER "NOT" REMOVES CARS, IT NEVER NARROWS TOWARD THEM (Lane B, Nov 1 2026; a reader's /feedback: "ND Miatas that are NOT RF" returned an RF Miata). Worked offline on a fake archive; no production read.
// CAUSE: nothing read a negation. The resolver took "not GT" as trim GT, "except convertible" as body convertible, "excluding Targa" as trim Targa, "no automatic" as an automatic filter, "not a V8" as a V8 filter, and the NOT itself was dropped as filler.
// FIX: lib/exclusions.js takes the negated phrase out of the text before any reader sees it and carries it as a key (not:rf); the engine removes the sales that carry the word and says what it removed (typedAttributeLines), or says no sale states it;
// Find removes the listings and returns excluded[] with the same words. CLASS: every negation form (not, no, non, non-, without, w/o, except, excluding, other than, anything but, isn't, "-RF", NOT in capitals) on every attribute kind (trim, body, gearbox, engine, drive, colour,
// generation, equipment, any title word). This check fails without the fix.
//   node scripts/exclusionCheck.mjs [repo root]
import fs from "fs";
const EPOCH = "2026-10-28T19:34:12.871Z"; let archiveReads = 0; const STORE = new Map();
const cacheFetch = async (u, init) => {
  if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
  if (init && init.method === "DELETE") { STORE.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response("", { status: 204 }); }
  const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""), r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
};
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (model, body, tx, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pa" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: MK, model, year: 2001,
  listing_title: `2001 ${MK} ${model} ${body}${tx ? " " + tx : ""}`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const DELAY = 250;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) return cacheFetch(u, init);
  if (u.pathname.endsWith("/app_config")) return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  await new Promise(r => setTimeout(r, DELAY));
  if (u.pathname.endsWith("/sales_archive")) archiveReads++;
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
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };

const {exclusionsIn, exclusionByKey, rowExcluded} = await import(pathToFileURL(path.join(root, "lib/exclusions.js")).href).catch(() => ({}));
ok("lib/exclusions.js exists", typeof exclusionsIn === "function");
// 1. THE PARSE: every negation form, every attribute kind. The phrase leaves the text; the key is the attribute
const FORMS = [
  ["ND Miatas that are NOT RF", "rf"], ["ND Miata not RF", "rf"], ["Miata -RF", "rf"], ["Miata isn't an RF", "rf"], ["Miata that isn't an RF", "rf"], ["MIATA NOT RF", "rf"],
  ["Mustang non-GT", "gt"], ["Mustang non GT", "gt"], ["Mustang without GT", "gt"], ["Mustang excluding GT", "gt"], ["Mustang other than GT", "gt"], ["Mustang anything but GT", "gt"],
  ["BMW M3 except convertible", "convertible"], ["BMW M3 NOT convertible", "convertible"], ["BMW M3 no cabriolet", "convertible"],
  ["911 excluding Targa", "targa"], ["911 not a Targa", "targa"], ["Porsche 550 not a Spyder", "spyder"], ["911 not a coupe", "coupe"], ["Land Rover not a wagon", "wagon"],
  ["Corvette no automatic", "automatic"], ["Corvette non-automatic", "automatic"], ["Corvette without a manual", "manual"], ["Mustang not a V8", "v8"], ["Porsche 911 not Turbo", "turbo"], ["Camaro not supercharged", "supercharged"],
  ["Land Cruiser not AWD", "awd"], ["Ferrari not red", "c_red"], ["Porsche 911 no black", "c_black"], ["911 without sunroof", "sunroof"], ["Corvette w/o A/C", "aircon"],
  ["Camaro other than Z28", "w_z28"], ["911 not 996", "w_996"], ["Mustang not GT or V8", "gt,v8"], ["Mustang not GT, not V8", "gt,v8"]
];
if (exclusionsIn) for (const [t, want] of FORMS) { const r = exclusionsIn(t), got = r.items.map(i => i.id).sort().join(","); ok(`"${t}" excludes ${want}`, got === want.split(",").sort().join(","), got + " | " + r.clean); }
// not exclusions: left alone
if (exclusionsIn) for (const t of ["Mustang no reserve", "911 no more than 50k miles", "911 not over 80k", "Mustang GT", "2019 Porsche 911 under $80k", "Honda Civic Type R"]) ok(`"${t}" is not an exclusion`, exclusionsIn(t).items.length === 0 && exclusionsIn(t).clean === t);
// 2. THE RESOLVER NEVER READS THE NEGATED WORD AS A TRIM, BODY OR MODEL
for (const [t, bad] of [["Mustang non-GT", "trim"], ["Porsche 911 not Turbo", "trim"], ["BMW M3 except convertible", "bodyStyle"], ["911 excluding Targa", "trim"], ["Camaro other than Z28", "trim"], ["Mustang not a V8", "trim"]]) {
  const v = (await resolveVehicle(t, {})).vehicle || {}; ok(`the resolver does not take the negated word of "${t}" as a ${bad}`, !v[bad], String(v[bad]));
}
// 3. THE ENGINE: a 1965 Mustang Fastback pool with GT cars in it (the shape the question check proves answers; the reader's RF Miata is the same shape: a trim word in some titles)
MK = "Ford"; rows = [];
const mk2 = (title, price, ago, extra = {}) => { mkS("Ford", "Mustang", title, price, ago, 1965); const r = rows[rows.length - 1]; r.raw_record.body_style = "Fastback"; if (extra.tx) r.raw_record.transmission = extra.tx; if (extra.colour) r.raw_record.exterior_color = extra.colour; };
for (let i = 0; i < 14; i++) mk2(`1965 Ford Mustang Fastback ${i % 2 ? "4-Speed Manual" : ""}`.trim(), 52000 + i * 400, 20 + i * 15, { colour: i % 3 ? "Wimbledon White" : "Rangoon Red", tx: i % 2 ? "Manual" : "Automatic" });
for (let i = 0; i < 7; i++) mk2(`1965 Ford Mustang Pony Fastback`, 71000 + i * 500, 25 + i * 20, { tx: "Manual", colour: "Wimbledon White" });
const TEXT = "1965 Mustang Fastbacks that are NOT Pony", rvm = await resolveVehicle(TEXT, {}), vm = rvm.vehicle || {}, gm = await findGeneration(vm, env).catch(() => null);
ok("the Mustang resolves with no Pony trim", !!vm.make && !vm.trim, JSON.stringify([vm.make, vm.model, vm.trim, vm.bodyStyle]));
const hasGT = o => /\bPony\b/.test(JSON.stringify(o));
const bare = (await E.oneEngineAnswer(vm, gm, "1965 Mustang Fastbacks", { ...env, asked: 0 }, null)).raw;
const ex = (await E.oneEngineAnswer(vm, gm, TEXT, { ...env, asked: 0 }, null)).raw;
console.log(`INFO  bare: tier ${bare.tier}, ${bare.poolN} sales; excluded: tier ${ex.tier}, ${ex.poolN} sales; lines: ${JSON.stringify(ex.typedAttributeLines)}`);
ok("without the exclusion the pool does carry Pony cars (the fixture is real)", hasGT(bare.rawPool || bare.cards || []) && bare.poolN === 21, String(bare.poolN));
ok("an excluded word never appears in the sales the answer shows (rawPool)", (ex.rawPool || []).length > 0 && !hasGT(ex.rawPool || []), String((ex.rawPool || []).length));
ok("... nor in the cards, the closest sale, the options or the lines", !hasGT(ex.cards || []) && !hasGT(ex.options || []) && !hasGT(ex.closest || {}));
ok("the pool is the 14 other cars, so the range is theirs", ex.poolN === 14, `${ex.poolN} vs ${bare.poolN}`);
const lines = (ex.typedAttributeLines || []).join(" ");
ok("the announcement says what was excluded", /Left out the 7 of 21 sales that say Pony/.test(lines), lines);
ok("the typed attribute is an exclusion with a count", (ex.typedAttributes || []).some(a => a.key === "not:w_pony" && a.status === "excluded" && a.matched === 7), JSON.stringify(ex.typedAttributes));
// 4. other attribute kinds on the same pool: gearbox, colour, a word no sale carries, a word sales rarely state
const run = async (text) => (await E.oneEngineAnswer(vm, gm, text, { ...env, asked: 0 }, null)).raw;
const noAuto = await run("1965 Mustang Fastbacks no automatic"); ok("no automatic: no automatic sale is shown and the manual cars stay", (noAuto.rawPool || []).length > 0 && (noAuto.rawPool || []).every(r => E.gearboxType(r) !== "auto"), String(noAuto.poolN));
const noRed = await run("1965 Mustang Fastbacks not red"); ok("not red: no red sale is shown", (noRed.rawPool || []).length > 0 && (noRed.rawPool || []).every(r => !/red/i.test(String((r.raw_record && r.raw_record.exterior_color) || r.exterior_color || ""))), String(noRed.poolN));
const none = await run("1965 Mustang Fastbacks not Targa"); ok("a word no sale carries removes nothing and the answer says so", none.poolN === 21 && /No sale here says Targa, so none was left out/.test((none.typedAttributeLines || []).join(" ")), (none.typedAttributeLines || []).join(" "));
const sun = await run("1965 Mustang Fastbacks without sunroof"); ok("an exclusion on a word sales rarely state is said to be partial, never silent", /sunroof/i.test((sun.typedAttributeLines || []).join(" ")) && /do not say|stay silent/.test((sun.typedAttributeLines || []).join(" ")), (sun.typedAttributeLines || []).join(" "));
const allGone = await run("1965 Mustang Fastbacks not Mustang"); ok("excluding every sale still answers (thin or empty), never a crash", !!allGone && !!allGone.tier, String(allGone && allGone.tier));
// 5. the exclusion has its own stored row (a key without it is unchanged)
const kBare = S.specKeyFor(vm, gm, null), kEx = S.specKeyFor(vm, gm, { attrs: ["not:w_pony"] });
ok("an exclusion keys its own row; the bare row's key is unchanged", kBare !== kEx && !/not:w_pony/.test(kBare) && /not:w_pony/.test(kEx));
// 6. FIND: the same words remove listings
{ const SR = S; const f = SR.parseQuery("ND Miata not RF").filters, f2 = SR.parseQuery("Ferrari not red").filters, f3 = SR.parseQuery("BMW M3 except convertible").filters;
  ok("Find: 'not RF' is an exclusion, not a search word", f.notWords.includes("not:rf") && !/\bRF\b/i.test(SR.parseQuery("ND Miata not RF").text), JSON.stringify(f.notWords) + " | " + SR.parseQuery("ND Miata not RF").text);
  ok("Find: 'not red' keeps its colour exclusion", f2.notColours.includes("red") && !f2.colours.includes("red"));
  ok("Find: 'except convertible' is no body filter", f3.notWords.includes("not:convertible") && !f3.bodies.length, JSON.stringify([f3.notWords, f3.bodies])); }
// 7. every page reads the same engine: the sources that read the typed text for a word read it through the exclusion reader
const src = f => fs.readFileSync(path.join(root, f), "utf8").replace(/\/\/[^\n]*/g, "");
ok("the resolver, the typed attributes, the gearbox read and Find all go through lib/exclusions.js", /exclusionsIn/.test(src("lib/vehicle.js")) && /exclusionsIn/.test(src("lib/typedAttributes.js")) && /exclusionsIn\(`\$\{searchText/.test(src("lib/onebox.js")) && /exclusionsIn/.test(src("lib/live/search.js")));
console.log(failed ? `exclusionCheck: ${failed} failure(s)` : "exclusionCheck: all pass");
process.exit(failed ? 1 : 0);
