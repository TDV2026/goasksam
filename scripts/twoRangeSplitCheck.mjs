// e96 fix: a split or apart replaces the pooled headline only when at least two of its options can carry their own range (rangeFloor false). Otherwise the pooled range stays,
// with the wide line, the options line (counts) and the refine chips (state alike). Fake archive, no database. Class: gearbox, body, mileage, year and edition splits all go through pooledApartGuard.
//   node scripts/twoRangeSplitCheck.mjs [repo root]
//   node scripts/splitStateCheck.mjs [repo root]
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
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(globalThis.__MI != null ? globalThis.__MI : 30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const spread = (model, body, tx, lo, step, count, ago0) => { for (let i = 0; i < count; i++) sale(model, body, tx, lo + i * step, ago0 + i * 7); };
MK = "BMW";
// 1. gearbox: Manual 20 sales, Automatic 5 (under the range floor), medians far apart. One option can carry a range, so the pooled range stays.
spread("T1", "Coupe", "Manual", 30000, 500, 20, 5); spread("T1", "Coupe", "Automatic", 18000, 300, 5, 6);
let a = await ask("T1");
ok("one option carries a range: the pooled range stays, state alike", a.tier === "result" && hasPooled(a) && a.optionsState === "alike", `${a.optionsState} ${JSON.stringify(a.cluster)}`);
ok("one option carries a range: the options line keeps the counts, no headlineLines, emailMode range_with_options", Array.isArray(a.optionLines) && a.optionLines.length === 2 && a.optionLines.some(l => /too few for a range/.test(l)) && a.headlineLines.length === 0 && a.emailMode === "range_with_options", `${JSON.stringify(a.optionLines)} ${a.emailMode}`);
ok("one option carries a range: the refine chips list both options", Array.isArray(a.refineOptions) && a.refineOptions.length === 2 && a.refineOptions.every(o => o.dimension === "gearbox" && o.refine), JSON.stringify(a.refineOptions));
ok("one option carries a range: pooledApart is not set", !a.pooledApart && a.thinReason !== "pooled_apart", String(a.thinReason));
// 2. body apart with one side under the floor
spread("T2", "Coupe", "Manual", 20000, 200, 12, 5); spread("T2", "Convertible", "Manual", 70000, 200, 5, 6);
a = await ask("T2");
ok("apart with one option under the floor: pooled range stays", hasPooled(a) && a.optionsState === "alike" && a.emailMode === "range_with_options", `${a.optionsState} ${a.emailMode}`);
// 3. no option can carry a range (all under 8)
spread("T3", "Coupe", "Manual", 30000, 300, 6, 5); spread("T3", "Coupe", "Automatic", 18000, 300, 5, 6); spread("T3", "Coupe", "Manual", 31000, 300, 2, 7);
a = await ask("T3");
ok("no option carries a range: never a split with zero ranges", a.optionsState !== "split" && a.optionsState !== "apart", a.optionsState);
// 4. control: two options that each carry a range still split
spread("T4", "Coupe", "Manual", 21000, 1100, 20, 5); spread("T4", "Coupe", "Automatic", 18000, 710, 20, 8);
a = await ask("T4");
ok("control: two options with ranges still split and withhold the pooled headline", !hasPooled(a) && a.optionsState === "split" && a.headlineLines.length === 2, `${a.optionsState}`);
// 5. mileage: wide range, three bands each under 8 sales: no split, wide line and counts stay
const mi = (model, miles, prices, ago0) => { globalThis.__MI = miles; prices.forEach((p, i) => sale(model, "Coupe", "Manual", p, ago0 + i * 6)); globalThis.__MI = null; };
mi("T5", 30000, [60000, 62000, 64000, 66000], 5); mi("T5", 70000, [30000, 31000, 32000, 33000, 34000, 35000], 6); mi("T5", 130000, [10000, 11000, 12000, 13000, 14000, 15000, 16000], 7);
a = await ask("T5");
ok("mileage bands all under the floor: no split, pooled range stays", !(a.optionsState === "split" && !hasPooled(a)), `${a.optionsState} ${a.headlineDimension} ${JSON.stringify(a.cluster)}`);
console.log(failed ? `twoRangeSplitCheck: ${failed} FAIL` : "twoRangeSplitCheck: all PASS");
process.exit(failed ? 1 : 0);
