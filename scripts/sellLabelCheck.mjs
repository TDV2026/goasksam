// clock: real-ok the fake archive's sale dates are built from the real now, so every row is inside the window whenever this runs
// SELL PRINTS THE ENGINE'S LABEL AS GIVEN (Lane B, Nov 5 2026, nightly run #132, the cross-product step). The "1967 Shelby Cobra Roadster" read "Corvette, 1965 to 1967 sales; no Grand Sport on record separately" on Market Check, Buy and Tasks and "Cobra, 1965 to 1967" on Sell.
// CAUSE: oneEngineAnswer adds the trim-dropped suffix ("sales; no {trim} on record separately", lib/onebox.js) AFTER the ladder. Sell's page reads oneEngineAnswer (fetchOnlinePool), but fetchOnlinePool passed no rung, label, sibling or counts through, so the cross-product check's Sell lane took its label from
// a SECOND runOneBox call, which never sees the suffix. The page itself printed the engine's label; the check compared a second implementation. OTHER CARS ON THE PATH: every thin or year_widened answer whose typed trim the pool does not carry (the "no X on record separately" label), the "Closest: X" sibling label,
// and any answer whose label oneEngineAnswer rewrites after the ladder. FIX: fetchOnlinePool passes fallbackRung, rungLabel, siblingName and counts through from the answer it already holds; the check's Sell lane reads them there.
// THIS CHECK: (1) fetchOnlinePool returns every label shape as given; (2) on a seeded archive, a car whose trim the pool lacks gets the suffix from oneEngineAnswer, and fetchOnlinePool (with or without the answer handed in) returns that exact label; (3) the cross-product Sell lane reads the label from the pool read and from no other call; (4) the cross-product Sell lane reads the label from the pool read and from no other call.   node scripts/sellLabelCheck.mjs [repo root]
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), P = await import(pathToFileURL(path.join(root, "lib/platformPick.js")).href);
const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
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

const cobra = (year, price, ago) => { n++; const title = `${year} Chevrolet Corvette Coupe`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "sc" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make: "Chevrolet", model: "Corvette", model_family: "Corvette", listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(9000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: "Manual (4-speed)", exterior_color: null, source_url: "https://x/c" + n } }); };
for (let i = 0; i < 5; i++) cobra(1965, 900000 + i * 20000, 30 + i * 60);
for (let i = 0; i < 4; i++) cobra(1966, 950000 + i * 20000, 50 + i * 70);

// (1) every label shape passes through fetchOnlinePool as given
const veh = { year: 1967, make: "Chevrolet", model: "Corvette", trim: "Grand Sport" };
const shapes = [["trim dropped", "year_widened", "Corvette, 1965 to 1967 sales; no Grand Sport on record separately", null], ["sibling", "sibling", "Closest: Cobra 289, 1960s", "Cobra 289"], ["all years", "model_any_year", "Cobra, all years", null], ["generation", "generation", "911 GT3 (992 generation)", null], ["exact", "exact", "1967 Cobra", null]];
for (const [name, rung, label, sib] of shapes) {
  const answer = { tier: "thin", fallbackRung: rung, rungLabel: label, siblingName: sib, counts: { a: 1 }, resolvedCar: { make: "Chevrolet", model: "Corvette", trim: "Grand Sport" }, rawPool: [{ source: "bringatrailer", _usd: 1, year: 1966, auction_end_date: "2026-01-01" }] };
  const r = await P.fetchOnlinePool(veh, null, {}, answer);
  ok(`(1) ${name}: fetchOnlinePool returns the engine's rung, label, sibling and counts as given`, r.fallbackRung === rung && r.rungLabel === label && r.siblingName === sib && r.counts && r.counts.a === 1, JSON.stringify([r.fallbackRung, r.rungLabel]));
}
// (2) + (3) a seeded archive
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const q = "1967 Chevrolet Corvette Grand Sport", rv = await resolveVehicle(q, {}), v = rv.vehicle, gen = await findGeneration(v, env).catch(() => null);
const raw = (await E.oneEngineAnswer(v, gen, q, { ...env, asked: 2 }, null)).raw;
ok("(2) the scenario is real: the engine answered, widened the years, and its label says the trim is not on record separately", raw && /^(thin|result)$/.test(String(raw.tier)) && /no Grand Sport on record separately/.test(String(raw.rungLabel)), JSON.stringify([raw && raw.tier, raw && raw.fallbackRung, raw && raw.rungLabel]));
const fromAnswer = await P.fetchOnlinePool(v, gen, env, raw), fromScratch = await P.fetchOnlinePool(v, gen, env);
ok("(2) fetchOnlinePool handed the answer returns that exact label", fromAnswer.rungLabel === raw.rungLabel && fromAnswer.fallbackRung === raw.fallbackRung, fromAnswer.rungLabel);
ok("(2) fetchOnlinePool asking the engine itself returns that exact label", fromScratch.rungLabel === raw.rungLabel && fromScratch.fallbackRung === raw.fallbackRung, fromScratch.rungLabel);
const sa = await P.buildSharedAnalysis(v, gen, env, { raw: q, region: "US", state: "California", timeline: "No rush" }, raw);
ok("(2) buildSharedAnalysis takes the answer it is handed (no second read)", !!sa && Array.isArray(sa.platformPerformance) && sa.platformPerformance.length > 0, JSON.stringify(sa && Object.keys(sa).slice(0, 8)));
// (4) the cross-product Sell lane reads the label from the pool read
{ const src = fs.readFileSync("scripts/crossProductCheck.js", "utf8"), i = src.indexOf("async function sellLane"), j = src.indexOf("// ---- comparison ----");
  const lane = src.slice(i, j);
  ok("(4) the Sell lane takes fallbackRung, rungLabel and siblingName from fetchOnlinePool", /rungLabel: engRungLabel/.test(lane) && /rungLabel: engRungLabel \|\| null/.test(lane) && !/askingResult\.rungLabel|askingResult\.fallbackRung|askingResult\.siblingName/.test(lane));
  const uses = [...lane.matchAll(/askingResult(?:\s*&&\s*askingResult)?\.(\w+)/g)].map(m => m[1]).filter((x, k, a) => a.indexOf(x) === k).sort();
  ok("(4) the second runOneBox call feeds only the asking-line band and the counts fallback", uses.every(x => ["cluster", "counts"].includes(x)), uses.join(","));
}
console.log(failed ? `\nsellLabelCheck: ${failed} FAILED` : "\nsellLabelCheck: all passed");
process.exit(failed ? 1 : 0);
