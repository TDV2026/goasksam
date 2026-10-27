// e95: when a question's options (body, gearbox) price apart, the answer prints no pooled headline range and no pooled movement chart; when they price alike, it prints both.
// Fake archive, no database. Cars: "Apart" (coupes about $20,000, convertibles about $70,000, manuals about $40,000 beside automatics about $18,000 in the same year),
// "Alike" (the same split with prices that overlap), "MixShift" (bodies apart, mix changes between periods vs stays level).
//   node scripts/pooledAnswerCheck.mjs [repo root]
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
// 1. bodies apart, every period carries both bodies in the same proportion: headline withheld, chart kept (mix stable)
fill("Apart", [["Coupe", null, 20000, 24, 5], ["Convertible", null, 70000, 24, 7]]);
let a = await ask("Apart");
ok("bodies apart: no pooled headline range", a.tier === "result" && !hasPooled(a), `tier ${a.tier} cluster ${JSON.stringify(a.cluster)}`);
ok("bodies apart: the answer says why and carries each option's own range", a.pooledApart && a.pooledApart.options.length >= 2 && a.pooledApart.options.every(o => o.low > 0 && o.high >= o.low && o.n >= 3) && a.thinReason === "pooled_apart", JSON.stringify(a.pooledApart && a.pooledApart.options));
ok("bodies apart, mix level across periods: the chart is kept", chart(a) && !a.trendHeld, JSON.stringify(a.trendHeld || null));
a = await ask("Apart", 0);
ok("bodies apart, asked normally: the engine asks first, no headline", /_choice$/.test(a.tier) && !hasPooled(a), a.tier);
// 2. bodies apart and the mix changes: chart withheld too
fill("Shift", [["Coupe", null, 20000, 20, 5], ["Convertible", null, 70000, 4, 5], ["Coupe", null, 20000, 4, 200], ["Convertible", null, 70000, 20, 200]]);
a = await ask("Shift");
ok("bodies apart, mix changes: no pooled headline and no movement chart", !hasPooled(a) && !chart(a) && a.trendHeld && a.trendHeld.reason === "mix_changes" && a.trendHeld.spreadPts > E.MIX_STABLE_PTS, JSON.stringify(a.trendHeld || null));
// 3. bodies alike: the pooled answer stands, chart included
fill("Alike", [["Coupe", null, 30000, 24, 5], ["Convertible", null, 30600, 24, 7]]);
a = await ask("Alike");
ok("bodies price alike: the pooled headline and the chart are printed", a.tier === "result" && hasPooled(a) && !a.pooledApart && chart(a));
MK = "BMW";
// 4. gearboxes apart (one body): headline withheld
fill("M3", [["Coupe", "Manual", 40000, 24, 5], ["Coupe", "Automatic", 18000, 24, 7]]);
a = await ask("M3");
ok("gearboxes apart: no pooled headline range, the gearbox is the reason", a.tier === "result" && !hasPooled(a) && a.pooledApart && a.pooledApart.dimensions.includes("gearbox"), `tier ${a.tier} ${JSON.stringify(a.pooledApart && a.pooledApart.dimensions)}`);
// 5. gearboxes alike: pooled stands
fill("M5", [["Coupe", "Manual", 30000, 24, 5], ["Coupe", "Automatic", 30500, 24, 7]]);
a = await ask("M5");
ok("gearboxes price alike: the pooled headline is printed", a.tier === "result" && hasPooled(a) && !a.pooledApart);
// 6. two bodies and two gearboxes apart together: still no pooled headline
rows = [];
fill("M3", [["Coupe", "Manual", 40000, 12, 5], ["Coupe", "Automatic", 18000, 12, 6], ["Convertible", "Manual", 90000, 12, 7], ["Convertible", "Automatic", 55000, 12, 8]]);
a = await ask("M3");
ok("bodies and gearboxes both vary: no pooled headline, the body is named", a.tier === "result" && !hasPooled(a) && a.pooledApart && a.pooledApart.dimensions.includes("body"), `tier ${a.tier} ${JSON.stringify(a.pooledApart && a.pooledApart.dimensions)}`);
// 7. THE MIDDLE TIER (pooled_split): ranges overlap, medians apart by 15 percent or more of the lower: headline kept, each option's own range, count and median carried
const spread = (model, body, tx, lo, step, count, ago0) => { for (let i = 0; i < count; i++) sale(model, body, tx, lo + i * step, ago0 + i * 7); };
rows = [];
spread("M3", "Coupe", "Manual", 21000, 1100, 20, 5); spread("M3", "Coupe", "Automatic", 18000, 710, 20, 8);
a = await ask("M3");
ok("overlapping gearboxes, medians apart: the pooled headline is kept", a.tier === "result" && hasPooled(a) && !a.pooledApart);
ok("overlapping gearboxes, medians apart: both options carry their own range, count and median, flagged pooled_split", a.pooledSplit && a.pooledSplit.flag === "pooled_split" && a.pooledSplit.options.filter(o => o.dimension === "gearbox").length === 2 && a.pooledSplit.options.every(o => o.n >= 3 && o.low > 0 && o.high >= o.low && o.median >= o.low && o.median <= o.high), JSON.stringify(a.pooledSplit && a.pooledSplit.options));
rows = [];
spread("M3", "Coupe", "Manual", 21000, 1100, 20, 5); spread("M3", "Coupe", "Automatic", 19500, 1100, 20, 8);
a = await ask("M3");
ok("gearbox medians within 15 percent: no split, the count only line as today", a.tier === "result" && hasPooled(a) && !a.pooledApart && !a.pooledSplit, JSON.stringify(a.pooledSplit || null));
MK = "Testmake"; rows = [];
spread("Over", "Coupe", null, 20000, 900, 20, 5); spread("Over", "Convertible", null, 24000, 1000, 20, 8);
a = await ask("Over");
ok("overlapping bodies, medians apart: headline kept, both bodies carry their own range", a.tier === "result" && hasPooled(a) && a.pooledSplit && a.pooledSplit.options.filter(o => o.dimension === "body").length === 2, JSON.stringify(a.pooledSplit && a.pooledSplit.options));
// edition line under a result: the engine's own options carry their range
const stub = (std, ed) => ({ tier: "result", cluster: [20000, 40000], rawPool: [], variantOptionsLine: [{ key: "ed", options: [{ value: "standard", label: "Standard", n: 12, ...std }, { value: "ed", label: "Special edition", n: 9, ...ed }] }] });
let sp = E.pooledApartGuard(stub({ low: 20000, high: 30000, median: 25000 }, { low: 28000, high: 40000, median: 34000 }));
ok("edition line, medians apart: split carried, headline kept", sp.cluster && sp.pooledSplit && sp.pooledSplit.options.filter(o => o.dimension === "edition").length === 2);
sp = E.pooledApartGuard(stub({ low: 20000, high: 30000, median: 25000 }, { low: 21000, high: 31000, median: 26000 }));
ok("edition line, medians within 15 percent: nothing carried", sp.cluster && !sp.pooledSplit);
console.log(failed ? `pooledAnswerCheck: ${failed} FAIL` : "pooledAnswerCheck: all PASS");
process.exit(failed ? 1 : 0);
