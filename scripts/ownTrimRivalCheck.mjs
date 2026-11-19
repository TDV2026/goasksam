// e98: a trim the asked car carries is never its rival, even when the make's model list holds that name as a model (Buick "Grand National").
//   node scripts/ownTrimRivalCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const list = [["Regal", [[1973, 2004]]], ["Grand National", [[1982, 1987]]], ["Century", [[1973, 2005]]], ["Riviera", [[1963, 1999]]]].map(([name, year_ranges]) => ({ name, year_ranges }));
E.setMakeModels("Buick", list);
const norm = x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const L = list.map(m => ({ name: m.name, norm: norm(m.name), ranges: m.year_ranges }));
// the unit: the model name is the asked car's trim
ok("a title naming the asked car's own trim is not a rival", E.rivalFromModels("Buick", "Regal", "1987 Buick Grand National", 1987, L, ["Grand National"]) === null);
ok("the same title is a rival of a Century query (the rule still works)", E.rivalFromModels("Buick", "Century", "1987 Buick Grand National", 1987, L, [null]) === "Grand National" || E.rivalFromModels("Buick", "Century", "1987 Buick Grand National", 1987, L) === "Grand National");
// the class, through the engine: ten sales titled by the trim alone, filed under the model
let rows = [], n = 0;
const sale = (year, date, price) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "g" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Buick", model: "Regal", year, listing_title: `${year} Buick Grand National`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "40000", body_style: null, modifications: null, title: `${year} Buick Grand National`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
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
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
for (let i = 0; i < 12; i++) sale(1987, day(40 + i * 15), 38000 + i * 1200);
const a = await E.oneEngineAnswer({ make: "Buick", model: "Regal", trim: "Grand National", year: 1987, bodyStyle: null }, null, "1987 Buick Regal Grand National", env, null);
ok("12 sales titled by the trim alone read as a result on the exact rung", a.raw.tier === "result" && a.raw.fallbackRung === "exact" && a.raw.poolN === 12, `${a.raw.tier} ${a.raw.fallbackRung} ${a.raw.poolN}`);
ok("the range is there", Array.isArray(a.raw.cluster) && a.raw.cluster[0] > 0);
process.exit(failed ? 1 : 0);
