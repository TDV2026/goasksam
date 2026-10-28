// e96 part 9: the card always names its window (windowLine), the chart caption states its span and that thin quarters are left out (chartCaption), and when the chart's span
// differs from the range's window one line says so (chartWindowLine: "The chart covers 33 months, the range the last 11."). The mileage band says its own window the same way (mileageBand.line).
//   node scripts/windowWordsCheck.mjs [repo root]
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
MK = "Testmake";
for (let i = 0; i < 12; i++) sale("WW1", "Coupe", null, 40000 + (i % 6) * 500, 5 + i * 25);
for (let i = 0; i < 30; i++) sale("WW1", "Coupe", null, 38000 + (i % 6) * 500, 330 + i * 30);
let a = await ask("WW1");
ok("window: the card names its window and its count", a.tier === "result" && /^\d+ sales, since [A-Z][a-z]+ \d{4}\.$/.test(a.windowLine || ""), String(a.windowLine));
ok("caption: the chart states its span and that thin quarters are left out", /^By (month|quarter|half-year|year), .+ to .+\. (Months|Quarters|Half-years|Years) with fewer than \d+ sales are left out\.$/.test(a.chartCaption || ""), String(a.chartCaption));
ok("differ: when the chart spans more than the range, one line says both", /^The chart covers \d+ months, the range the last \d+\.$/.test(a.chartWindowLine || ""), `${a.chartWindowLine} window ${a.windowMonths}`);
// same span: no line
for (let i = 0; i < 14; i++) sale("WW2", "Coupe", null, 40000 + (i % 6) * 500, 5 + i * 20);
a = await ask("WW2");
ok("same: when they agree there is no extra line", a.chartWindowLine == null, String(a.chartWindowLine));
const m = await E.oneEngineAnswer({ make: MK, model: "WW1", trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} WW1`, { ...env, asked: 2 }, { miTarget: 30000 });
ok("mileage band: the line names its own window", !m.raw.mileageBand || /The band reads the last \d+ months\.$|^Too few sales near/.test(m.raw.mileageBand.line), String(m.raw.mileageBand && m.raw.mileageBand.line));
console.log(failed ? `windowWordsCheck: ${failed} FAIL` : "windowWordsCheck: all PASS");
process.exit(failed ? 1 : 0);
