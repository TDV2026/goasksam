// e98: ONE thin threshold on Find and Market Check (8 sales, RANGE_THRESHOLD). Under it the Find card is thin; at 8 or more with no range the engine's own reason line is printed, never 'Thin so far';
// every sale on the thin line carries its year and body. Engine side: thin_sales {thin, threshold, reason_line, sales[].year/body}. Card side: the Find card client in api/buy.js. Fake archive.
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
import fs from "fs";
const spread = (model, body, tx, lo, step, count, ago0) => { for (let i = 0; i < count; i++) sale(model, body, tx, lo + i * step, ago0 + i * 7); };
MK = "BMW";
// 1. 40 sales split into two gearbox ranges: no pooled range, so the card has no range; the count is far over the threshold
spread("T4", "Coupe", "Manual", 21000, 1100, 20, 5); spread("T4", "Coupe", "Automatic", 18000, 710, 20, 8);
let a = await ask("T4");
const ts = a.thin_sales; if (process.env.DBG) console.log(a.tier, a.optionsState, a.poolN, !!a.cluster, a.rawPool && a.rawPool.length, a.thin_sales);
ok("8 or more sales, no range: thin_sales is not thin and carries the threshold", ts && ts.count >= 8 && ts.thin === false && ts.threshold === 8, JSON.stringify(ts && { c: ts.count, t: ts.thin, th: ts.threshold }));
ok("8 or more sales, no range: the engine's reason line says why", ts && typeof ts.reason_line === "string" && ts.reason_line.length > 20 && !/thin/i.test(ts.reason_line), ts && ts.reason_line);
ok("every listed sale carries its year", ts && ts.sales.length > 0 && ts.sales.every(x => Number(x.year) > 0 && "body" in x), JSON.stringify(ts && ts.sales[0]));
// 2. 5 sales: thin, no reason line
spread("T6", "Coupe", "Manual", 30000, 800, 5, 5);
a = await ask("T6");
ok("under 8 sales: thin true, no reason line", a.thin_sales && a.thin_sales.thin === true && a.thin_sales.reason_line === null && a.thin_sales.count === 5, JSON.stringify(a.thin_sales && { c: a.thin_sales.count, t: a.thin_sales.thin }));
// 3. the Find card prints them
const s = fs.readFileSync(path.join(root, "api/buy.js"), "utf8");
const i0 = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i0, s.indexOf('";\n', i0) + 1));
const block = (from, to) => { const x = c.indexOf(from), y = c.indexOf(to, x); if (x < 0 || y < 0) throw new Error("missing " + from); return c.slice(x, y); };
const esc = new Function(block("function esc(s){", "function usd(n)") + "\nreturn esc;")();
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const thinSales = new Function("esc", "usd", "REL_MC", block("  function thinSales(l){", "  function samLine(l){") + "\nreturn thinSales;")(esc, usd, true);
const text = h => h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
const card = (t) => ({ id: 1, market: { kind: "count", query: "2004 Porsche Boxster", thin_sales: t } });
const sale2 = (price, year, body) => ({ price, year, body, month: "September 2026", venue: "Bring a Trailer", url: "https://x" });
const wide = thinSales(card({ count: 12, thin: false, threshold: 8, reason_line: "These sales split into options that sit in different price ranges, so no one typical range is shown.", sales: [sale2(14000, 2004, "Convertible"), sale2(21000, 2004, "Convertible")], latest_month: "September 2026" }));
ok("card, 12 sales: the engine's reason line, never 'Thin so far'", wide && /different price ranges/.test(wide.html) && !/Thin so far/.test(wide.html) && !/Only 12/.test(text(wide.html)), wide && text(wide.html));
ok("card: each price prints its year and body", wide && /\$14,000\|? \(2004 Convertible\)/.test(text(wide.html).replace(/\|/g, "")) , wide && text(wide.html));
const few = thinSales(card({ count: 3, thin: true, threshold: 8, reason_line: null, sales: [sale2(8500, 1998, "Coupe")], latest_month: "June 2026" }));
ok("card, 3 sales: still 'Thin so far' with the year and body", few && /Thin so far/.test(few.html) && /1998 Coupe/.test(text(few.html)), few && text(few.html));
console.log(failed ? `findThinThresholdCheck: ${failed} FAIL` : "findThinThresholdCheck: all PASS");
process.exit(failed ? 1 : 0);
