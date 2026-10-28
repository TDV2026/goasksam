// e96 part 5: a range whose top is above 1.6 times its bottom carries wideCause (mileage, year, mods, none), wideLever and wideLine, read from that set's own sales, on the headline
// range and on every option line that is itself wide. Fake archive, no database.   node scripts/wideCauseCheck.mjs [repo root]
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
const mk = (p, mi, y, mod) => ({ _usd: p, mileage: String(mi), year: y, mods: mod ? '["Aftermarket wheels"]' : "[]" });
const set = (n, f) => Array.from({ length: n }, (_, i) => f(i));
// unit: the cause comes from the set's own sales
let w = E.wideOf(set(14, i => mk(80000 - i * 4500, 12000 + i * 7000, 2001, false)), [36000, 65000]);
ok("unit mileage: price falls as miles rise", w && w.wideCause === "mileage" && w.wideLever === "mileage" && /^Wide because [\d,]+ to [\d,]+ miles\. Add yours\.$/.test(w.wideLine), JSON.stringify(w));
w = E.wideOf(set(15, i => mk(20000 + Math.floor(i / 5) * 18000 + (i % 5) * 500, 40000 + ((i * 7919) % 13) * 1000, 2001 + Math.floor(i / 5), false)), [20000, 58000]);
ok("unit year: three model years that price apart, mileage scattered", w && w.wideCause === "year" && w.wideLever === "year" && /^Wide because these run from 2001 to 2003\. Pick a year\.$/.test(w.wideLine), JSON.stringify(w));
w = E.wideOf(set(12, i => mk(i < 6 ? 60000 + i * 300 : 25000 + i * 300, 40000 + ((i * 7919) % 13) * 1000, 2001, i < 6)), [25000, 62000]);
ok("unit mods: modified and stock sales price apart", w && w.wideCause === "mods" && /^Wide because 6 of the 12 sales had modifications\.$/.test(w.wideLine), JSON.stringify(w));
w = E.wideOf(set(10, i => mk(20000 + ((i * 7919) % 10) * 4000, 40000 + ((i * 6007) % 11) * 1000, 2001, i % 2 === 0 ? false : false)), [20000, 56000]);
ok("unit none: nothing measurable explains it", w && w.wideCause === "none" && w.wideLever === null && /^These sell on condition and history more than mileage\. Here are the 10 sales\.$/.test(w.wideLine), JSON.stringify(w));
ok("unit: a range at or under 1.6 times carries nothing", E.wideOf(set(10, i => mk(30000 + i * 500, 1000 * i, 2001, false)), [30000, 48000]) === null);
// end to end: a wide car whose price tracks mileage
MK = "Testmake";
for (let i = 0; i < 16; i++) sale("Wide1", "Coupe", null, 82000 - i * 4300, 5 + i * 9);
let a = await ask("Wide1");
ok("engine: the headline range is wide and says mileage", a.tier === "result" && Array.isArray(a.cluster) && a.cluster[1] > 1.6 * a.cluster[0] && a.wideCause === "mileage" && /Add yours\.$/.test(a.wideLine || ""), `${JSON.stringify(a.cluster)} ${a.wideCause} ${a.wideLine}`);
// each option line carries its own cause: coupes wide by mileage, convertibles tight
for (let i = 0; i < 14; i++) sale("Wide2", "Coupe", null, 90000 - i * 5000, 5 + i * 9);
for (let i = 0; i < 14; i++) sale("Wide2", "Convertible", null, 70000 + (i % 3) * 400, 6 + i * 9);
a = await ask("Wide2");
const co = (a.options || []).find(o => o.label === "Coupe"), cv = (a.options || []).find(o => o.label === "Convertible");
ok("options: the wide option (coupe) carries a cause from its own sales", co && co.high > 1.6 * co.low && co.wideCause === "mileage" && /Add yours\.$/.test(co.wideLine || ""), JSON.stringify(co));
ok("options: the tight option (convertible) carries none", cv && cv.wideCause === null && cv.wideLine === null, JSON.stringify(cv));
console.log(failed ? `wideCauseCheck: ${failed} FAIL` : "wideCauseCheck: all PASS");
process.exit(failed ? 1 : 0);
