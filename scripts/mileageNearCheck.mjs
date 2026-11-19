// e98: mileageNear. When a live listing states its mileage the engine's answer also carries the mileage band answer for that mileage (the typed-mileage band): range at 8 or more sales,
// the span of the sales at 3 to 7 (labelled sales, not a range), nothing under 3, and the bid placed against it. Fixture: the 2003 BMW Alpina Roadster V8 at 11,000 miles. Fake archive.
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
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(globalThis.__MI != null ? globalThis.__MI : 60000), body_style: null, modifications: null, title: `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
let archiveReads = 0;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    if (/sale_date=(gte|lt)\./.test(u.search) || /[?&]make=/.test(u.search)) archiveReads++; if (process.env.SHOWREADS) console.log("READ", u.search.slice(0, 200));
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
const day = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
import fs from "fs";
const { marketFromCore, coreOf, listingFacts } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const car = { make: "BMW", model: "Alpina Roadster V8", trim: "", year: 2003, bodyStyle: null };
const run = async (miles, bid, extra = {}) => (await E.oneEngineAnswer({ ...car, ...(miles != null ? { listingMiles: miles, listingBid: bid } : {}) }, null, "2003 BMW Alpina Roadster V8", { ...env, asked: 2 }, null)).raw;
let k0 = 0;
const mk = (miList) => { rows = []; k0 = 0; miList.forEach((m, i) => { globalThis.__MI = m; saleA(2003, day(10 + i * 9), 90000 + (i % 7) * 4000 + (m > 30000 ? -20000 : 0), null); }); globalThis.__MI = null; };

const saleA = (year, date, price, hr) => { k0++; rows.push({ id: "00000000-0000-4000-8000-" + String(k0).padStart(12, "0"), source_id: "al" + k0, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "BMW", model: "Alpina Roadster V8", year,
  listing_title: `${year} BMW Alpina Roadster V8`, vin_norm: "V" + k0, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: hr, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(globalThis.__MI), body_style: null, modifications: null, title: `${year} BMW Alpina Roadster V8`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + k0, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
// 1. ten sales inside 0 to 26,000 miles (11,000 +/- 15,000) and four far outside: a range
mk([2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000, 40000, 55000, 70000, 90000]);
let a = await run(11000, 98000);
let nr = a.mileageNear;
ok("11,000 miles, 10 sales in the band: mileageNear is a range", nr && nr.kind === "range" && nr.n === 10 && nr.low > 0 && nr.high > nr.low && nr.miMin === 0 && nr.miMax === 26000, JSON.stringify(nr));
ok("the line names the count, the miles and the range", nr && /^Near 11,000 miles: \$[\d,]+ to \$[\d,]+, ten sales\.$/.test(nr.line) && /^The bid is (inside|below|above) the range\.$/.test(nr.bidLine || "The bid is inside the range."), nr && nr.line);   // the Find card's fifth line (Oct 29 2026)
ok("the bid is placed against the range", nr && nr.bid && nr.bid.amount === 98000 && ["below", "within", "above"].includes(nr.bid.against) && nr.bid.of === "range", JSON.stringify(nr && nr.bid));
// 2. five sales in the band: the span of those sales, labelled as sales, not a range
mk([3000, 7000, 12000, 18000, 25000, 40000, 55000, 70000, 90000]);
a = await run(11000, 60000); nr = a.mileageNear;
ok("5 sales in the band: the span of those sales, labelled sales not a range", nr && nr.kind === "sales" && nr.n === 5 && nr.spanLabel === "sales, not a range" && /^Near 11,000 miles: five sales, \$[\d,]+ to \$[\d,]+\.$/.test(nr.line) && (!nr.bidLine || /^The bid is (inside|below|above) them\.$/.test(nr.bidLine)), JSON.stringify(nr));
// 3. two sales: the field is empty
mk([3000, 25000, 40000, 55000, 70000, 90000]);
a = await run(11000, 60000);
ok("2 sales in the band: the field is empty", a.mileageNear == null, JSON.stringify(a.mileageNear));
// 4. a listing with no stated mileage carries no field
a = await run(null, null);
ok("no stated mileage: no mileageNear", a.mileageNear == null);
// 5. the Find card carries it: the stored core and the market for the listing's own mileage
mk([2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 20000, 24000, 40000, 55000, 70000, 90000]);
a = await run(null, null);
const core = coreOf(a, { v: car, generation: null, refine: null });
const facts = { miles: 11000, priceUsd: 98000 };
const mkt = marketFromCore(core, { id: 1, listing_title: "2003 BMW Alpina Roadster V8" }, facts, { v: car, key: "k", title: "2003 BMW Alpina Roadster V8" });
ok("Find: the listing's market carries the same mileageNear the engine gives for that mileage", mkt && mkt.mileageNear && JSON.stringify(mkt.mileageNear) === JSON.stringify((await run(11000, 98000)).mileageNear), JSON.stringify(mkt && mkt.mileageNear));
ok("Find: the stored core holds no per-listing mileage", core && core.mileageNear == null || core.mileageNear === null);
console.log(failed ? `mileageNearCheck: ${failed} FAIL` : "mileageNearCheck: all PASS");
process.exit(failed ? 1 : 0);
