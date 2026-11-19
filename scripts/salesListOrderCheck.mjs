// SALES LIST ORDER ON EVERY TIER (lane-b-rick2, Nov 5 2026, extends salesOrderCheck). Live: the thin tier's list (1949 Rolls-Royce Silver Wraith, 1967 Alfa Romeo Giulia GTA) was in descending price order while result lists were newest first.
// CAUSE: lane-b-rick sorted cards, asideCards, taggedCards and thin_sales.sales, but the thin tier prints htMeta.receipts and htMeta.cards, which the engine built in price order (and by the order the pool came in), and the strip's sales and the set-aside rows were not sorted.
// THE CLASS: any dated list of sales in an answer. This check runs the engine on a thin, a result, an apart (pre-war) and a set-aside fixture, walks the WHOLE answer for every array of dated sale objects and asserts each is newest first,
// except the two lists that are ordered on purpose: recent3 (oldest first, crossProductCheck depends on it) and the nearest-in-miles lists. A new list added to the answer is caught by the walk without anyone listing it here.
//   node scripts/salesListOrderCheck.mjs [repo root]   (pointing it at a tree without the fix shows it fail)
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago), so the verdict does not change with the day
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const HOUSES = [["RM Sotheby's", "rmsothebys"], ["Gooding & Co", "gooding"], ["Bonhams", "bonhams"], ["Mecum", "mecum"]];
const sale = (year, body, price, ago, model = "Roadrunner", house = false) => { n++; const h = house ? HOUSES[n % HOUSES.length] : ["Bring a Trailer", "bringatrailer"], title = `${year} Testmake ${model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: h[0], source_slug: h[1], make: "Testmake", model, year,
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

const read = async (year, model) => { const veh = { year, make: "Testmake", model }, q = `${year} Testmake ${model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };
const ON_PURPOSE = /(^|\.)(recent3|nearPool|mileageNear)(\.|\[|$)/;
const lists = (o, p, seen, out) => { if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o); if (Array.isArray(o)) { if (o.length > 1 && o.every(x => x && typeof x === "object" && !Array.isArray(x) && ("date" in x || "sale_date" in x))) out.push([p, o.map(x => Date.parse(String(x.date || x.sale_date).slice(0, 10)))]); o.slice(0, 80).forEach(x => lists(x, p + "[]", seen, out)); return; } for (const [k, v] of Object.entries(o)) lists(v, p ? p + "." + k : k, seen, out); };
const run = async (label, build, y, m, wantLists) => { rows = []; n = 0; build(); const d = await read(y, m); const out = []; lists(d, "", new Set(), out);
  const bad = out.filter(([p, t]) => !ON_PURPOSE.test(p) && t.some((x, i) => i && Number.isFinite(x) && Number.isFinite(t[i - 1]) && x > t[i - 1])).map(([p]) => p);
  ok(`${label} (${d.tier}${d.optionsState ? ", " + d.optionsState : ""}): ${out.length} dated lists, every one newest first except the two ordered on purpose`, out.length >= wantLists && !bad.length, JSON.stringify({ lists: out.map(x => x[0]), notNewestFirst: bad })); return d; };
await run("thin (2 online, 4 house, 1949)", () => { for (let i = 0; i < 2; i++) sale(1949, "Sedan", 40000 + i * 7000, 200 + i * 90, "Thinny", false); for (let i = 0; i < 4; i++) sale(1949, "Sedan", 60000 + ((i * 37) % 5) * 9000, 30 + i * 140, "Thinny", true); }, 1949, "Thinny", 3);
await run("thin (3 sales, all house)", () => { for (let i = 0; i < 3; i++) sale(1967, "Coupe", 90000 + ((i * 53) % 4) * 15000, 30 + i * 120, "Thin3", true); }, 1967, "Thin3", 2);
await run("result", () => { for (let i = 0; i < 12; i++) sale(2005, "Coupe", 30000 + ((i * 7) % 12) * 400, 20 + i * 13, "Res1", false); }, 2005, "Res1", 2);
await run("apart (pre-war bodies)", () => { for (const [b, base] of [["Roadster", 50000], ["Sedan", 52000]]) for (let i = 0; i < 9; i++) sale(1935, b, base + ((i * 5) % 9) * 500, 20 + i * 14 + (b === "Sedan" ? 3 : 0), "Apart1", false); }, 1935, "Apart1", 2);
await run("result with a restomod and a replica set aside", () => { for (let i = 0; i < 12; i++) sale(2005, "Coupe", 30000 + ((i * 7) % 12) * 400, 20 + i * 13, "Aside1", false); sale(2005, "Coupe Restomod", 90000, 50, "Aside1", false); sale(2005, "Coupe Replica", 8000, 90, "Aside1", false); }, 2005, "Aside1", 2);
console.log(failed ? `\n${failed} FAILED` : "\nsalesListOrderCheck: all pass"); process.exit(failed ? 1 : 0);
