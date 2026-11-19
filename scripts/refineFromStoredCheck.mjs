// e97: a refine of a stored market is computed from the stored answer's own pool in the same request: no archive read, no cold compute marker, no second stored row.
//   node scripts/refineFromStoredCheck.mjs [repo root]   (engine side: env.poolSeed; route side: api/sellerDecision.js wiring)
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
const car = { make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null };
const ask = (e, refine) => oneEngineAnswer(car, null, "1972 Datsun 240Z", e, refine || null);
rows = [];
const miles = [8000, 12000, 15000, 22000, 30000, 38000, 45000, 52000, 61000, 70000, 85000, 99000];
miles.forEach((m, i) => { globalThis.__MI = m; sale(1972, day(10 + i * 9), 52000 - i * 2500, null); }); globalThis.__MI = null;
const bare = (await ask(env)).raw;
ok("setup: the bare answer is a result with a pool", bare.tier === "result" && Array.isArray(bare.rawPool) && bare.rawPool.length >= 8, `${bare.tier} ${bare.rawPool && bare.rawPool.length}`);
// the stored row is JSON: the seed is what the route reads back
const seed = { rows: JSON.parse(JSON.stringify(bare.rawPool)) };
const paths = [["mileage band", { miTarget: 27000 }], ["mileage band (page sends min/max)", { miMin: 12000, miMax: 42000, miTarget: 27000 }], ["year", { year: 1972 }]];
for (const [name, refine] of paths) {
  archiveReads = 0; const t = Date.now();
  const r = (await ask({ ...env, poolSeed: seed }, refine)).raw;
  ok(`refine ${name}: no pool read from the archive (the id and VIN lookups of the cards are small keyed reads)`, archiveReads === 0, `reads ${archiveReads}`);
  ok(`refine ${name}: an answer from the stored pool, no cold or computing marker`, /^(result|thin)$/.test(r.tier) && !r.computing && !r.stillReading && r.tier !== "unavailable", `${r.tier}`);
}
{ archiveReads = 0; const r = (await ask({ ...env, poolSeed: seed }, { miTarget: 27000 })).raw;
  ok("mileage refine carries the band line from the stored pool", r.mileageBand && typeof r.mileageBand.line === "string" && r.mileageBand.line.length > 0 && r.mileageBand.target === 27000, JSON.stringify(r.mileageBand)); }
{ archiveReads = 0; const r = (await ask({ ...env, poolSeed: seed }, { miTarget: 27000 })).raw; const n = r.mileageBand && r.mileageBand.n;
  const inBand = miles.filter(m => m >= 12000 && m <= 42000).length;
  ok("the band reads the stored sales: narrowed only with 8 or more inside it, otherwise the thin-band line and all stored sales", r.mileageBand.narrowed ? n <= inBand : (n === miles.length && /Too few sales near 27,000 miles/.test(r.mileageBand.line)), `n ${n} in band ${inBand} narrowed ${r.mileageBand.narrowed}`); }
// route side: the sellerDecision wiring (a refine reads the bare stored row, passes poolSeed, marks no computing row, stores no second row)
const sd = fs.readFileSync(path.join(root, "api/sellerDecision.js"), "utf8");
ok("route: a refine reads the bare stored row and passes poolSeed to the engine", /readWarmAnswerDetailed\([^)]*warmAnswerKeyFor\(vehicle, generation, null\)/.test(sd) && /poolSeed \? \{ poolSeed \}/.test(sd));
ok("route: a seeded refine marks no computing row, hands nothing off and stores no row", /const coldStore = wantsWarm && !poolSeed/.test(sd) && /if \(coldStore\) markComputing/.test(sd) && /wantsWarm && !poolSeed && raw && answerCacheable/.test(sd));
console.log(failed ? `refineFromStoredCheck: ${failed} FAIL` : "refineFromStoredCheck: all PASS");
process.exit(failed ? 1 : 0);
