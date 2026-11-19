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
// A NUMBER AND ITS LETTERS ARE ONE CODE, SPACED OR NOT (Lane B, Nov 5 2026). THE CLASS: a model written as a number and one or two letters (540K, 300SL, 190E, 356B, 250GT) is filed in the archive either glued or spaced, and the pool check that a pool is the car typed
// compared the glued form with the spaced one and refused the pool as a swapped pool. Live: "1939 Mercedes-Benz 540K" (sales filed "540 K") answered "No figures are shown because this car could not be checked", while "540 K" answered a result. Must hold:
//  (1) for every code in both spellings, typed in either, the answer is not a refusal and carries the sales;
//  (2) a different model with the same number (a 500 K for a typed 540K) is still a swapped pool and is still refused;
//   node scripts/modelSpacingCheck.mjs [repo root]      (a tree without the rule fails it)
const CODES = [["Mercedes-Benz", "540K", "540 K", 1939], ["Mercedes-Benz", "300SL", "300 SL", 1955], ["Mercedes-Benz", "190E", "190 E", 1988], ["Porsche", "356B", "356 B", 1962], ["Mercedes-Benz", "280SE", "280 SE", 1970]];
const run = async (make, typed, filed, year) => {
  globalThis.CAR = { make, model: filed }; globalThis.SHAPE = [["Cabriolet", 90000, 6], ["Coupe", 80000, 5]]; build(year);
  const veh = { year, make, model: typed }, q = `${year} ${make} ${typed}`, gen = await findGeneration(veh, env).catch(() => null);
  return (await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw;
};
for (const [make, glued, spaced, year] of CODES) for (const [typed, filed] of [[glued, spaced], [spaced, glued], [glued, glued]]) {
  const d = await run(make, typed, filed, year);
  ok(`${year} ${make} typed "${typed}", sales filed "${filed}": not refused, the sales are there`, d.tier !== "refusal" && (d.cards || []).length >= 5, JSON.stringify({ tier: d.tier, refusal: d.refusal && d.refusal.kind, cards: (d.cards || []).length }));
}
{ const d = await run("Mercedes-Benz", "540K", "500 K", 1939);
  ok("a typed 540K against sales filed 500 K is never read as the typed car (no result, no sales shown)", d.tier !== "result" && !(d.cards || []).length, JSON.stringify({ tier: d.tier, cards: (d.cards || []).length })); }
console.log(failed ? `modelSpacingCheck: ${failed} FAIL` : "modelSpacingCheck: PASS");
process.exit(failed ? 1 : 0);
