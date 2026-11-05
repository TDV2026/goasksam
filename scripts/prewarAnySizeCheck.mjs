import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (year, body, price, ago) => { n++; const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, HOUSE = globalThis.HOUSE && globalThis.HOUSE(n, body); const title = `${year} ${CAR.make} ${CAR.model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: HOUSE ? "Gooding & Co" : "Bring a Trailer", source_slug: HOUSE ? "gooding" : "bringatrailer", make: CAR.make, model: CAR.model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: HOUSE ? null : "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const build = year => { rows = []; for (const [body, base, cnt] of (globalThis.SHAPE || [["Roadster", 50000, 9], ["Phaeton", 50150, 9], ["Sedan", 49900, 9]])) for (let i = 0; i < cnt; i++) sale(year, body, base + (i % 5) * 700, 20 + i * 14 + (body === "Sedan" ? 3 : body === "Phaeton" ? 6 : 0)); };
const read = async year => { build(year); const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, veh = { year, make: CAR.make, model: CAR.model }, q = `${year} ${CAR.make} ${CAR.model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };   // as served: the pre-war keys are the engine's, a reader sees the plain word
// PRE-WAR BODIES AT ANY POOL SIZE (Lane B, Nov 5 2026; Sam approved the rule; PREWAR_BODY_TAG pwb4). THE CLASS: a car before 1949 whose pool holds sales of two or more bodies is shown with its bodies apart whatever the pool size. Live, the 1936 Delahaye 135
// (six sales over four bodies) read as one thin list because the apart rule only ran for pools of eight or more. Must hold for EVERY pre-war car and every pool size from 2 to 7 sales:
//  (1) optionsState apart, headline dimension body, one option per body with its own count, NO pooled headline (cluster null, no reference figure);
//  (2) a range only for a body with 3 or more sales (low and high numbers); a body with fewer says "N sales, too few for a range" and has no range;
//  (3) each body carries the ids of its own sales; the ids of every body plus the "body not stated" sales add up to the pool;
//  (4) sales whose title names no body are one "Body not stated" line with their count, never a body of their own and never dropped;
//  (5) one body only (or none stated): the single pool stays, no options; a car of 1949 or later is untouched; no pw_ key and no dash in any line;
//  (6) the stored-row tag: a pre-war thin row without the current tag is read as no row, with it is kept, and a post-war row is untouched.
//   node scripts/prewarAnySizeCheck.mjs [repo root]      (a tree without the rule fails it)
const CARS = [["Delahaye", "135", 1936], ["Cadillac", "V-16", 1930], ["Duesenberg", "Model J", 1931], ["Auburn", "851", 1935], ["Mercedes-Benz", "540K", 1939], ["Packard", "Twelve", 1934], ["Bugatti", "Type 57", 1948]];
// pool shapes: [body, base price, count]; "" is a title that names no body
const SHAPES = [
  [["Convertible", 150000, 2], ["Cabriolet", 160000, 1], ["Coupe", 120000, 3]],                 // six sales, three bodies, one with a range
  [["Roadster", 90000, 5], ["Sedan", 70000, 1]],                                                  // six sales, a range for one, a single sale for the other
  [["Coupe", 100000, 2], ["Sedan", 90000, 2]],                                                    // four sales, two bodies, no range anywhere
  [["Roadster", 90000, 3], ["Phaeton", 95000, 3], ["Sedan", 60000, 1]],                           // seven sales, two ranges
  [["Roadster", 90000, 2], ["Sedan", 70000, 2], ["", 80000, 2]],                                  // two sales name no body
  [["Roadster", 90000, 1], ["Sedan", 70000, 1]]                                                   // two sales
];
let checked = 0;
for (const [make, model, year] of CARS) for (const shape of SHAPES) {
  globalThis.CAR = { make, model }; globalThis.SHAPE = shape; globalThis.HOUSE = null;
  const d = await read(year), o = d.options || [], tag = `${year} ${make} ${model} ${shape.map(x => (x[0] || "none")[0] + x[2]).join("/")}`;
  const named = shape.filter(x => x[0]), pool = shape.reduce((t, x) => t + x[2], 0), unst = shape.filter(x => !x[0]).reduce((t, x) => t + x[2], 0);
  checked++;
  ok(`${tag}: bodies apart, no pooled headline`, d.optionsState === "apart" && d.headlineDimension === "body" && !d.cluster && !(d.referenceFigure > 0), JSON.stringify({ tier: d.tier, state: d.optionsState, dim: d.headlineDimension, cluster: d.cluster }));
  ok(`${tag}: one option per body with its own count`, o.length === named.length && named.every(x => o.some(y => y.n === x[2] && (new RegExp(x[0].slice(0, 4), "i")).test(y.label))), JSON.stringify(o.map(x => x.label + " " + x.n)));
  ok(`${tag}: a range only at 3 or more sales, the rest say too few for a range`, o.every(x => x.n >= 3 ? (x.low > 0 && x.high >= x.low && x.rangeFloor === false) : (x.low == null && x.high == null && x.rangeFloor === true)) && (d.optionLines || []).filter(l => /too few for a range/.test(l)).length === o.filter(x => x.n < 3).length, JSON.stringify(d.optionLines));
  const ids = new Set((d.cards || []).map(c => c.id)), claimed = o.flatMap(x => x.saleIds || []).concat((d.bodyNotStated && d.bodyNotStated.saleIds) || []);
  ok(`${tag}: each body's own sales are named, together they are the pool`, o.every(x => (x.saleIds || []).length === x.n) && claimed.length === pool && claimed.every(i => ids.has(i)) && new Set(claimed).size === claimed.length, `claimed ${claimed.length} of ${pool} (cards ${ids.size})`);
  if (unst) ok(`${tag}: the sales that name no body are one "Body not stated" line with their count`, !!d.bodyNotStated && d.bodyNotStated.n === unst && /^Body not stated, \d+ sales?$/.test(d.bodyNotStated.line) && !o.some(x => /not stated/i.test(x.label)), JSON.stringify(d.bodyNotStated));
  else ok(`${tag}: no body-not-stated line when every sale names a body`, !d.bodyNotStated);
  ok(`${tag}: no engine key and no dash in any line`, !/pw_/i.test(JSON.stringify([o.map(x => x.label), d.optionLines, d.chipLines, d.pickLines, d.headlineLines, d.bodyNotStated])) && !/[\u2013\u2014]/.test(JSON.stringify([d.optionLines, d.bodyNotStated])));
}
console.log(`checked ${checked} pre-war car and pool combinations`);
// (5) one body only keeps the single pool; post-war is untouched
for (const [name, shape, yr] of [["one body only", [["Roadster", 90000, 4]], 1936], ["one body and sales naming none", [["Roadster", 90000, 3], ["", 80000, 2]], 1936], ["the same bodies in 1949", [["Roadster", 90000, 3], ["Sedan", 70000, 3]], 1949], ["the same bodies in 1965", [["Roadster", 90000, 3], ["Sedan", 70000, 3]], 1965]]) {
  globalThis.CAR = { make: "Delahaye", model: "135" }; globalThis.SHAPE = shape; const d = await read(yr);
  ok(`${name} (${yr}): not apart, no body options, the pool stays one`, d.optionsState !== "apart" && !(d.options || []).some(x => x.dimension === "body" && x.saleIds) && !d.bodyNotStated, JSON.stringify({ tier: d.tier, state: d.optionsState }));
}
globalThis.SHAPE = null; globalThis.CAR = null;
// a model whose own name is a body word (the Auburn Speedster): every title names that one body, so it is one body and keeps its single pool - the rule counts bodies the titles name, it does not invent a second one
{ globalThis.CAR = { make: "Auburn", model: "Speedster" }; globalThis.SHAPE = [["", 90000, 4], ["", 95000, 2]]; const d = await read(1935);
  ok("1935 Auburn Speedster: the model's own body word is one body, the single pool stays", d.optionsState !== "apart" && !d.bodyNotStated, JSON.stringify({ tier: d.tier, state: d.optionsState, opts: (d.options || []).map(x => x.label + " " + x.n) })); globalThis.SHAPE = null; globalThis.CAR = null; }
// (6) the tag
{ const T = E.PREWAR_BODY_TAG, over = E.storedPrewarBodyOvertaken;
  ok("the tag is pwb4 or later", /^pwb(\d+)-/.test(T) && Number(/^pwb(\d+)-/.exec(T)[1]) >= 4, T);
  ok("a pre-war thin row without the current tag is read as no row", over({ tier: "thin", resolvedCar: { year: 1936 }, prewarBodyTag: "pwb3-20261105" }) === true && over({ tier: "thin", resolvedCar: { year: 1936 } }) === true);
  ok("a pre-war thin row WITH the current tag is kept", over({ tier: "thin", resolvedCar: { year: 1936 }, prewarBodyTag: T }) === false);
  ok("a pre-war result with no cluster and no tag is read as no row", over({ tier: "result", cluster: null, span: [1, 2], resolvedCar: { year: 1936 }, prewarBodyTag: "pwb3-20261105" }) === true);
  ok("a post-war thin row is never touched", over({ tier: "thin", resolvedCar: { year: 1965 }, prewarBodyTag: "pwb3-20261105" }) === false && over({ tier: "thin", resolvedCar: { year: 1949 } }) === false); }
console.log(failed ? `prewarAnySizeCheck: ${failed} FAIL` : "prewarAnySizeCheck: PASS");
process.exit(failed ? 1 : 0);
