// e95: one set of sales. The range, the count, the trim mix, every tile and the set-aside line of one answer come from the same sales on every
// product: the answer's count is its pool, every card and tile is a sale of the pool or a labelled set-aside, the printed range is the cluster and
// sits inside the pool, and a tile outside the printed range is only ever a labelled one. No database: a fake archive.
//   node scripts/sameSetCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (make, model, year, title, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "ss" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(9000 + n * 700), body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
// a dense model with a price outlier each side (the outliers are set aside or sit outside the band), a thin one, and a spread one
for (let i = 0; i < 24; i++) sale("Acme", "Dense", 1990, "1990 Acme Dense Coupe", 40000 + (i % 8) * 900, 10 + i * 20);
sale("Acme", "Dense", 1990, "1990 Acme Dense Coupe", 250000, 30); sale("Acme", "Dense", 1990, "1990 Acme Dense Coupe", 9000, 60);
for (let i = 0; i < 5; i++) sale("Acme", "Thinner", 1990, "1990 Acme Thinner Coupe", 30000 + i * 500, 10 + i * 40);
for (let i = 0; i < 10; i++) sale("Acme", "Spread", 1990, "1990 Acme Spread Coupe", 20000 + i * 9000, 10 + i * 40);
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
for (const model of ["Dense", "Thinner", "Spread"]) {
  const r = await E.oneEngineAnswer({ make: "Acme", model, trim: "", year: 1990, bodyStyle: "coupe" }, null, `1990 Acme ${model} Coupe`, env, null);
  const v = E.setConsistencyOf(r.raw, r);
  ok(`${model}: tier ${r.raw.tier}, count ${r.raw.poolN}, one set of sales`, v.length === 0, v.join(" | "));
}
// the check itself catches each way of mixing two sets
const base = (await E.oneEngineAnswer({ make: "Acme", model: "Dense", trim: "", year: 1990, bodyStyle: "coupe" }, null, "1990 Acme Dense Coupe", env, null));
const d0 = base.raw;
ok("sanity: the Dense answer is a result with a range and cards", d0.tier === "result" && Array.isArray(d0.cluster) && d0.cards.length >= 3);
const caught = (name, mut) => { const d = mut(JSON.parse(JSON.stringify({ ...d0, rawPool: d0.rawPool, dedup: undefined, htMeta: undefined }))); ok(`caught: ${name}`, E.setConsistencyOf(d, base).length > 0); };
caught("a count that is not the pool", d => { d.poolN = d.rawPool.length + 3; return d; });
caught("a card that is not a sale of the pool", d => { d.cards[0].id = "ffffffff-ffff-4fff-8fff-ffffffffffff"; return d; });
caught("a strip sale that is not a sale of the pool", d => { d.strip = { sales: [{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }] }; return d; });
caught("an unlabelled card outside the printed range", d => { d.cluster = [d.cluster[0] + 1500, d.cluster[0] + 1600]; d.cards = d.rawPool.map(r => ({ id: r.id, price: r._usd })); d.representative = { aboveRangeSales: [], belowRangeSales: [] }; return d; });
caught("a range wider than its pool", d => { d.cluster = [1000, 900000]; return d; });
caught("a pool and a set aside that do not add up", d => { d.qualifyingTotal = d.rawPool.length + 40; d.setAsideRows = d.setAsideRows || []; return d; });
caught("a lowest sale that is not the pool's", d => { d.lowestSaleN = 1; return d; });
console.log(failed ? `sameSetCheck: ${failed} FAIL` : "sameSetCheck: all PASS");
process.exit(failed ? 1 : 0);
