// A TRIM THE POOL DOES NOT CARRY NEVER REFUSES A KNOWN CAR (Lane B, Oct 29 2026). LIVE (Sam's Find screens, "No figures are shown because this car could not be checked."): the 2009 Honda S2000 GT Limited Edition and Type S, the 1998 Ferrari 355 Spider Pack.
// CAUSE: the ladder dropped the trim nobody had sales for and read the model's pool, but the label kept no word of it, so the typed-words invariant (typed_words_honoured_or_wider, lib/onebox.js runOutputInvariants) refused the whole answer
// (refusal.verify, pool 0, fallbackRung not_enough_data). The e67 label ("; no X on record separately") existed only for a CURATED trim. FIX: the same label for any typed trim the pool does not carry, so the answer stands (rule 8, never a dead end) and says what it did.
// CLASS: every model with a typed trim no sale carries (a listing-title phrase, an option pack, a trim the archive never saw). This check: two makes and models, each with a typed trim that has no sales, plus one with sales: the first group answers result or thin with a label saying
// no such trim on record separately and never a refusal; a trim with sales still reads its own pool; the sentence "could not be checked" is only ever a failed invariant.
//   node scripts/droppedTrimCheck.mjs [repo root]
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
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pc" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 900), body_style: "Convertible", modifications: null, title, currency: "USD", transmission: "Manual (6-speed)", exterior_color: null, source_url: "https://x/" + n } }); };
for (let i = 0; i < 30; i++) mkS("Honda", "S2000", `${2004 + (i % 6)} Honda S2000${i % 5 === 0 ? " CR" : ""}`, 22000 + (i % 7) * 1500, 8 + i * 12, 2004 + (i % 6));
for (let i = 0; i < 30; i++) mkS("Ferrari", "355", `${1995 + (i % 5)} Ferrari 355 Spider${i % 4 === 0 ? " F1" : ""}`, 90000 + (i % 7) * 4000, 8 + i * 12, 1995 + (i % 5));
const CASES = [["2009 Honda S2000 GT Limited Edition", { year: 2009, make: "Honda", model: "S2000", trim: "GT Limited Edition" }], ["2009 Honda S2000 Type S", { year: 2009, make: "Honda", model: "S2000", trim: "Type S" }], ["1998 Ferrari 355 Spider Pack", { year: 1998, make: "Ferrari", model: "355", trim: "Spider Pack" }]];   // the vehicles as the Find specs carry them (model and trim as the listing gave them)
for (const [q, vv] of CASES) {
  const v = vv, gen = await findGeneration(v, env).catch(() => null);
  const d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw;
  const fc = d.refusal && d.refusal.failedChecks;
  ok(`${q}: not refused (${d.tier}${fc ? ", failed " + fc.join(",") : ""})`, /^(result|thin)$/.test(d.tier) && !fc, JSON.stringify([d.tier, fc]));
  ok(`${q}: the label says the trim has no sales of its own`, /on record separately/i.test(String(d.rungLabel || "")), String(d.rungLabel));
  ok(`${q}: the pool is the model's own sales (${d.poolN || (d.thin && d.thin.totalN) || 0})`, (d.poolN || (d.thin && d.thin.totalN) || 0) >= 3);
}
{ const q = "2009 Honda S2000 CR", rv = await resolveVehicle(q, {}), v = rv.vehicle, gen = await findGeneration(v, env).catch(() => null), d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null)).raw;
  ok("a trim that does have sales reads its own pool and says nothing about a dropped trim", /^(result|thin)$/.test(d.tier) && !/on record separately/.test(String(d.rungLabel || "")), String(d.rungLabel)); }
{ const src = fs.readFileSync("lib/onebox.js", "utf8"); ok("the 'no X on record separately' label no longer waits for a curated trim", /if \(!named\) d = \{ \.\.\.d, rungLabel: `\$\{d\.rungLabel\} sales; no \$\{vehicle\.trim\} on record separately` \}/.test(src)); }
console.log(failed ? `droppedTrimCheck: ${failed} failure(s)` : "droppedTrimCheck: all pass");
process.exit(failed ? 1 : 0);
