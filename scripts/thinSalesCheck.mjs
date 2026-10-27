// e93: Find's thin_sales, from the engine's own pool and widening walk. No database: a fake archive.
//   node scripts/thinSalesCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { oneEngineAnswer, thinSalesOf } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0;
const sale = (year, date, price, hr) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Datsun", model: "240Z", year,
  listing_title: `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title: `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const today = new Date(); const day = (i) => new Date(today.getTime() - i * 864e5).toISOString().slice(0, 10);
const ask = (yr) => oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: yr, bodyStyle: null }, null, `${yr} Datsun 240Z`, env, null);
const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// CAR 1, eight or more sales: a range, and no thin_sales
rows = [];
for (let i = 0; i < 12; i++) sale(1972, day(10 + i * 3), 30000 + i * 200, true);
let a = await ask(1972);
ok("8 or more: the range stands", a.raw.tier === "result" && a.raw.cluster && a.low != null, a.raw.tier);
ok("8 or more: no thin_sales", a.raw.thin_sales === null && a.thin_sales === null);
// CAR 2, 4 sales: thin_sales with the sales, newest first, no range
rows = [];
const prices = [31000, 29000, 33000, 30000];
prices.forEach((p, i) => sale(1972, day(20 + i * 30), p, true));
a = await ask(1972);
const t = a.raw.thin_sales;
ok("2 to 7: no range", !a.raw.cluster && a.low == null && a.high == null, a.raw.tier);
ok("2 to 7: count is the pool", t && t.count === 4, JSON.stringify(t));
ok("2 to 7: sales {price, month, venue, url}, newest first", t && t.sales.length === 4 && t.sales.every(s => s.price > 0 && s.month && s.venue && s.url) && t.sales[0].price === 31000 && t.sales[3].price === 30000, JSON.stringify(t && t.sales));
const d0 = new Date(day(20)); 
ok("2 to 7: latest_month is the newest sale's month and year", t && t.latest_month === `${MN[d0.getUTCMonth()]} ${d0.getUTCFullYear()}` && t.sales[0].month === t.latest_month, t && t.latest_month);
ok("2 to 7: scope_label names the car", t && /240Z/.test(String(t.scope_label)), t && t.scope_label);
ok("2 to 7: the field reaches the mapped answer", a.thin_sales && a.thin_sales.count === 4);
// the same count the engine reports for the pool
ok("2 to 7: count equals the answer's own pool", t && t.count === (a.raw.rawPool || []).length, String(a.raw.poolN));
// one sale
rows = []; sale(1972, day(40), 27500, true);
a = await ask(1972);
ok("1: count 1, one sale", a.raw.thin_sales && a.raw.thin_sales.count === 1 && a.raw.thin_sales.sales.length === 1 && a.raw.thin_sales.sales[0].price === 27500, JSON.stringify(a.raw.thin_sales));
// a cap of 7: a pool that is thin by spread, not by count, never lists more than 7
const big = thinSalesOf({ tier: "thin", rawPool: Array.from({ length: 11 }, (_, i) => ({ id: "x" + i, _usd: 1000 + i, auction_end_date: `2026-0${1 + (i % 9)}-15`, source: "bringatrailer", srcurl: "https://u/" + i })) });
ok("never more than 7 sales listed, count is the whole pool", big && big.count === 11 && big.sales.length === 7, big && big.count + "/" + big.sales.length);
// CAR 3, none: {count: 0}
rows = [];
a = await ask(1999);
ok("0: thin_sales is {count: 0}", a.raw.thin_sales && a.raw.thin_sales.count === 0 && !a.raw.thin_sales.sales, JSON.stringify(a.raw.thin_sales));
// other shapes carry null, never a made-up zero
ok("a Singer car (no comparison) carries null, not zero", (await oneEngineAnswer({ make: "Porsche", model: "911", trim: "Carrera 4", year: 1992, bodyStyle: null }, null, "1992 Porsche 911 Carrera 4 by Singer", env, null)).raw.thin_sales === null);
ok("a failed or unreadable answer carries null", thinSalesOf({ tier: "unavailable" }) === null && thinSalesOf(null) === null && thinSalesOf({ tier: "refusal", refusal: { kind: "builder_car" } }) === null);
// the stored core carries it
{ const { coreOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
  rows = []; [30000, 31000, 29000].forEach((p, i) => sale(1972, day(10 + i * 20), p, true));
  const x = await ask(1972); const core = coreOf(x.raw, { v: { make: "Datsun", model: "240Z", year: 1972 }, generation: null, refine: null });
  ok("the stored core carries thin_sales unchanged", core && core.thin_sales && core.thin_sales.count === 3, JSON.stringify(core && core.thin_sales)); }
console.log(`thinSalesCheck: ${failed ? failed + " FAIL" : "all PASS"}`);
process.exit(failed ? 1 : 0);
