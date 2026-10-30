// EVERY COLD COMPUTE LOGS ITS STAGES (Lane B, Oct 30 2026, the first-ask deadline: 13 to 17 s cold against the 20 s page deadline, the engine about 4.6 s). oneEngineAnswer times the engine, the trim chips, the question rule, the sell fields and the exact-year line,
// sellerDecision times the store; one stage_ms line per cold compute names where the time goes. Fails without the timer (no line is logged).
//   node scripts/stageTimerCheck.mjs [repo root]
import fs from "node:fs";
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
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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

import { resolveVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };

MK = "Ford"; rows = [];
for (let i = 0; i < 14; i++) mkS("Ford", "Mustang", "2020 Ford Mustang GT", 30000 + (i % 7) * 800, 8 + i * 9, 2020);
const logs = []; const orig = console.log; console.log = (...a) => { const s = a.join(" "); if (s.startsWith('{"tag":"stage_ms"')) logs.push(JSON.parse(s)); else orig(...a); };
const q = "2020 Ford Mustang GT", rv = await resolveVehicle(q, {}), v = rv.vehicle || {}, gen = await findGeneration(v, env).catch(() => null);
await E.oneEngineAnswer(v, gen, q, { ...env, asked: 0 }, null);
console.log = orig;
const L = logs[0];
ok("a cold compute logs one stage_ms line", logs.length === 1 && !!L, String(logs.length));
ok("the line names the engine, trim chips, question rule and sell fields stages, each a number of milliseconds", !!L && ["engine", "trim_chips", "question_rule", "sell_fields"].every(k => typeof L.stages[k] === "number" && L.stages[k] >= 0), JSON.stringify(L && L.stages));
ok("the line carries the car, the tier and the total", !!L && /Mustang/.test(L.car) && !!L.tier && typeof L.total === "number", JSON.stringify(L && [L.car, L.tier, L.total]));
const sd = fs.readFileSync("api/sellerDecision.js", "utf8");
ok("the store is timed in sellerDecision (stage store)", /tag: "stage_ms", stage: "store"/.test(sd));
console.log(failed ? `stageTimerCheck: ${failed} failure(s)` : "stageTimerCheck: all pass");
process.exit(failed ? 1 : 0);
