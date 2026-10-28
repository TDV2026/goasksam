// e96 part 3: options that split (medians 15 percent apart) or sit apart (ranges do not overlap) print NO pooled headline: low and high null, headlineLines from the options, emailMode options.
// One dimension at a time: the headline split is the dimension whose option medians are furthest apart, the rest ride as refineOptions (label, value, count; no ranges).
// A refine request returns the combined set from oneEngineAnswer; under 3 sales rangeFloor is true. Alike keeps one range with the options line under it. Fake archive, no database.
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
const spread = (model, body, tx, lo, step, count, ago0) => { for (let i = 0; i < count; i++) sale(model, body, tx, lo + i * step, ago0 + i * 7); };
const refined = async (model, refine) => (await E.oneEngineAnswer({ make: MK, model, trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} ${model}`, { ...env, asked: 2 }, refine)).raw;
// 1. gearbox split only (ranges overlap, medians 15 percent apart): no headline
MK = "BMW";
spread("G1", "Coupe", "Manual", 21000, 1100, 20, 5); spread("G1", "Coupe", "Automatic", 18000, 710, 20, 8);
let a = await ask("G1");
ok("split: no pooled headline, low and high null, the state is split", a.tier === "result" && !hasPooled(a) && a.low == null && a.high == null && a.optionsState === "split" && a.pooledApart && a.pooledApart.state === "split", `${a.optionsState} ${JSON.stringify(a.cluster)}`);
ok("split: headlineLines are the options, one line each with its own range and count", a.headlineLines.length === 2 && a.headlineLines.every(l => /\$[\d,]+ to \$[\d,]+, \d+ sales$/.test(l)) && JSON.stringify(a.headlineLines) === JSON.stringify(a.optionLines), JSON.stringify(a.headlineLines));
ok("split: emailMode is options", a.emailMode === "options", a.emailMode);
// 2. two dimensions split: body and gearbox. Body medians 2.2x apart, gearbox medians 1.2x apart: body is the headline, gearbox rides as refineOptions
spread("G2", "Coupe", "Manual", 22000, 400, 12, 5); spread("G2", "Coupe", "Automatic", 20000, 400, 12, 6);
spread("G2", "Convertible", "Manual", 50000, 500, 12, 7); spread("G2", "Convertible", "Automatic", 42000, 500, 12, 8);
a = await ask("G2");
ok("two dimensions: the headline split is the dimension whose medians are furthest apart (body)", a.headlineDimension === "body" && a.options.every(o => o.dimension === "body") && a.options.length === 2, `${a.headlineDimension} ${JSON.stringify((a.options || []).map(o => [o.dimension, o.label, o.median]))}`);
ok("two dimensions: the other dimension rides as refineOptions, each with a count and no range", Array.isArray(a.refineOptions) && a.refineOptions.length === 2 && a.refineOptions.every(o => o.dimension === "gearbox" && o.n > 0 && !("low" in o) && !("high" in o) && !("median" in o)), JSON.stringify(a.refineOptions));
ok("two dimensions: never a second set of ranges on the answer", (a.pooledApart ? a.pooledApart.options : a.options).every(o => o.dimension === "body") && a.headlineLines.every(l => !/Manual|Automatic/.test(l)), JSON.stringify(a.headlineLines));
// 3. a refine request returns the combined set from the engine
const cm = await refined("G2", { body: "coupe", tx: "manual" });
ok("refine: body coupe and tx manual return the combined set (12 sales)", cm.tier === "result" && cm.poolN === 12 && cm.rangeFloor === false, `${cm.tier} ${cm.poolN} ${cm.rangeFloor}`);
spread("G3", "Coupe", "Manual", 30000, 300, 12, 5); spread("G3", "Coupe", "Automatic", 22000, 300, 12, 6); spread("G3", "Convertible", "Manual", 60000, 300, 2, 7); spread("G3", "Convertible", "Automatic", 41000, 300, 12, 8);
const few = await refined("G3", { body: "convertible", tx: "manual" });
ok("refine: a combined set under 3 sales prints its count and rangeFloor true, no range", few.rangeFloor === true && !(Array.isArray(few.cluster) && few.cluster.length === 2), `${few.tier} n ${few.poolN} floor ${few.rangeFloor} cluster ${JSON.stringify(few.cluster)}`);
// 4. alike keeps one range with the options under it
spread("G4", "Coupe", "Manual", 30000, 300, 12, 5); spread("G4", "Convertible", "Manual", 30500, 300, 12, 6);
a = await ask("G4");
ok("alike: one range, options under it, emailMode range_with_options", hasPooled(a) && a.optionsState === "alike" && a.options.length === 2 && a.headlineLines.length === 0 && a.emailMode === "range_with_options", `${a.optionsState} ${a.emailMode}`);
// 5. apart (ranges do not overlap) behaves the same way
spread("G5", "Coupe", "Manual", 20000, 200, 12, 5); spread("G5", "Convertible", "Manual", 70000, 200, 12, 6);
a = await ask("G5");
ok("apart: no headline, state apart, emailMode options", !hasPooled(a) && a.optionsState === "apart" && a.pooledApart.state === "apart" && a.emailMode === "options" && a.low == null, `${a.optionsState} ${a.emailMode}`);
console.log(failed ? `splitStateCheck: ${failed} FAIL` : "splitStateCheck: all PASS");
process.exit(failed ? 1 : 0);
