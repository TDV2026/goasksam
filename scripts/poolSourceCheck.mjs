// POOL SOURCE CHECK (lane-b-rick2, Nov 5 2026). Live: Market Check for a 1934 Packard Twelve answered from 8 Bring a Trailer sedans while the archive held 29 house sales of the same years (convertibles, coupes, phaetons at RM, Gooding, Bonhams, Mecum).
// CAUSE: the online band cut (lib/onebox.js fetchPool, "online"): once a fetched record holds three or more online sales its house sales are held out of the band, whatever they outnumber. For a car the houses sell, that threw away most of the record, and the pre-war
// bodies rule then had one body to look at. WHO ELSE: every model whose archive sales are mostly house sales and that has three or more online sales: that is what docs/pool-source-sweep.sql counts. THE RULE NOW: when the houses are two-thirds or more of the record, the pool is the
// whole record under the same rules (premium backed out, fences, set asides); a record that is mostly online keeps the cut. Must hold:
//  (1) twenty house-heavy cars (house share from 67% up, 3 to 12 online sales, some pre-war; a car with fewer than 8 online sales is a thin record and already kept its house sales, so the cut bites from 8 online sales up): the Market Check pool count equals the archive count under the published rules (every sale in the window that passes the fences);
//  (2) twenty online-heavy controls (house share under two-thirds, three or more online): unchanged, the pool is the online sales;
//  (3) the Packard case (8 online sedans, 29 house sales over convertible, coupe, phaeton, sedan, 1933 to 1936): pool 37 and the pre-war bodies rule fires (apart by body).
//   node scripts/poolSourceCheck.mjs [repo root]   (pointing it at a tree without the fix shows it fail)
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago), so the verdict does not change with the day
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const HOUSES = [["RM Sotheby's", "rmsothebys"], ["Gooding & Co", "gooding"], ["Bonhams", "bonhams"], ["Mecum", "mecum"]];
const sale = (year, body, price, ago, model = "Roadrunner", house = false) => { n++; const h = house ? HOUSES[n % HOUSES.length] : ["Bring a Trailer", "bringatrailer"], title = `${year} Testmake ${model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: h[0], source_slug: h[1], make: "Testmake", model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const read = async (year, model) => { const veh = { year, make: "Testmake", model }, q = `${year} Testmake ${model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };
const BODIES = ["Coupe", "Coupe", "Coupe", "Coupe"];
const poolOf = d => (Array.isArray(d.rawPool) ? d.rawPool.length : 0);
// the archive count under the published rules: every sale of the car in the answer's own window (the window the answer states, windowStart) that passes the fences; the fixture's sales all pass them
const inWindow = (d, host) => rows.filter(r => (!d.poolYears || (r.year >= d.poolYears[0] && r.year <= d.poolYears[1])) && (host === undefined || (host ? r.source_slug !== "bringatrailer" : r.source_slug === "bringatrailer")) && String(r.sale_date) >= String(d.windowStart || "").slice(0, 10)).length;
// (1) house-heavy: [online, house] counts across the range
const HEAVY = []; for (let k = 0; k < 20; k++) { const on = k < 8 ? 3 + (k % 6) : 8 + (k % 5), hs = Math.ceil(on * 2 + 2 + (k % 5) * on); HEAVY.push([on, hs, k % 3 === 0 ? 1935 : 1998 + k % 6]); }
for (const [k, [on, hs, year]] of HEAVY.entries()) {
  rows = []; n = 0; const model = "Heavy" + String(k).padStart(2, "0");
  for (let i = 0; i < on; i++) sale(year, BODIES[i % 4] , 40000 + (i % 5) * 900, 30 + i * 9, model, false);
  for (let i = 0; i < hs; i++) sale(year, BODIES[i % 4], 41000 + (i % 7) * 1100, 20 + i * 11, model, true);
  const d = await read(year, model), share = Math.round(hs / (on + hs) * 100);
  ok(`house-heavy ${model} (${year}, ${on} online, ${hs} house, ${share}% house): the pool is the whole record in its window: every sale, online and house`, poolOf(d) === inWindow(d) && inWindow(d) > on, `pool ${poolOf(d)}, archive in window ${inWindow(d)} (online ${inWindow(d, false)}, house ${inWindow(d, true)}), window ${d.windowStart}`);
}
// (2) online-heavy controls keep the cut
for (let k = 0; k < 20; k++) { rows = []; n = 0; const model = "Online" + String(k).padStart(2, "0"), on = 10 + k, hs = 2 + (k % 5), year = 2001 + k % 8;
  for (let i = 0; i < on; i++) sale(year, "Coupe", 40000 + (i % 9) * 700, 30 + i * 5, model, false);
  for (let i = 0; i < hs; i++) sale(year, "Coupe", 52000 + (i % 3) * 900, 20 + i * 11, model, true);
  const d = await read(year, model);
  ok(`online-heavy control ${model} (${on} online, ${hs} house): unchanged, the pool is the online sales in its window`, poolOf(d) === inWindow(d, false), `pool ${poolOf(d)}, online in window ${inWindow(d, false)}`); }
// (3) the Packard case
{ rows = []; n = 0; const model = "Twelve";
  for (let i = 0; i < 8; i++) sale(i < 2 ? 1934 : [1933, 1935, 1936][i % 3], "Sedan", 83000 + i * 1000, 30 + i * 12, model, false);
  const hb = ["Convertible", "Coupe", "Phaeton", "Sedan"]; for (let i = 0; i < 29; i++) sale([1933, 1935, 1936][i % 3], hb[(i + (i >> 2)) % 4], 85000 + (i % 6) * 6000 + (hb[(i + (i >> 2)) % 4] === "Convertible" ? 25000 : 0), 25 + i * 8, model, true);
  const d = await read(1934, model);
  ok("Packard case: the pool is the whole record in its window, house sales included, not the 8 online sedans", poolOf(d) === inWindow(d) && inWindow(d, true) > 0 && poolOf(d) > 8, `pool ${poolOf(d)}, window ${d.windowStart}, house in window ${inWindow(d, true)}`);
  ok("... and the pre-war bodies rule fires: apart by body, no pooled range", d.optionsState === "apart" && d.headlineDimension === "body" && !d.cluster && (d.options || []).length >= 2, JSON.stringify({ state: d.optionsState, dim: d.headlineDimension, opts: (d.options || []).map(o => o.label + o.n) })); }
console.log(failed ? `\n${failed} FAILED` : "\npoolSourceCheck: all pass"); process.exit(failed ? 1 : 0);
