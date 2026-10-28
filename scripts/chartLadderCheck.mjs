// e99: the chart ladder. A mix-withheld split spec comes back with candles scoped to an option, a thin spec comes back dots or withheld, and no chart data disagrees with the answer's own sales.
//   node scripts/chartLadderCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let MAKE="Porsche", MODEL="Boxster";
let rows = [], n = 0;
const sale = (year, date, price, mi, title) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rw" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: MAKE, model: MODEL, year, listing_title: title || `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi || 60000), body_style: null, modifications: null, title: title || `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
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
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);

const car = { make: "Porsche", model: "Boxster", trim: "S", year: 2014, bodyStyle: null };
const run = async (text) => (await E.oneEngineAnswer(car, null, text || "2014 Porsche Boxster S", env, null)).raw;
const agrees = (a, label) => {
  const c = a.chart; if (!c) return false;
  const pool = new Map(); for (const r of a.rawPool || []) { const k = String(r.auction_end_date).slice(0, 10) + "|" + Math.round(r._usd); pool.set(k, (pool.get(k) || 0) + 1); }
  if (c.type === "dots") { const seen = new Map(); for (const d of c.dots) { const k = d.date + "|" + d.price; seen.set(k, (seen.get(k) || 0) + 1); } for (const [k, n] of seen) if ((pool.get(k) || 0) < n) return false; return c.dots.length <= (a.rawPool || []).length && c.n === c.dots.length; }
  if (c.type === "candles") return c.buckets.every(b => b.count >= 5 && b.low <= b.typical && b.typical <= b.high) && c.buckets.reduce((t, b) => t + b.count, 0) <= (c.scope ? (a.rawPool || []).length : (a.rawPool || []).length + 400);
  if (c.type === "withheld") return c.dots == null && c.buckets == null && c.withheld && c.withheld.n === (a.rawPool || []).length;
  return false;
};
// 1. the mix changes from quarter to quarter and the answer is split by gearbox: scoped candles
rows = [];
for (let q = 0; q < 4; q++) { for (let i = 0; i < 10; i++) sale(2014, day(20 + q * 88 + i * 3), 44000 + i * 600 + q * 200, 40000, "2014 Porsche Boxster S 6-Speed Manual"); for (let i = 0; i < 2 + q * 4; i++) sale(2014, day(22 + q * 88 + i * 4), 30000 + i * 500, 40000, "2014 Porsche Boxster S PDK"); }
let a = await run();
console.log("   case1", a.tier, a.optionsState, a.headlineDimension, JSON.stringify(a.trendHeld), a.chart && a.chart.type, a.chart && a.chart.scope && a.chart.scope.label);
ok("a mix-withheld split spec comes back as scoped candles", a.trendHeld && a.chart && a.chart.type === "candles" && a.chart.scope && a.chart.scope.dimension === "gearbox" && !!a.chart.scope.line && a.chart.buckets.length >= 3, JSON.stringify(a.chart && { t: a.chart.type, s: a.chart.scope }));
ok("its data agrees with the answer's own sales", agrees(a));
ok("the scope line is plain words from the table", a.chart && a.chart.scope && /^The candles show the .+ sales only, \d+ of the \d+\.$/.test(a.chart.scope.line), a.chart && a.chart.scope && a.chart.scope.line);
ok("the held sentence rides as the note", a.chart && /^The mix of cars changed from quarter to quarter/.test(String(a.chart.note)));
// 2. a stable single-option pool: pooled candles, no scope, the same buckets as the old trend
rows = []; for (let q = 0; q < 12; q++) for (let i = 0; i < 6; i++) sale(2014, day(15 + q * 88 + i * 9), 40000 + i * 700, 40000, "2014 Porsche Boxster S 6-Speed Manual");
a = await run();
ok("a steady pool keeps the pooled candles, scope null", a.chart && a.chart.type === "candles" && a.chart.scope === null && a.trend && a.chart.buckets.length === a.trend.movement.buckets.length, JSON.stringify(a.chart && a.chart.type));
ok("pooled candles agree with the old trend", a.chart && a.trend && a.chart.buckets.every((b, i) => b.count === a.trend.movement.buckets[i].count && b.low === a.trend.movement.buckets[i].low));
// 3. a thin spec: dots
rows = []; for (let i = 0; i < 4; i++) sale(2014, day(30 + i * 40), 35000 + i * 1000, 40000, "2014 Porsche Boxster S PDK");
a = await run();
ok("a thin spec comes back as dots, one per sale", a.chart && a.chart.type === "dots" && a.chart.dots.length === 4 && a.chart.dots.every(d => d.date && d.price > 0) && !a.chart.buckets, JSON.stringify(a.chart && a.chart.type));
ok("dots agree with the answer's own sales", agrees(a));
// 4. two sales: withheld, with the engine's reason
rows = []; for (let i = 0; i < 2; i++) sale(2014, day(30 + i * 40), 35000 + i * 1000, 40000, "2014 Porsche Boxster S PDK");
a = await run();
ok("two sales: withheld, floor 3, the line from the table", !a.chart || (a.chart.type === "withheld" && a.chart.withheld.floor === 3 && /^Only 2 dated sales, too few to chart/.test(a.chart.withheld.line)), JSON.stringify(a.chart || a.tier));
// 5. the chart follows a stored answer: the same function over a stored raw answer
const again = E.withReadFields(JSON.parse(JSON.stringify(a)), "2014 Porsche Boxster S", car);
ok("a stored answer gets its chart at read time, unchanged", JSON.stringify(again.chart) === JSON.stringify(a.chart));
process.exit(failed ? 1 : 0);
