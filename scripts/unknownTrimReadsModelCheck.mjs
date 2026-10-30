// A TYPED TRIM WITH NO SALES OF ITS OWN READS THE MODEL'S MARKET AND SAYS SO; IT IS NEVER "NOT TRACKED" (Lane B, Oct 30 2026, the Unmet demand table: "2020 Ford Mustang PP2" and "2016 Porsche 911 C4S" read "No sale of a Ford Mustang PP2 has been tracked yet.").
// CAUSE: when the typed trim matched no sale at any rung, the engine ended at the not-tracked line for the TRIM, a claim about a car the model plainly has sales of (every 2020 Mustang). The Oct 29 ruling (Sam) already says a trim with too few sales of its own reads the model's market and
// says so ("Too few Boxster Spyder sales for a range. Here is the Boxster market instead."); a trim with NONE fell through that ruling to the refusal.
// FIX: with a typed trim and an empty pool, the engine runs the same car without the trim; when that has sales the answer is that market, labelled "... sales; no PP2 on record separately", with trimFallbackLine. A car with no sales at all still says not tracked.
// CLASS (table driven): trim codes and names no sale carries, on cars with sales. This check fails without the fix.
//   node scripts/unknownTrimReadsModelCheck.mjs [repo root]
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

const CARS = [["Ford", "Mustang", 2020, "PP2"], ["Chevrolet", "Corvette", 2012, "Zorp"], ["Porsche", "911", 2016, "Q9X"], ["Toyota", "Supra", 1994, "Zed Edition"], ["Honda", "S2000", 2004, "Type Q"]];
for (const [make, model, year, trim] of CARS) {
  MK = make; rows = [];
  for (let i = 0; i < 14; i++) mkS(make, model, `${year} ${make} ${model}`, 30000 + (i % 7) * 800, 8 + i * 9, year);
  const q = `${year} ${make} ${model} ${trim}`, rv = await resolveVehicle(q, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null);
  const d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw;
  ok(`${q}: not "not tracked" (${d.tier})`, /^(result|thin)$/.test(d.tier), JSON.stringify([d.tier, v.trim, d.samLine]));
  if (v.trim) ok(`${q}: says the trim has no sales of its own, in the engine's words`, /^Too few .+ sales for a range\. Here is the .+ market instead\.$/.test(String(d.trimFallbackLine || "")), d.trimFallbackLine);
  ok(`${q}: the sales shown are the model's own`, Number(d.poolN) > 0 || (d.thin_sales && d.thin_sales.count > 0), String(d.poolN));
}
// a car with no sales at all still says not tracked
{ MK = "Ford"; rows = []; const q = "2020 Ford Mustang PP2", rv = await resolveVehicle(q, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null);
  const d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw; ok("a model with no sales at all is still not tracked", d.tier === "not_tracked" || d.tier === "thin" && Number(d.poolN) === 0, d.tier); }
console.log(failed ? `unknownTrimReadsModelCheck: ${failed} failure(s)` : "unknownTrimReadsModelCheck: all pass");
process.exit(failed ? 1 : 0);
