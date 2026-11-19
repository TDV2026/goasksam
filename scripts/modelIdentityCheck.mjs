// e94: the receipts are the car that was asked about. OldCarsData files some sales of one car under a neighbouring model's name
// (nine 2019 McLaren Senna and Senna GTR sales sat under model "Speedtail", so "2020 McLaren Speedtail" showed eight Senna
// receipts). The car's own title is its identity (rule 25). This covers the class, not the one car:
//   1. a title that names a neighbouring model of the make is a different car, for every make in the rival table;
//   2. the output gate fails a pool whose cards carry another model's title whatever the model column says;
//   3. a resolved car with no model is no longer waved through: a pool that mixes models fails, one model passes;
//   4. end to end on a fake archive, "2020 McLaren Speedtail" shows only Speedtail receipts.
// No database: a fake archive.   node scripts/modelIdentityCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const MR = await import(pathToFileURL(path.join(root, "lib/modelRules.js")).href);
const { oneEngineAnswer, runOutputInvariants } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };

// 1. the rule, for any make: the make's own model list decides (fake lists, including a make that exists nowhere else)
const LISTS = {
  McLaren: ["Speedtail", "Senna", "P1", "720S", "Artura"],
  Zorb: ["Alpha", "Beta", "Gammaray", "Delta7"],
  Lamborghini: ["Diablo", "Countach", "Murcielago", "Gallardo"],
  BMW: ["3-Series", "M3", "7-Series", "750i", "E9"],
  Chevrolet: ["Corvette", "Stingray", "Camaro"]
};
for (const [mk, names] of Object.entries(LISTS)) E.setMakeModels(mk, names.map(name => ({ name })));
const R = (mk, filed, title, year) => E.rivalFromModels(mk, filed, title, year, E.makeModelsCached(mk));
const PAIRS = [["McLaren", "Speedtail", "Senna"], ["McLaren", "Senna", "Speedtail"], ["Zorb", "Alpha", "Beta"], ["Zorb", "Beta", "Gammaray"], ["Lamborghini", "Diablo", "Countach"], ["Lamborghini", "Gallardo", "Murcielago"]];
for (const [mk, own, rival] of PAIRS) {
  ok(`rival: a ${rival} title filed under ${mk} ${own} is the other car`, R(mk, own, `2019 ${mk} ${rival}`, 2019) === rival);
  ok(`rival: a ${own} title filed under ${mk} ${own} is the car`, R(mk, own, `2020 ${mk} ${own}`, 2020) === null);
  ok(`rival: a mileage prefix does not hide it (${mk} ${rival})`, R(mk, own, `787-Mile 2019 ${mk} ${rival} Coupe`, 2019) === rival);
}
ok("rival: Senna GTR filed under Senna is the Senna family", R("McLaren", "Senna", "2020 McLaren Senna GTR", 2020) === null);
ok("rival: a code model is a family (M3 filed under 3-Series)", R("BMW", "3-Series", "2006 BMW M3 Coupe", 2006) === null);
ok("rival: a number model is a family (750i filed under 7-Series)", R("BMW", "7-Series", "2013 BMW 750Li", 2013) === null);
ok("rival: a trim word is not a model (Stingray filed under Corvette)", R("Chevrolet", "Corvette", "1969 Chevrolet Stingray", 1969) === null);
ok("rival: a model word later in the title is not the model (Zorb Alpha with Beta in the description)", R("Zorb", "Alpha", "2015 Zorb Alpha with Beta wheels", 2015) === null);
ok("rival: no model list for the make, no rival", E.rivalFromModels("Nowhere", "A", "2019 Nowhere B", 2019, E.makeModelsCached("Nowhere")) === null);
ok("rival: the year decides when the filed model's years fit", (() => { E.setMakeModels("Yrs", [{ name: "Oldie", year_ranges: [[1990, 2000]] }, { name: "Newbie", year_ranges: [[2010, 2020]] }]); return E.rivalFromModels("Yrs", "Oldie", "1995 Yrs Newbie", 1995, E.makeModelsCached("Yrs")) === null && E.rivalFromModels("Yrs", "Oldie", "2015 Yrs Newbie", 2015, E.makeModelsCached("Yrs")) === "Newbie"; })());

