// Pre-war body style check (Lane B, Nov 4 2026, job lane-b-rick point 3, Rick Carey's launch-day feedback). THE CLASS: before 1949 a body style is a different car (a roadster, a phaeton and a sedan of one
// marque and year price and are collected apart), but the engine made body an apart dimension only when the medians happened to split, so a pre-war answer pooled them into one range. Now: for any car
// before 1949 two or more bodies each holding sales are an APART answer by default, each body with its own range, through the same options/popup as mileage bands; a post-war car is unchanged.
// Must hold on a fixture where the bodies' prices are close (so the old split rule could not fire):
//  (1) 1935: optionsState apart, headlineDimension body, one option per body, each with its own range and count, and no pooled headline;
//  (2) the same sales dated 1965: not apart (the rule is pre-war only);
//  (3) 1948 is pre-war and 1949 is not (the boundary).
//   node scripts/prewarBodyApartCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (year, body, price, ago) => { n++; const title = `${year} Testmake Roadrunner ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Testmake", model: "Roadrunner", year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const build = year => { rows = []; for (const [body, base] of [["Roadster", 50000], ["Phaeton", 50150], ["Sedan", 49900]]) for (let i = 0; i < 9; i++) sale(year, body, base + (i % 5) * 700, 20 + i * 14 + (body === "Sedan" ? 3 : body === "Phaeton" ? 6 : 0)); };
const read = async year => { build(year); const veh = { year, make: "Testmake", model: "Roadrunner" }, q = `${year} Testmake Roadrunner`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };   // as served: the pre-war keys are the engine's, a reader sees the plain word
{ const d = await read(1935), o = d.options || [];
  ok("1935: the answer is apart, by body", d.optionsState === "apart" && d.headlineDimension === "body", JSON.stringify({ state: d.optionsState, dim: d.headlineDimension, tier: d.tier }));
  ok("... one option per body, each with its own sales", o.length === 3 && ["Roadster", "Phaeton", "Sedan"].every(b => o.some(x => x.label === b && x.n === 9)), JSON.stringify(o.map(x => x.label + " " + x.n)));
  ok("... each body has its own range (not the pooled one)", o.length === 3 && o.every(x => x.low > 0 && x.high >= x.low && x.rangeFloor === false), JSON.stringify(o.map(x => [x.label, x.low, x.high])));
  ok("... no engine key (pw_) reaches a label, line or chip a reader sees", !/pw_/i.test(JSON.stringify([o.map(x => x.label), d.optionLines, d.chipLines, d.pickLines, d.headlineLines, (d.refineOptions || []).map(x => x.label)])), JSON.stringify(d.optionLines));
  ok("... the popup is the same option set as mileage bands (the options carry a refine that takes a body)", o.length === 3 && o.every(x => x.refine && x.refine.body), JSON.stringify(o.map(x => x.refine))); }
{ const d = await read(1965);
  ok("1965, the same sales: not apart (post-war cars are unchanged)", d.optionsState !== "apart", String(d.optionsState)); }
{ const a = await read(1948), b = await read(1949);
  ok("1948 is pre-war (apart) and 1949 is not", a.optionsState === "apart" && b.optionsState !== "apart", `1948 ${a.optionsState}, 1949 ${b.optionsState}`); }
console.log(failed ? `\n${failed} FAILED` : "\nprewarBodyApartCheck: all pass"); process.exit(failed ? 1 : 0);
