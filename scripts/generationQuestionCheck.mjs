// A MODEL WHOSE SALES SPAN MORE THAN ONE GENERATION ASKS WHICH, WHEN NO YEAR IS TYPED (Lane B, Oct 29 2026, Sam's phone: "Audi RS 6 Avant" with no year read "RS6, all years", 2003 to 2011, $12,500 to $28,000; a reader typing it means the 2020-on car).
// CAUSE: the generation question comes from the curated generation table (lib/generations.js). The RS6 had no rows, so the engine pooled every year it could read and showed one range. SWEEP of the stored no-year answers (14 with a range) found two
// that span generations with no table row: Audi RS6 (2003 to 2011) and Volkswagen Rabbit (1978 to 2019: the 1975 to 1984 Rabbit and the 2006 to 2009 Rabbit). Both are in the table now. The rest are one generation by nature (Dune Buggy, Manx, 914, XK120...).
// This check: sales in two or three generations priced apart and no year typed: the engine returns the generation question with each generation's years and its count (generationOptions, optionCounts), never a range; all sales in one generation: it answers;
// a typed year decides, as before; and the models the sweep found are in the table.
//   node scripts/generationQuestionCheck.mjs [repo root]
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

const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pg" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };
// [make, model, title words, [[year, sales, price]...], expected generation labels]
const CARS = [
  ["Audi", "RS6", "Audi RS6 Avant", [[2003, 7, 20000], [2008, 3, 30000], [2021, 9, 100000]], ["C5", "C6", "C8"]],
  ["Volkswagen", "Rabbit", "Volkswagen Rabbit", [[1980, 8, 9000], [2008, 8, 15000]], ["Mk1", "Mk5"]]
];
for (const [make, model, words, spans, want] of CARS) {
  rows = []; n = 0;
  for (const [yr, cnt, price] of spans) for (let i = 0; i < cnt; i++) mkS(make, model, `${yr} ${words}`, price + i * 400, 8 + i * 20, yr);
  const v = { year: null, make, model, trim: null, bodyStyle: null }, gen = await findGeneration(v, env).catch(() => null);
  const d = (await E.oneEngineAnswer(v, gen, `${make} ${model}`, { ...env, asked: 0 }, null)).raw;
  const labels = (d.generationOptions || []).map(o => String(o.label).split(" ")[0]);
  ok(`${make} ${model}, no year, sales in ${spans.length} generations: the generation question (${d.tier})`, d.tier === "generation_choice" && want.every(w => labels.includes(w)), JSON.stringify(d.generationOptions));
  ok(`${make} ${model}: each generation shows its years, and its sales count beside it`, (d.generationOptions || []).every(o => /\(\d{4}-\d{4}\)/.test(o.label)) && Array.isArray(d.optionCounts) && d.optionCounts.length === (d.generationOptions || []).length && d.optionCounts.every(c => c > 0), JSON.stringify([d.optionCounts]));
  ok(`${make} ${model}: no range is shown while the question is open`, !Array.isArray(d.cluster));
}
// all the sales in one generation (S2000: AP1 and AP2 exist, every sale is an AP2): the question has one real option, so the engine answers
{ rows = []; n = 0; for (let i = 0; i < 12; i++) mkS("Honda", "S2000", "2006 Honda S2000", 26000 + i * 400, 8 + i * 20, 2006);
  const v = { year: null, make: "Honda", model: "S2000", trim: null, bodyStyle: null }, gen = await findGeneration(v, env).catch(() => null), one = (await E.oneEngineAnswer(v, gen, "Honda S2000", { ...env, asked: 0 }, null)).raw;
  ok(`Honda S2000, no year, every sale in one generation: it answers (${one.tier})`, one.tier !== "generation_choice", one.tier); }
{ const G = await import("../lib/generations.js"); for (const [mk, md, need] of [["Audi", "RS6", 4], ["Volkswagen", "Rabbit", 2]]) ok(`${mk} ${md} is in the generation table with ${need} generations`, G.generationsForModel(mk, md).length >= need, String(G.generationsForModel(mk, md).length)); }
// "1 sale is from 2011." is a line nobody understands (Sam, Oct 29 2026): the year sales the options leave out are counted in the plain words
{ const pool = [...Array(7).fill(2003), ...Array(3).fill(2008), 2011].map((y, i) => ({ id: "p" + i, _usd: 20000 + i * 1000, year: y, auction_end_date: "2026-03-10" })), o = (v, n, f) => ({ dimension: "year", label: v, value: v, n, low: f ? null : 20000, high: f ? null : 26000, rangeFloor: !!f, windowWords: "since November 2025" });
  const d = E.withReadFields({ tier: "result", poolN: 11, rawPool: pool, cluster: [20000, 28000], optionsState: "alike", headlineDimension: "year", windowWords: "since November 2025", options: [o("2003", 7), o("2008", 3, true)] }, "x", {});
  ok(`the year remainder reads "${d.optionsRemainder && d.optionsRemainder.line}", with no bare year`, !!d.optionsRemainder && d.optionsRemainder.line === "1 sale is from another year." && !/\b(19|20)\d\d\b/.test(d.optionsRemainder.line)); }
console.log(failed ? `generationQuestionCheck: ${failed} failure(s)` : "generationQuestionCheck: all pass");
process.exit(failed ? 1 : 0);
