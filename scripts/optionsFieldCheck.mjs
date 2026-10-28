// e96 part 2: every answer with options carries an options field (the pooledSplit.options shape plus rangeFloor); a window note only beside a range; an option under the range floor
// prints its count and "too few for a range"; option counts say they come from the option's own window and never silently exceed the pool. Fake archive, no database.
//   node scripts/optionsFieldCheck.mjs [repo root]
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
// A. alike bodies, each with 12 sales: the range stays, the options ride under it with their own figures
fill("AlikeA", [["Coupe", null, 30000, 12, 5], ["Convertible", null, 30600, 12, 7]]);
let a = await ask("AlikeA");
ok("alike: the pooled range is kept and optionsState says alike", a.tier === "result" && hasPooled(a) && a.optionsState === "alike" && !a.pooledApart && a.emailMode === "range_with_options", `${a.optionsState} ${a.emailMode}`);
ok("alike: options carries both bodies, each with n, low, high, median and its own window words", Array.isArray(a.options) && a.options.length === 2 && a.options.every(o => o.dimension === "body" && o.n >= 8 && o.low > 0 && o.high >= o.low && o.median > 0 && o.rangeFloor === false && o.ownWindow === true && typeof o.windowWords === "string" && o.windowWords.length > 0), JSON.stringify(a.options));
ok("alike: optionLines are written by the engine, one per option, with the range and the count", Array.isArray(a.optionLines) && a.optionLines.length === 2 && a.optionLines.every(l => /\$[\d,]+ to \$[\d,]+, \d+ sales$/.test(l)), JSON.stringify(a.optionLines));
// B. one body under the range floor (5 sales): count and "too few for a range", no range, no window note
fill("Floor", [["Coupe", null, 30000, 14, 5], ["Convertible", null, 30400, 5, 7]]);
a = await ask("Floor");
const fo = (a.options || []).find(o => o.label === "Convertible");
ok("floor: the small option is carried with its count, no range and rangeFloor true", fo && fo.n === 5 && fo.low === null && fo.high === null && fo.rangeFloor === true, JSON.stringify(fo));
ok("floor: its line prints the count and \"too few for a range\"", (a.optionLines || []).some(l => /^Convertible, 5 sales, too few for a range$/.test(l)), JSON.stringify(a.optionLines));
ok("floor: no option without a range carries a window note", (a.options || []).every(o => !(o.rangeFloor && (o.windowNote || o.windowLonger === true))), JSON.stringify((a.options || []).map(o => [o.label, o.windowNote])));
// C. a window note appears only beside a range, whatever the option
const stubEd = (std, ed) => ({ tier: "result", windowMonths: 12, poolN: 21, cluster: [20000, 40000], rawPool: [], variantOptionsLine: [{ key: "ed", options: [{ value: "standard", label: "Standard", n: 12, ownN: 12, ...std }, { value: "ed", label: "Special edition", n: 9, ownN: ed.windowMonths > 12 ? 14 : 9, ...ed }] }] });
let sp = E.pooledApartGuard(stubEd({ low: 20000, high: 30000, median: 25000, windowMonths: 12 }, { low: 21000, high: 31000, median: 26000, windowMonths: 30 }));
ok("window: an option read over a longer window than the headline says so, beside its range", sp.options.some(o => o.windowLonger === true && /over the last 30 months/.test(o.windowNote) && o.low > 0), JSON.stringify(sp.options.map(o => [o.label, o.windowNote])));
ok("window: every option names its window in windowWords", sp.options.every(o => typeof o.windowWords === "string" && o.windowWords.length), JSON.stringify(sp.options.map(o => o.windowWords)));
// D. option counts that add up to more than the headline say why
sp = E.pooledApartGuard({ ...stubEd({ low: 20000, high: 30000, median: 25000, windowMonths: 12 }, { low: 21000, high: 31000, median: 26000, windowMonths: 30 }), poolN: 14 });
ok("counts: when the options add up to more than the headline count, optionsNote says each reads its own time span", /own time spans/.test(sp.optionsNote || ""), String(sp.optionsNote));
sp = E.pooledApartGuard({ ...stubEd({ low: 20000, high: 30000, median: 25000, windowMonths: 12 }, { low: 21000, high: 31000, median: 26000, windowMonths: 12 }), poolN: 21 });
ok("counts: when they do not, there is no note", !sp.optionsNote, String(sp.optionsNote));
// E. the shared field list carries the new fields
const { CARD_FIELDS } = await import(pathToFileURL(path.join(root, "lib/engineFields.js")).href);
ok("CARD_FIELDS carries options, optionsState, optionLines, refineOptions, optionsNote, rangeFloor", ["options", "optionsState", "optionLines", "refineOptions", "optionsNote", "rangeFloor", "headlineLines", "headlineDimension"].every(k => CARD_FIELDS.includes(k)));
console.log(failed ? `optionsFieldCheck: ${failed} FAIL` : "optionsFieldCheck: all PASS");
process.exit(failed ? 1 : 0);
