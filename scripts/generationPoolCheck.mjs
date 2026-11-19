// e98: the pool of a car is its own model and its own generation. (1) a Bel Air filed under 'Impala (1958)' is not an Impala; (2) the 1994 to 1996 Impala SS is not set aside as an SS halo (it is the only Impala of its generation);
// (3) a rescue of a thin generation never widens to other generations ('Impala, all years' for a 1995 car). Class: every model with a curated generation, and the C/K trucks sold as Silverado. Fake archive.
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
import { CURATED_GENERATIONS } from "../lib/generations.js";
const genOf = (make, model, y) => CURATED_GENERATIONS.find(g => g.make === make && g.model === model && y >= g.yearStart && y <= g.yearEnd) || null;
let k = 0;
const add = (year, model, title, price, mi) => { k++; rows.push({ id: "00000000-0000-4000-8000-" + String(k).padStart(12, "0"), source_id: "g" + k, sale_price: price, sale_date: day(10 + k * 7), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Chevrolet", model, year,
  listing_title: title, vin_norm: "V" + k, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + k, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const { setMakeModels } = await import(path.join(root, "lib/onebox.js").replace(/^/, "file://"));
setMakeModels("Chevrolet", [{ name: "Bel Air" }, { name: "Impala" }, { name: "Biscayne" }, { name: "Silverado" }, { name: "Camaro" }]);
const yrs = a => (a.rawPool || []).map(r => Number(r.year));
const ans = async (model, year, text) => (await oneEngineAnswer({ make: "Chevrolet", model, trim: "", year, bodyStyle: null }, genOf("Chevrolet", model, year), text, { ...env, asked: 2, collectExcluded: !!process.env.DBG }, null)).raw;
// 1. the Impala SS is the 1994 to 1996 Impala; two Bel Air sales are filed under Impala (1958); older Impalas sit in other generations
rows = [];
for (let i = 0; i < 12; i++) add(1994 + (i % 3), "Impala", `${1994 + (i % 3)} Chevrolet Impala SS`, 14000 + i * 1500, 40000 + i * 3000);
for (let i = 0; i < 8; i++) add(1961 + (i % 4), "Impala", `${1961 + (i % 4)} Chevrolet Impala SS 409`, 40000 + i * 2000, 0);
add(1958, "Impala (1958)", "1958 Chevrolet Bel Air 2-Door Sport Coupe", 43250, 0); add(1958, "Impala (1958)", "1958 Chevrolet Bel Air 2-Door Sport Coupe", 41000, 0); add(1958, "Impala", "1958 Chevrolet Bel Air Impala Sport Coupe", 57750, 0);
let a = await ans("Impala", 1995, "1995 Chevrolet Impala"); if (process.env.DBG) console.log(JSON.stringify({ ex: ((a.dedup && a.dedup.excluded) || []).slice(0, 3).map(x => [x.reason, x.row && x.row.raw_title]) }).slice(0, 1500));
ok("1995 Impala: a range from the SS sedans of its generation", a.tier === "result" && Array.isArray(a.cluster) && a.poolN >= 8, `${a.tier} ${a.poolN} ${JSON.stringify(a.cluster)} ${a.rungLabel || ""}`);
ok("1995 Impala: every sale is 1994 to 1996", yrs(a).length > 0 && yrs(a).every(y => y >= 1994 && y <= 1996), JSON.stringify(yrs(a)));
ok("1995 Impala: the label never says all years", !/all years/i.test(String(a.rungLabel || a.scopeLabel || "")), String(a.rungLabel || a.scopeLabel));
ok("a Bel Air filed as an Impala is not in the pool, a Bel Air Impala is its own model name", !(a.rawPool || []).some(r => /bel air 2-door/i.test(String(r.rtitle || r.raw_title || r.title || ""))), "");
// 2. a thin generation: the rescue never widens to other generations
rows = [];
for (let i = 0; i < 4; i++) add(1994 + (i % 3), "Impala", `${1994 + (i % 3)} Chevrolet Impala SS`, 14000 + i * 1500, 40000);
for (let i = 0; i < 20; i++) add(1961 + (i % 4), "Impala", `${1961 + (i % 4)} Chevrolet Impala`, 30000 + i * 1000, 0);
a = await ans("Impala", 1995, "1995 Chevrolet Impala");
ok("thin generation: no sale of another generation in the pool", yrs(a).every(y => y >= 1994 && y <= 1996), `${a.tier} ${JSON.stringify(yrs(a))} ${a.rungLabel || ""}`);
ok("thin generation: the answer is not a range of 1960s cars", !(Array.isArray(a.cluster) && a.cluster[0] >= 29000), JSON.stringify(a.cluster));
// 3. Silverado: the C/K trucks of the 1988 to 1998 platform; 2004 trucks and 1960s C10s filed as Silverado are other generations
rows = [];
for (let i = 0; i < 4; i++) add(1994 + i, "Silverado", `${1994 + i} Chevrolet K1500 Silverado 4x4`, 12000 + i * 1200, 80000);
for (let i = 0; i < 12; i++) add(2003 + (i % 3), "Silverado", `${2003 + (i % 3)} Chevrolet Silverado 1500`, 9000 + i * 600, 90000);
for (let i = 0; i < 10; i++) add(1966 + (i % 3), "Silverado", `${1966 + (i % 3)} Chevrolet C10 Pickup`, 30000 + i * 1500, 0);
a = await ans("Silverado", 1995, "1995 Chevrolet Silverado");
ok("1995 Silverado: the pool stays inside its platform (1988 to 1998)", yrs(a).every(y => y >= 1988 && y <= 1998), `${a.tier} ${JSON.stringify(yrs(a))} ${a.rungLabel || ""}`);
ok("Silverado has curated generations", genOf("Chevrolet", "Silverado", 1995) && genOf("Chevrolet", "Silverado", 1995).code === "GMT400");
// 4. the 1958 Impala: two plain Bel Air sport coupes are filed under "Impala (1958)"; the Bel Air Impala is an Impala
rows = [];
for (let i = 0; i < 9; i++) add(1958, "Impala", `1958 Chevrolet Impala Sport Coupe`, 40000 + i * 1000, 0);
add(1958, "Impala (1958)", "1958 Chevrolet Bel Air 2-Door Sport Coupe", 43250, 0); add(1958, "Impala (1958)", "1958 Chevrolet Bel Air 2-Door Sport Coupe", 41000, 0); add(1958, "Impala", "1958 Chevrolet Bel Air Impala Sport Coupe", 52000, 0);
a = await ans("Impala", 1958, "1958 Chevrolet Impala");
const titles = (a.rawPool || []).map(r => String(r.rtitle || r.raw_title || r.title || r.listing_title || ""));
ok("1958 Impala: the plain Bel Air sales are not in the pool", titles.length > 0 && !titles.some(t => /Bel Air 2-Door/i.test(t)), `${a.tier} ${titles.length} ${titles.filter(t => /Bel Air/i.test(t)).join(" | ")}`);
ok("1958 Impala: the Bel Air Impala is kept (it names the Impala)", titles.some(t => /Bel Air Impala/i.test(t)), titles.length);
console.log(failed ? `generationPoolCheck: ${failed} FAIL` : "generationPoolCheck: all PASS");
process.exit(failed ? 1 : 0);
