// A CAR WITH A TRIM DOES NOT PAY FOR TWO READS ONE AFTER THE OTHER (Lane B, Oct 31 2026, live pushCheck on a cold car: "1995 Porsche 911 Carrera" 20.9 s and "2008 Porsche 997 Carrera S Coupe" 18.0 s, against 9.8 s and 11.7 s for cars with no trim).
// CAUSE: lib/onebox.js reads a second full answer for the TRIMLESS car (the exact-year line, under a thin answer of a car with a trim and a year). That read began only after the first answer had come back thin, so a cold car with a trim took the time of two reads in a row.
// Not the push: the warmed rows had been serving, and the cold time of a trimmed car was always two reads. WHO ELSE: every car with a trim and a year whose answer is thin (the line is built only then); a trimless car, or a car with a result, pays one read.
// FIX: the second read starts beside the first and is used only if the first answer is thin. The line and the answer are unchanged.
// CLASS CHECK: each car below has a trim and a year and a thin answer with the line; the time of the whole answer must stay clearly under the two reads added together. Fails without the fix.
//   node scripts/exactYearParallelCheck.mjs [repo root]
process.env.DEBUG_LOG = "1";   // the stage_ms line is a diagnostic, on only with DEBUG_LOG=1 (lib/_debugLog.js, lane-e-vercelcost)
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
globalThis.fetch = async (url) => {
  await new Promise(r => setTimeout(r, DELAY));
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

const CARS = [["Porsche", "911", 1995, "Carrera"], ["Porsche", "911", 2008, "Carrera S"], ["Porsche", "911", 2001, "Carrera 4"]];
for (const [make, model, year, trim] of CARS) {
  MK = make; rows = [];
  for (let i = 0; i < 3; i++) mkS(make, model, `${year} ${make} ${model} ${trim}`, 40000 + i * 900, 8 + i * 9, year);
  for (let i = 0; i < 16; i++) mkS(make, model, `${year} ${make} ${model} ${["Turbo", "Targa", "Cabriolet", "Speedster"][i % 4]}`, 40000 + (i % 6) * 700, 10 + i * 5, year);
  const q = `${year} ${make} ${model} ${trim}`, rv = await resolveVehicle(q, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null);
  const t1 = Date.now(), solo = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0, noExactYearLine: true }, null)).raw, tSolo = Date.now() - t1;
  const bare = { ...v, trim: null }, t3 = Date.now(); await E.oneEngineAnswer(bare, gen, `${year} ${make} ${model}`, { ...env, asked: 0, noExactYearLine: true }, null); const tBare = Date.now() - t3;
  const lines = []; const og = console.log; console.log = (...a) => { const x = a.join(" "); if (x.startsWith('{"tag":"stage_ms"')) lines.push(x); else og(...a); };
  const t2 = Date.now(), full = (await E.oneEngineAnswer(v, gen, q + " ", { ...env, asked: 0 }, null)).raw, tFull = Date.now() - t2; console.log = og;
  ok(`${q}: one stage_ms line for the answer, the exact-year read a stage of it (${lines.length} line)`, lines.length === 1 && /exact_year_line/.test(lines[0]), lines.map(x => x.slice(0, 160)).join(" | "));
  ok(`${q}: the answer is thin, so the second read is the one the line comes from (${full.tier}${full.exactYearLine ? ", line printed" : ""})`, full.tier === "thin");
  ok(`${q}: the whole answer takes ${tFull} ms; the two reads alone take ${tSolo} ms and ${tBare} ms, so one after the other would be ${tSolo + tBare} ms and side by side ${Math.max(tSolo, tBare)} ms`, tFull < tSolo + tBare - 0.5 * Math.min(tSolo, tBare));
}
console.log(failed ? `exactYearParallelCheck: ${failed} failure(s)` : "exactYearParallelCheck: all pass");
process.exit(failed ? 1 : 0);
