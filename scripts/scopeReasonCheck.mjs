// e93: scope_reason (why the pool is wider than the typed year), the 325xi receipts gate, and Where to sell on the engine's own counts. No database: a fake archive.
//   node scripts/scopeReasonCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { oneEngineAnswer, scopeReasonOf, venueCountsOf } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0;
const sale = (year, date, price, hr, mm = "Datsun", mo = "240Z", ttl = null) => { n++; ttl = ttl || `${year} ${mm} ${mo}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sf" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: mm, model: mo, year,
  listing_title: ttl, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title: ttl, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const askV = (v, text) => oneEngineAnswer(v, null, text, env, null);
const V = (yr) => ({ make: "Datsun", model: "240Z", trim: "", year: yr, bodyStyle: null });
// no sale of the typed year: "No 1974 sales yet, showing 1972 to 1973"
rows = [];
for (let i = 0; i < 9; i++) sale(1972 + (i % 2), day(10 + i * 9), 21000 + i * 300, true);
let a = await askV(V(1974), "1974 Datsun 240Z");
ok("no sale of the typed year", a.raw.scope_reason === "No 1974 sales yet, showing 1972 to 1973", String(a.raw.scope_reason) + " / " + JSON.stringify(a.raw.poolYears));
ok("the field reaches the mapped answer", a.scope_reason === a.raw.scope_reason);
// a few of the typed year, not enough: "Too few 2006 sales"
rows = [];
for (let i = 0; i < 3; i++) sale(1972, day(10 + i * 9), 30000 + i * 300, true);
for (let i = 0; i < 7; i++) sale(1971 + (i % 2) * 2, day(40 + i * 9), 26000 + i * 300, true);
a = await askV(V(1972), "1972 Datsun 240Z");
ok("some of the typed year, under the floor", /^Too few 1972 sales, showing 1971 to 1973$/.test(String(a.raw.scope_reason)), String(a.raw.scope_reason) + " / " + JSON.stringify(a.raw.poolYears));
// the pool is the typed year: null
rows = [];
for (let i = 0; i < 10; i++) sale(1972, day(10 + i * 9), 30000 + i * 300, true);
a = await askV(V(1972), "1972 Datsun 240Z");
ok("the typed year's own pool carries null", a.raw.scope_reason === null && a.raw.tier === "result", String(a.raw.scope_reason));
// a typed year with eight of its own inside a wider pool: null
ok("eight of the typed year is the typed scope: null", scopeReasonOf({ tier: "result", poolYears: [1970, 1974], rawPool: Array.from({ length: 9 }, () => ({ year: 1972 })) }, { year: 1972 }) === null);
ok("no typed year, a span, or no pool read: null", scopeReasonOf({ tier: "result", poolYears: [1970, 1974], rawPool: [] }, { year: null }) === null && scopeReasonOf({ tier: "refusal", poolYears: [1970, 1974] }, { year: 1972 }) === null && scopeReasonOf(null, { year: 1972 }) === null);
// the stored core carries it
{ const { coreOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
  rows = []; for (let i = 0; i < 9; i++) sale(1972 + (i % 2), day(10 + i * 9), 21000 + i * 300, true);
  const x = await askV(V(1974), "1974 Datsun 240Z"); const core = coreOf(x.raw, { v: V(1974), generation: null, refine: null });
  ok("the stored core carries scope_reason unchanged", core && core.scope_reason === "No 1974 sales yet, showing 1972 to 1973", String(core && core.scope_reason)); }
// the receipts gate: 325xi is a 325i
rows = [];
for (let i = 0; i < 5; i++) sale(2006, day(10 + i * 20), 7000 + i * 300, true, "BMW", "325i", "2006 BMW 325i Sedan");
for (let i = 0; i < 5; i++) sale(2006, day(15 + i * 20), 7500 + i * 300, true, "BMW", "3-Series", "2006 BMW 325xi Sedan");
a = await askV({ make: "BMW", model: "325i", trim: "", year: 2006, bodyStyle: "Sedan" }, "2006 BMW 325i Sedan");
ok("a pool of 325i and 325xi sales is not read as a swapped pool", a.raw.tier !== "refusal" && Number(a.raw.poolN) > 0, a.raw.tier + " poolN " + a.raw.poolN + " " + JSON.stringify(a.raw.refusal || null));
ok("the scope label names both: 325i and 325xi", /325i and 325xi/.test(String(a.raw.scopeLabel)) && /325i and 325xi/.test(String(a.raw.rungLabel)), a.raw.scopeLabel);
rows = [];
for (let i = 0; i < 10; i++) sale(2006, day(10 + i * 20), 7000 + i * 300, true, "BMW", "3-Series", "2006 BMW 330i Sedan");
a = await askV({ make: "BMW", model: "325i", trim: "", year: 2006, bodyStyle: "Sedan" }, "2006 BMW 325i Sedan");
ok("a real swap (330i receipts for a 325i) still refuses or is not served as the 325i", a.raw.tier === "refusal" || a.raw.tier === "not_tracked" || !(a.raw.cluster), a.raw.tier);
// a refusal: the sentence is a field, and refused sales are never thin (the typed-model guard refuses a pool read for another car)
rows = []; for (let i = 0; i < 10; i++) sale(1966, day(10 + i * 9), 30000 + i * 300, true, "Ford", "Mustang");
{ const g = await oneEngineAnswer({ make: "Ford", model: "Mustang", trim: "", year: 1966, bodyStyle: null }, null, "1966 Ford GT40", env, null);
  ok("a refusal carries its sentence as refusal_line and no thin_sales", g.raw.tier === "refusal" && g.raw.refusal_line === g.raw.samLine && /could not verify/i.test(String(g.raw.refusal_line)) && g.raw.thin_sales === null && g.refusal_line === g.raw.refusal_line, g.raw.tier + " " + g.raw.refusal_line + " " + JSON.stringify(g.raw.thin_sales)); }
// Where to sell: the engine's own counts, no price
rows = []; for (let i = 0; i < 4; i++) sale(1972, day(10 + i * 9), 30000 + i * 300, true);
a = await askV(V(1972), "1972 Datsun 240Z");
const vc = venueCountsOf(a.raw);
ok("venueCountsOf: a count and the newest sale per venue, no price", vc.length === 1 && vc[0].sales === 4 && vc[0].platform === "Bring a Trailer" && !("price" in vc[0]) && !("median" in vc[0]), JSON.stringify(vc));
{ const fs = await import("node:fs"); const src = fs.readFileSync(path.join(root, "lib/tools/whereToSell.js"), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  ok("whereToSell reads oneEngineAnswer and computes no median", /oneEngineAnswer/.test(src) && !/listSalesForVehicle|median|\.sort\(|prices|Math\.floor/.test(src)); }
console.log(`scopeReasonCheck: ${failed ? failed + " FAIL" : "all PASS"}`);
process.exit(failed ? 1 : 0);
