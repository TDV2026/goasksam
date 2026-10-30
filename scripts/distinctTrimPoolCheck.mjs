// A TYPED TRIM THAT NAMES A DISTINCT CAR IS NEVER ANOTHER CAR'S ANSWER (Lane B, Oct 29 2026, Sam's launch gate: Market Check "2016 Porsche Boxster Spyder" read "2016 Boxster Roadster", scope "Roadsters", the Spyder gone from the name).
// CAUSE: the spec builder (lib/onebox.js, trimAsBody) turned every trim that is only a body word (Spyder, Spider, Roadster...) into a body filter and cleared the trim, so the Porsche Boxster/718/918 Spyder, which names its own car,
// was labelled as the base car's open body. droppedTrimCheck did not catch it: that class is a trim NO sale carries; the Spyder has its own sales, and the trim was not dropped for lack of them but read as a body word.
// FIX: bodyWordNamesCar (one table) keeps the word as the trim for the cars where it names a car. And when a typed trim's own pool is too thin for a range, the answer says so in the engine's plain words
// ("Too few Boxster Spyder sales for a range. Here is the Boxster market instead.", trimFallbackLine) and never shows the base car's range as the typed car's.
// CLASS (this check, table driven): for every distinct trim (Spyder, GT3, GT3 RS, GT2 RS, Turbo S, GTS, Carrera S, Z06, ZR1, Hellcat, M3 CS...) with its own sales: the resolved car keeps the trim in its name and the range is the trim's own, never the base car's;
// with too few sales: the plain sentence and no range borrowed from the base car.
//   node scripts/distinctTrimPoolCheck.mjs [repo root]
import fs from "node:fs";
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

import { resolveVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };
// [make, model, year, typed trim, the title words the trim's sales carry, base price, trim price]
const CARS = [
  ["Porsche", "Boxster", 2016, "Spyder", "Spyder", 45000, 110000], ["Porsche", "718 Boxster", 2019, "Spyder", "Spyder", 60000, 100000],
  ["Porsche", "911", 2014, "GT3", "GT3", 80000, 160000], ["Porsche", "911", 2016, "GT3 RS", "GT3 RS", 80000, 220000], ["Porsche", "911", 2005, "Turbo S", "Turbo S", 40000, 90000],
  ["Chevrolet", "Corvette", 2015, "Z06", "Z06", 40000, 70000], ["Chevrolet", "Corvette", 2013, "ZR1", "ZR1", 40000, 85000], ["Dodge", "Challenger", 2017, "Hellcat", "SRT Hellcat", 25000, 55000],
  ["BMW", "M3", 2005, "CS", "CS", 20000, 60000]
];
for (const [make, model, year, trim, words, basePrice, trimPrice] of CARS) {
  MK = make; rows = [];
  for (let i = 0; i < 20; i++) mkS(make, model, `${year} ${make} ${model}${i % 3 === 0 ? " S" : ""}`, basePrice + (i % 7) * 500, 8 + i * 9, year);
  for (let i = 0; i < 12; i++) mkS(make, model, `${year} ${make} ${model} ${words}`, trimPrice + (i % 6) * 1000, 8 + i * 9, year);
  const q = `${year} ${make} ${model} ${trim}`, rv = await resolveVehicle(q, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null);
  const d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw;
  const named = new RegExp(trim.split(/\s+/)[0], "i"), names = [d.scopeLabel, d.rungLabel, d.resolvedCar && d.resolvedCar.trim, d.resolvedCar && d.resolvedCar.familyLabel].join(" ");
  ok(`${q}: the resolver keeps the trim (${v.trim})`, new RegExp(trim.split(/\s+/)[0], "i").test(String(v.trim || "")), JSON.stringify([v.model, v.trim]));
  ok(`${q}: an answer (${d.tier}) whose name carries the trim, not a body word instead (${String(d.scopeLabel || "").slice(0, 40)})`, /^(result|thin)$/.test(d.tier) && named.test(names) && !/\broadsters?\b/i.test(String(d.scopeLabel || "")) || !/\broadsters?\b/i.test(String(d.scopeLabel || "")) && named.test(names), names.slice(0, 120));
  ok(`${q}: the range is the trim's own sales, never the base car's (cluster ${JSON.stringify(d.cluster)})`, !Array.isArray(d.cluster) || d.cluster[0] >= trimPrice * 0.9, JSON.stringify(d.cluster));
  // too few sales of the trim: the plain sentence, and no range from the base car
  rows = rows.filter(r => !new RegExp(words).test(r.listing_title)); n = rows.length;
  for (let i = 0; i < 3; i++) mkS(make, model, `${year} ${make} ${model} ${words}`, trimPrice + i * 1000, 20 + i * 30, year);
  const gen2 = await findGeneration(v, env).catch(() => null), t = (await E.oneEngineAnswer(v, gen2, q, { ...env, asked: 0 }, null)).raw;
  const base = Array.isArray(t.cluster) && t.cluster[1] < trimPrice * 0.8;
  ok(`${q}: three sales of the trim: no base-car range is shown as the trim's (${t.tier}, cluster ${JSON.stringify(t.cluster)})`, !base || typeof t.trimFallbackLine === "string", JSON.stringify([t.tier, t.cluster, t.trimFallbackLine]));
  ok(`${q}: and when it reads the wider market, the engine says so in its plain words`, !(t.rungLabel && /on record separately/.test(t.rungLabel)) || t.trimFallbackLine === `Too few ${model} ${trim} sales for a range. Here is the ${model} market instead.`, String(t.trimFallbackLine));
}
{ const src = fs.readFileSync("lib/onebox.js", "utf8"); ok("the spec builder asks bodyWordNamesCar before it turns a body-word trim into a body", /!bodyWordNamesCar\(spec\.make, spec\.model, spec\.trim\)/.test(src) && /export function bodyWordNamesCar/.test(src)); }
console.log(failed ? `distinctTrimPoolCheck: ${failed} failure(s)` : "distinctTrimPoolCheck: all pass");
process.exit(failed ? 1 : 0);
