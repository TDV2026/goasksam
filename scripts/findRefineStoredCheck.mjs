// e98: a refine on a FIND card (lib/live/search.js engineAnswer) reads the stored bare answer's pool like Market Check: no archive pool read, no second stored row per refine.
//   node scripts/findRefineStoredCheck.mjs [repo root]
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
let archiveReads = 0, specWrites = 0, STORED = null;
globalThis.fetch = async (url, init) => {
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
  if (u.pathname.endsWith("/spec_market_cache")) {
    if ((init && init.method) === "POST" || (init && init.method) === "PATCH") { specWrites++; return new Response("[]", { status: 201 }); }
    if (STORED && decodeURIComponent(u.search).includes("MCWARM:")) return new Response(JSON.stringify([{ market: { raw: STORED, engineVersion: E.ENGINE_VERSION, warmEpoch: null }, computed_at: new Date().toISOString() }]), { status: 200 });
    return new Response("[]", { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const day = (i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
import fs from "fs";
const { engineAnswer } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const car = { make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null };
rows = [];
const miles = [8000, 12000, 15000, 22000, 30000, 38000, 45000, 52000, 61000, 70000, 85000, 99000];
miles.forEach((m, i) => { globalThis.__MI = m; sale(1972, day(10 + i * 9), 52000 - i * 2500, null); }); globalThis.__MI = null;
const bare = (await E.oneEngineAnswer(car, null, "1972 Datsun 240Z", { ...env, asked: 2 }, null)).raw;
STORED = JSON.parse(JSON.stringify(bare));
archiveReads = 0; specWrites = 0;
const d = await engineAnswer(car, null, "1972 Datsun 240Z", env, { tx: "manual", label: "Manual" });
ok("Find refine: an answer comes back from the stored pool", d && /^(result|thin|refusal|not_tracked)$/.test(String(d.tier)), String(d && d.tier));
ok("Find refine: no pool read from the archive", archiveReads === 0, `reads ${archiveReads}`);
ok("Find refine: no second stored row per refine", specWrites === 0, `writes ${specWrites}`);
// without a stored bare answer the refine computes as before (and may store)
STORED = null; archiveReads = 0;
await engineAnswer({ ...car, model: "240Z", year: 1973 }, null, "1973 Datsun 240Z", env, { tx: "manual", label: "Manual" }).catch(() => null);
ok("Find refine with no stored bare answer: falls through to the compute", archiveReads > 0, `reads ${archiveReads}`);
const sx = fs.readFileSync(path.join(root, "lib/live/search.js"), "utf8");
ok("Find: engineAnswer seeds a refine from the stored bare pool and stores no row for it", /poolSeed = \{ rows: br\.rawPool/.test(sx) && /!escalated && !poolSeed &&/.test(sx));
console.log(failed ? `findRefineStoredCheck: ${failed} FAIL` : "findRefineStoredCheck: all PASS");
process.exit(failed ? 1 : 0);
