// e91: Sell's two result fields, best_day and reserve_split, from the engine's own pool. No database: a fake archive.
//   node scripts/sellFieldsCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { oneEngineAnswer, bestDayOf, reserveSplitFor } = E;
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
// a pool the page reads: a stub answer for the pure function
const stub = (prices) => ({ tier: "result", windowMonthsChosen: 12, oldestIncludedSaleDate: "2026-01-01", latestSaleDate: "2026-10-01", rawPool: prices.map(([date, p]) => ({ auction_end_date: date, _usd: p })) });
// 2026-10-04 is a Sunday, 2026-10-05 Monday ... 2026-10-10 Saturday
const D = { sun: "2026-10-04", mon: "2026-10-05", tue: "2026-10-06", wed: "2026-10-07", thu: "2026-10-08", fri: "2026-10-09", sat: "2026-10-10" };
const many = (d, k, base) => Array.from({ length: k }, (_, i) => [d, base + i * 100]);
// BEST DAY
const clear = bestDayOf(stub([...many(D.sun, 5, 40000), ...many(D.tue, 5, 30000), ...many(D.fri, 3, 31000)]));
ok("best_day clears: Sunday, five sales, well above the pool middle", clear && clear.day === "Sunday" && clear.count === 5 && clear.lead_pct > 0 && clear.margin >= 5 && clear.measure === "median_vs_pool_median_pct", JSON.stringify(clear));
ok("best_day shape: day, count, n, measure, margin, window", clear && ["day", "count", "n", "measure", "margin", "window"].every(k => k in clear) && clear.n === 13 && clear.window.months === 12);
ok("best_day carries what the Sell line prints: day, count, n, lead_pct (a number) and the window start", clear && typeof clear.lead_pct === "number" && clear.window && "from" in clear.window && typeof clear.day === "string", JSON.stringify(clear && { lead_pct: clear.lead_pct, window: clear.window }));
ok("best_day null: a day under five sales is never ranked", bestDayOf(stub([...many(D.sun, 4, 40000), ...many(D.tue, 5, 30000), ...many(D.fri, 4, 31000)])) === null);
ok("best_day null: the winner leads the next day by under five points", bestDayOf(stub([...many(D.sun, 5, 30200), ...many(D.tue, 5, 30000), ...many(D.fri, 3, 29000)])) === null);
ok("best_day null: one ranked day has no next day to beat", bestDayOf(stub([...many(D.sun, 6, 40000), ...many(D.tue, 3, 30000), ...many(D.fri, 3, 31000)])) === null);
ok("best_day null: a day at or below the pool middle never wins", bestDayOf(stub([...many(D.sun, 5, 20000), ...many(D.tue, 5, 20000), ...many(D.fri, 8, 40000)].filter((_, i) => i < 10))) === null);
ok("best_day null: not a result tier", bestDayOf({ ...stub(many(D.sun, 9, 1000)), tier: "thin" }) === null);
// RESERVE SPLIT: the page's own pool
rows = [];
for (let i = 0; i < 10; i++) sale(1972, day(10 + i), 30000 + i * 200, true);
for (let i = 0; i < 10; i++) sale(1972, day(30 + i), 26000 + i * 200, false);
let a1 = await ask(1972);
ok("reserve_split clears on the page's own pool", a1.raw.reserve_split && a1.raw.reserve_split.winner === "reserve" && a1.raw.reserve_split.a.n === 10 && a1.raw.reserve_split.b.n === 10 && /1972 240Z/.test(a1.raw.reserve_split.scope_label), JSON.stringify(a1.raw.reserve_split));
ok("reserve_split shape: winner, a, b, n, scope_label, window", ["winner", "a", "b", "n", "scope_label", "window"].every(k => a1.raw.reserve_split && k in a1.raw.reserve_split) && a1.raw.reserve_split.n === 20);
ok("the field reaches the mapped answer", a1.reserve_split && a1.reserve_split.winner === "reserve" && "best_day" in a1);
// both sides clear, the gap is under five percent: winner none
rows = [];
for (let i = 0; i < 9; i++) sale(1972, day(10 + i), 30000 + i * 100, true);
for (let i = 0; i < 9; i++) sale(1972, day(30 + i), 30100 + i * 100, false);
a1 = await ask(1972);
ok("reserve_split winner none when both sides clear and the gap is under five percent", a1.raw.reserve_split && a1.raw.reserve_split.winner === "none" && a1.raw.reserve_split.gap_pct < 5, JSON.stringify(a1.raw.reserve_split));
// WALKS: the asked year's pool is thin on flags; the model in every year clears
rows = [];
for (let i = 0; i < 9; i++) sale(1972, day(10 + i), 28000 + i * 100, null);
for (let i = 0; i < 4; i++) sale(1972, day(50 + i), 30000, true);
for (let i = 0; i < 4; i++) sale(1972, day(60 + i), 27000, false);
for (let i = 0; i < 9; i++) sale(1964 + (i % 3), day(70 + i), 24000 + i * 100, true);
for (let i = 0; i < 9; i++) sale(1964 + (i % 3), day(90 + i), 20000 + i * 100, false);
a1 = await ask(1972);
const w = a1.raw.reserve_split;
ok("reserve_split walks to the model in every year", w && w.a.n >= 8 && w.b.n >= 8 && /^1964 to 1972 240Z$/.test(w.scope_label) && w.winner === "reserve", JSON.stringify(w));
// NULL: no scope has eight flagged sales on each side
rows = [];
for (let i = 0; i < 12; i++) sale(1972, day(10 + i), 28000 + i * 100, i < 3 ? true : null);
a1 = await ask(1972);
ok("reserve_split null when no scope clears the floor", a1.raw.reserve_split === null, JSON.stringify(a1.raw.reserve_split));
// the stored core carries both fields too
{ const { coreOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
  rows = []; for (let i = 0; i < 10; i++) sale(1972, day(10 + i), 30000 + i * 200, true); for (let i = 0; i < 10; i++) sale(1972, day(30 + i), 26000 + i * 200, false);
  const x = await ask(1972); const core = coreOf(x.raw, { v: { make: "Datsun", model: "240Z", year: 1972 }, generation: null, refine: null });
  ok("the stored core carries best_day and reserve_split unchanged", core && "best_day" in core && core.reserve_split && core.reserve_split.winner === "reserve", JSON.stringify(core && core.reserve_split)); }
// every other shape carries null, never a made-up field
rows = [];
const none = await oneEngineAnswer({ make: "Datsun", model: "240Z", trim: "", year: 1999, bodyStyle: null }, null, "1999 Datsun 240Z", env, null);
ok("an answer with no pool carries both fields as null", none.raw.best_day === null && none.raw.reserve_split === null);
ok("the stamp is e92", E.ENGINE_VERSION.split(" ")[0] === "e94-20261027-onefence");
process.exit(failed ? 1 : 0);