// 2 and 3. the gate
const card = (make, model, title, year) => ({ make, model, title, year, price: 1000000, platform: "Bring a Trailer" });
const gate = (d, v) => runOutputInvariants({ tier: "result", rawPool: d.cards, fallbackRung: "model", ...d }, v).find(x => x.name === "receipts_carry_resolved_car");
for (const [mk, own, rival] of PAIRS) {
  const cards = Array.from({ length: 6 }, (_, i) => card(mk, own, `${2015 + i} ${mk} ${rival}`, 2015 + i));
  const g = gate({ cards }, { make: mk, model: own });
  ok(`gate: six ${rival} titles filed under ${mk} ${own} fail`, g && g.ok === false, g && g.detail);
}
{ const cards = [card("McLaren", "Speedtail", "2020 McLaren Speedtail"), card("McLaren", "Speedtail", "2020 McLaren Speedtail"), card("McLaren", "Speedtail", "2020 McLaren Speedtail"), card("McLaren", "Speedtail", "2019 McLaren Senna", 2019)];
  const g = gate({ cards }, { make: "McLaren", model: "Speedtail" }); ok("gate: one Senna among four Speedtail stands (a minority stray is named, not a refusal)", g && g.ok === true, g && g.detail); }
{ const cards = Array.from({ length: 5 }, (_, i) => card("Porsche", "Zephyrine", `${2010 + i} Porsche Odd Thing`));
  const g = gate({ cards }, { make: "Porsche", model: "Zephyrine" }); ok("gate: a plain one-word model that no card title carries fails", g && g.ok === false, g && g.detail); }
{ const cards = [card("Ford", "Mustang", "1966 Ford Mustang Fastback"), card("Ford", "Mustang", "1967 Shelby GT350"), card("Ford", "Mustang", "1968 Ford Mustang GT"), card("Ford", "Mustang", "1969 Ford Mustang Mach 1")];
  const g = gate({ cards }, { make: "Ford", model: "Mustang" }); ok("gate: a Shelby title among Mustangs stands", g && g.ok === true, g && g.detail); }
{ const cards = Array.from({ length: 4 }, (_, i) => card("BMW", "3-Series", `${2006} BMW 325xi Sedan`));
  const g = gate({ cards }, { make: "BMW", model: "325i" }); ok("gate: 325xi still counts as the 325i", g && g.ok === true, g && g.detail); }
// no model
{ const mixed = [card("McLaren", "Senna", "2019 McLaren Senna"), card("McLaren", "Speedtail", "2020 McLaren Speedtail"), card("McLaren", "P1", "2015 McLaren P1"), card("McLaren", "720S", "2019 McLaren 720S")];
  const g = gate({ cards: mixed }, { make: "McLaren", model: null }); ok("gate: a resolved car with no model and four different models fails", g && g.ok === false, g && g.detail); }
{ const one = Array.from({ length: 4 }, () => card("McLaren", "Speedtail", "2020 McLaren Speedtail"));
  const g = gate({ cards: one }, { make: "McLaren", model: "" }); ok("gate: a resolved car with no model and one model in every card passes", g && g.ok === true, g && g.detail); }
{ const mixed = [card("Ferrari", "F40", "1990 Ferrari F40"), card("Ferrari", "F50", "1996 Ferrari F50"), card("Ferrari", "Enzo", "2003 Ferrari Enzo")];
  const g = gate({ cards: mixed }, { make: "Ferrari", model: undefined }); ok("gate: the same for a car whose model is undefined", g && g.ok === false, g && g.detail); }

// 4. end to end
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (title, year, price, ago, house) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "mi" + n, sale_price: price, sale_date: day(ago), platform: house ? "RM Sotheby's" : "Bring a Trailer", source_slug: house ? "rmsothebys" : "bringatrailer", make: "McLaren", model: "Speedtail", year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "500", body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Monterey", state: "CA", country_code: "US", auction_end_precision: null } }); };
for (let i = 0; i < 8; i++) sale("2019 McLaren Senna", 2019, 1100000 + i * 40000, 60 + i * 80, false);
sale("2020 McLaren Senna GTR", 2020, 1209000, 200, false);
for (let i = 0; i < 6; i++) sale("2020 McLaren Speedtail", 2020, 2000000 + i * 60000, 40 + i * 90, true);
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
  if (u.pathname.endsWith("/taxonomy_models")) { const slug = (u.searchParams.get("make_slug") || "").replace(/^eq\./, ""); const mk = Object.keys(LISTS).find(k => k.toLowerCase() === slug); return new Response(JSON.stringify(mk ? LISTS[mk].map(name => ({ name, year_ranges: null })) : []), { status: 200 }); }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const a = (await oneEngineAnswer({ make: "McLaren", model: "Speedtail", trim: "", year: 2020, bodyStyle: null }, null, "2020 McLaren Speedtail", env, null)).raw;
const titles = (a.cards || []).map(c => String(c.title || ""));
ok("end to end: no receipt on the Speedtail answer is a Senna", !titles.some(t => /senna/i.test(t)), `tier ${a.tier}, ${titles.length} cards: ${titles.slice(0, 3).join(" | ")}`);
ok("end to end: the answer is made of Speedtail sales or says there are too few", a.tier === "result" || a.tier === "thin" || a.tier === "not_tracked", `tier ${a.tier}`);
ok("end to end: the pool never holds a 2019 year", !(a.poolYears || []).some(y => y === 2019), JSON.stringify(a.poolYears));
ok("fence: a sale whose title names the asked model is kept even when filed elsewhere", E.titleFenceReason({ titleRival: "Senna", raw_title: "2019 McLaren Senna", price: 1e6, model: "Speedtail", make: "McLaren" }, { make: "McLaren", model: "Senna" }) === null || /photo|floor/.test(String(E.titleFenceReason({ titleRival: "Senna", raw_title: "2019 McLaren Senna", model: "Speedtail", make: "McLaren" }, { make: "McLaren", model: "Senna" }))));
ok("fence: the same sale is out of the Speedtail pool", /different model/.test(String(E.titleFenceReason({ titleRival: "Senna", raw_title: "2019 McLaren Senna", model: "Speedtail", make: "McLaren" }, { make: "McLaren", model: "Speedtail" }))));
console.log(failed ? `modelIdentityCheck: ${failed} FAIL` : "modelIdentityCheck: all PASS");
process.exit(failed ? 1 : 0);
