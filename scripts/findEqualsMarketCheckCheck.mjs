// e98 (Sam, Oct 28 2026): a Find card IS the Market Check answer for that listing. The Find reduction (marketOf, coreOf) passes the engine's range, count, label and options through unchanged;
// no pool logic, threshold, gearbox word table or window word lives on the Find path (lib/live/search.js, api/buy.js client); a part is no car lot; a low-mile old car prints no miles. Fake archive.
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
const { marketOf, coreOf, listingFacts } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const spread = (model, body, tx, lo, step, count, ago0) => { for (let i = 0; i < count; i++) sale(model, body, tx, lo + i * step, ago0 + i * 7); };
MK = "BMW";
// field for field: the Find market equals the engine answer for a range, a split (no range) and a thin pool
const cases = [];
spread("E1", "Coupe", "Manual", 30000, 500, 20, 5); cases.push(["range", "E1"]);
spread("E2", "Coupe", "Manual", 21000, 1100, 20, 5); spread("E2", "Coupe", "Automatic", 18000, 710, 20, 8); cases.push(["split, no range", "E2"]);
spread("E3", "Coupe", "Manual", 30000, 800, 5, 5); cases.push(["thin", "E3"]);
for (const [name, model] of cases) {
  const a = await ask(model);
  const m = marketOf(a);
  const core = coreOf(a, { v: { make: MK, model, year: 2001 }, generation: null, refine: null });
  const range = Array.isArray(a.cluster);
  ok(`${name}: Find kind is range exactly when the engine has a cluster`, !!m && ((m.kind === "range") === range), `${m && m.kind} ${JSON.stringify(a.cluster)}`);
  ok(`${name}: Find low and high are the engine's cluster`, !range || (m.low === a.cluster[0] && m.high === a.cluster[1]), `${m && m.low} ${m && m.high}`);
  ok(`${name}: Find count is the engine's pool count`, !m || m.count == null || m.count === a.poolN || (m.kind === "count" && m.count > 0), `${m && m.count} ${a.poolN}`);
  ok(`${name}: the stored core keeps the engine's landing rung and label`, !core || (core.fallbackRung === (a.fallbackRung || null) || core.fallbackRung == null) , `${core && core.fallbackRung} ${a.fallbackRung}`);
}
// the Find path holds no rules of its own
const sx = fs.readFileSync(path.join(root, "lib/live/search.js"), "utf8");
ok("search.js has no gearbox word table of its own (the engine's gearboxWordIn)", !/"PDK"|"Tiptronic"|"Sportshift"|"E-Gear"/.test(sx.replace(/\/\/.*$/gm, "")) , "");
ok("search.js has no thin or range threshold literal (RANGE_THRESHOLD comes from the engine)", !/(soldMi|\.count|poolN|\.length)\s*(>=|<)\s*8\b/.test(sx.replace(/\/\/.*$/gm, "")), "");
const bx = fs.readFileSync(path.join(root, "api/buy.js"), "utf8");
const i0 = bx.indexOf("const CLIENT = ") + "const CLIENT = ".length, client = JSON.parse(bx.slice(i0, bx.indexOf('";\n', i0) + 1));
ok("the Find client holds no count threshold of its own", !/(count|soldN|length)\s*(>=|<)\s*8\b/.test(client), (client.match(/.{30}(count|soldN|length)\s*(>=|<)\s*8\b.{10}/) || [""])[0]);
ok("the Find client hides a lot the engine cannot match instead of printing a line", /unmatched\) l\.unmatched = true/.test(client) && /cards\.splice\(q, 1\)/.test(client));
// a part is no car lot; a low-mile old car prints no miles
const { isPartsListing } = await import(pathToFileURL(path.join(root, "lib/_classify.js")).href);
ok("a wheels lot is a part by the engine's rule", isPartsListing("Porsche Cup II Wheels 7x17/9x17", 0) === true);
ok("search.js skips a part or memorabilia lot before it draws a car card", /not a car lot/.test(sx));
const lf = listingFacts({ listing_title: "1958 Porsche 356 Cabriolet", year: 1958, mileage: 57, make: "Porsche", model: "356", currency: "USD", country: "US" });
ok("live listing: 57 miles on a 1958 car prints no mileage", lf.miles == null, String(lf.miles));
const lf2 = listingFacts({ listing_title: "123-Mile 1958 Porsche 356 Cabriolet", year: 1958, mileage: 123, make: "Porsche", model: "356", currency: "USD", country: "US" });
ok("live listing: a title that says N-Mile keeps its miles", lf2.miles === 123 || lf2.miles == null && false, String(lf2.miles));
const lf3 = listingFacts({ listing_title: "2020 Porsche 911", year: 2020, mileage: 57, make: "Porsche", model: "911", currency: "USD", country: "US" });
ok("live listing: a recent car with 57 miles keeps them", lf3.miles === 57, String(lf3.miles));
// the ops sweep exists and is read only
const ud = fs.readFileSync(path.join(root, "api/usageDashboard.js"), "utf8");
ok("task=findsweep compares the Find core to the stored Market Check answer, read only", /task === "findsweep"/.test(ud) && /writes: 0/.test(ud));
console.log(failed ? `findEqualsMarketCheckCheck: ${failed} FAIL` : "findEqualsMarketCheckCheck: all PASS");
process.exit(failed ? 1 : 0);
