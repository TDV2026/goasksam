// e96 parts 5 and 7: mileage and year become split dimensions through the same options machinery. A wide range that mileage explains, with two or more bands of 3 or more sales,
// is split by band (under 50,000, 50,000 to 100,000, over 100,000): no pooled number, one line per band with its own range and count, a band under the floor prints the count and
// "too few for a range". A set widened because the exact year is thin, whose year groups of 3 or more sales price apart, splits by year with the exact year first.
//   node scripts/mileageYearSplitCheck.mjs [repo root]
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
const ask = async (model, asked = 2) => (await E.oneEngineAnswer({ make: MK, model, trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} ${model}`, { ...env, asked }, null)).raw;   // asked 2: the question cap is spent, so the pooled result with its option lines is what the engine answers
const hasPooled = a => !!(a.cluster || (a.raw && a.raw.cluster));
const chart = a => { const t = a.trend || (a.raw && a.raw.trend); return !!(t && ((t.movement && t.movement.buckets && t.movement.buckets.length) || (t.quarters && t.quarters.some(q => q.count >= 8)))); };
const fill = (model, plan) => { for (const [body, tx, base, count, agoStart] of plan) for (let i = 0; i < count; i++) sale(model, body, tx, base + (i % 5) * 400, agoStart + i * 9); };
const salemi = (model, body, price, ago, mi, year) => { sale(model, body, null, price, ago); const r = rows[rows.length - 1]; r.raw_record.mileage = String(mi); if (year) { r.year = year; r.listing_title = r.listing_title.replace("2001", String(year)); } };
MK = "Testmake";
// MILEAGE: 27 sales in three bands, price falls with miles
for (let i = 0; i < 9; i++) salemi("MB1", "Coupe", 82000 - i * 1200, 5 + i * 9, 20000 + i * 2500);
for (let i = 0; i < 9; i++) salemi("MB1", "Coupe", 52000 - i * 1000, 6 + i * 9, 55000 + i * 4500);
for (let i = 0; i < 9; i++) salemi("MB1", "Coupe", 32000 - i * 800, 7 + i * 9, 105000 + i * 6000);
let a = await ask("MB1");
ok("mileage: the wide range is split by band, no pooled number", a.tier === "result" && !a.cluster && a.low == null && a.optionsState === "split" && a.headlineDimension === "mileage" && a.emailMode === "options", `${a.optionsState} ${a.headlineDimension} ${JSON.stringify(a.cluster)}`);
ok("mileage: one line per band, each with its own range and count", (a.options || []).length === 3 && a.options.every(o => o.dimension === "mileage" && o.low > 0 && o.high >= o.low && o.n === 9) && a.headlineLines.length === 3 && /^Under 50,000 miles \$[\d,]+ to \$[\d,]+, 9 sales since [A-Z][a-z]+ \d{4}$/.test(a.headlineLines[0]), JSON.stringify(a.headlineLines));
ok("mileage: a band click sends the miMin and miMax the engine already reads", a.options[0].refine && a.options[0].refine.miMin === 0 && a.options[0].refine.miMax === 50000 && a.options[2].refine.miMax === null, JSON.stringify(a.options.map(o => o.refine)));
// bands under the floor
for (let i = 0; i < 9; i++) salemi("MB2", "Coupe", 80000 - i * 1500, 5 + i * 9, 20000 + i * 2500);
for (let i = 0; i < 4; i++) salemi("MB2", "Coupe", 50000 - i * 800, 6 + i * 9, 55000 + i * 8000);
for (let i = 0; i < 9; i++) salemi("MB2", "Coupe", 30000 - i * 500, 7 + i * 9, 105000 + i * 6000);
a = await ask("MB2");
ok("mileage: a band under the floor prints the count and too few for a range", a.headlineDimension === "mileage" && a.headlineLines.some(l => /^50,000 to 100,000 miles, 4 sales, too few for a range$/.test(l)), JSON.stringify(a.headlineLines));
// a narrow range is never split by mileage
for (let i = 0; i < 20; i++) salemi("MB3", "Coupe", 40000 + (i % 5) * 400, 5 + i * 9, 20000 + i * 8000);
a = await ask("MB3");
ok("mileage: a range that is not wide keeps its one range", a.tier === "result" && Array.isArray(a.cluster) && a.headlineDimension !== "mileage", `${a.headlineDimension} ${JSON.stringify(a.cluster)}`);
// only one band with 3 sales or more: no split
for (let i = 0; i < 12; i++) salemi("MB4", "Coupe", 100000 - i * 7000, 5 + i * 9, 20000 + i * 2000);
a = await ask("MB4");
ok("mileage: one populated band only keeps the range and names the cause", a.tier === "result" && Array.isArray(a.cluster) && a.headlineDimension !== "mileage" && a.wideCause === "mileage", `${a.headlineDimension} ${a.wideCause}`);
// YEAR: typed 2001 has 2 sales, 2000 and 2002 have 10 each at prices far apart
salemi("YR1", "Coupe", 30000, 5, 40000, 2001); salemi("YR1", "Coupe", 31000, 15, 41000, 2001);
for (let i = 0; i < 10; i++) salemi("YR1", "Coupe", 30000 + i * 300, 20 + i * 9, 40000 + i * 2000, 2002);
for (let i = 0; i < 10; i++) salemi("YR1", "Coupe", 60000 + i * 300, 22 + i * 9, 40000 + i * 2000, 2000);
a = await ask("YR1");
ok("year: a widened set whose year groups price apart splits by year, no pooled range", a.tier === "result" && !a.cluster && a.headlineDimension === "year" && a.emailMode === "options", `${a.tier} ${a.optionsState} ${a.headlineDimension} ${a.fallbackRung}`);
ok("year: one line per year from its own set, the typed year first when it has sales", (a.options || []).length >= 2 && a.options.every(o => o.dimension === "year" && o.refine && o.refine.year >= 2000) && a.headlineLines.length === a.options.length, JSON.stringify(a.headlineLines));
// a year option returns that year's own set; the typed year with 2 sales is under the floor
const refinedAt = async (model, refine) => (await E.oneEngineAnswer({ make: MK, model, trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} ${model}`, { ...env, asked: 2 }, refine)).raw;
let r1 = await refinedAt("YR1", { year: 2000 });
ok("year click: 2000 returns its own 10 sales and a range", r1.poolN === 10 && Array.isArray(r1.cluster) && r1.rangeFloor === false, `${r1.poolN} ${JSON.stringify(r1.cluster)} ${r1.rangeFloor}`);
r1 = await refinedAt("YR1", { year: 2001 });
ok("year click: the typed 2001 with 2 sales gives the count, rangeFloor true, no range", (r1.poolN === 2 || (r1.thin_sales && r1.thin_sales.count === 2) || (r1.cards || []).length === 2) && r1.rangeFloor === true && !r1.cluster, `${r1.poolN} ${JSON.stringify(r1.thin_sales)} ${r1.rangeFloor}`);
// TYPED MILES: the page sends only the target, the engine maps it to the band
let m1 = await refinedAt("MB1", { miTarget: 30000 });
ok("typed miles: 30,000 maps to 15,000 to 45,000 and narrows", m1.mileageBand && m1.mileageBand.miMin === 15000 && m1.mileageBand.miMax === 45000 && m1.mileageBand.narrowed === true && /within 15,000 miles of 30,000/.test(m1.mileageBand.line), JSON.stringify(m1.mileageBand));
m1 = await refinedAt("MB1", { miTarget: 70000 });
ok("typed miles: 70,000 maps to 45,000 to 95,000 (25,000 either side from 60,000 up)", m1.mileageBand && m1.mileageBand.miMin === 45000 && m1.mileageBand.miMax === 95000 && m1.mileageBand.narrowed === true, JSON.stringify(m1.mileageBand));
m1 = await refinedAt("MB2", { miTarget: 75000 });
ok("typed miles: a band with fewer than 8 sales says so in one line and keeps the pooled range", m1.mileageBand && m1.mileageBand.narrowed === false && /^Too few sales near 75,000 miles/.test(m1.mileageBand.line), JSON.stringify(m1.mileageBand));
ok("typed miles: bandedRefine leaves a refine that already has a band alone", JSON.stringify(E.bandedRefine({ miMin: 0, miMax: 50000, miTarget: 30000 })) === JSON.stringify({ miMin: 0, miMax: 50000, miTarget: 30000 }) && E.bandedRefine(null) === null);
console.log(failed ? `mileageYearSplitCheck: ${failed} FAIL` : "mileageYearSplitCheck: all PASS");
process.exit(failed ? 1 : 0);
