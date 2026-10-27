// e94: one car, one answer. A Porsche 911 chassis code typed as the model ("2002 Porsche 996 Turbo Coupe") and the nameplate with
// the generation (what a VIN decodes to: model 911, generation 996) run the SAME fences, so the range, the count and the
// set-aside agree. 986, 987, 981, 982 and 718 are Boxster and Cayman and never map to 911. No database: a fake archive.
//   node scripts/chassisCodeCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const MR = await import(pathToFileURL(path.join(root, "lib/modelRules.js")).href);
const G = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const { oneEngineAnswer } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0;
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (title, price, ago, model) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "cc" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Porsche", model, year: 2002,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 900), body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
for (let i = 0; i < 15; i++) sale(`${20 + i}k-Mile 2002 Porsche 911 Turbo Coupe 6-Speed`, 80000 + i * 1400, 10 + i * 18, i % 3 === 0 ? "996" : "911");
sale("7k-Mile 2002 Porsche 911 Turbo Coupe X50 6-Speed", 191996, 12, "911");
sale("Augie Pabst Jr.'s 2002 Porsche 911 Turbo Coupe X50", 175000, 150, "996");
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const or = sp.get("or"); const md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!ti || ti.test(r.listing_title)) && (!md || md.test(r.model)) && (!or || /911|996/.test(r.model)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const ask = async (model, text) => { const v = { make: "Porsche", model, trim: "Turbo", year: 2002, bodyStyle: "coupe" }; const g = await G.findGeneration(v, env).catch(() => null); return (await oneEngineAnswer(v, g, text, env, null)).raw; };
// the lookup itself
ok("rulesFor: 996 gives the 911 rules", MR.rulesFor("Porsche", "996") && MR.rulesFor("Porsche", "996") === MR.rulesFor("Porsche", "911"));
for (const c of ["930", "964", "993", "997", "991", "992"]) ok(`rulesFor: ${c} gives the 911 rules`, MR.rulesFor("Porsche", c) === MR.rulesFor("Porsche", "911"));
for (const c of ["986", "987", "981", "982", "718"]) ok(`rulesFor: ${c} never maps to the 911 rules`, MR.rulesFor("Porsche", c) !== MR.rulesFor("Porsche", "911"));
ok("rulesFor: another make's 996 is not the 911", MR.rulesFor("Ford", "996") !== MR.rulesFor("Porsche", "911"));
// the same car by both spellings
const typed = await ask("996", "2002 Porsche 996 Turbo Coupe");
const vin = await ask("911", "WP0AB29992S686719");
const sum = d => ({ tier: d.tier, n: d.qualifyingTotal, pool: (d.rawPool || []).length, cluster: d.cluster && d.cluster.join("-"), aside: d.setAsideCount ?? (d.setAsideRows || []).length, reasons: JSON.stringify(d.setAsideReasons || null) });
const a = sum(typed), b = sum(vin);
ok("typed 996 and the VIN's 911 return the same tier, count, range and set-aside", JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + " vs " + JSON.stringify(b));
ok("both read a result with the 15 ordinary sales or more", typed.tier === "result" && vin.tier === "result", typed.tier + " / " + vin.tier);
ok("the two X50 sales are treated alike on both spellings", (typed.setAsideRows || []).length === (vin.setAsideRows || []).length);
ok("the stamp is e95", /^e95-/.test(E.ENGINE_VERSION), E.ENGINE_VERSION);
console.log(`chassisCodeCheck: ${failed ? failed + " FAIL" : "all PASS"}`);
process.exit(failed ? 1 : 0);
