// EVERY SALES ANSWER LEAVES THE ENGINE WITH A RECOGNIZED RUNG AND A LABEL (Lane B, Oct 29 2026). LIVE: the Find pre-fill of the 1966 Corvette Convertible (pool 34) was refused by the store guard with
// "fallback_rung_not_recognized:undefined": a result with sales and no rung is never stored, so the card reads cold on every open. The rung is named in one place in the ladder; an answer rebuilt after it by a wrapper lost it.
// FIX: ensureRung at the end of oneEngineAnswer gives any result, thin or refusal the rung its pool shows and a label from the car (logged rung_missing_derived to find the path). This check: (1) the function on every shape of lost rung;
// (2) a battery of real engine paths on a seeded archive (asked 0, 1, 2; body, gearbox, trim, year, miles refines; thin pools; widened years) - every sales answer has a recognized rung and a label and passes the store guard; (3) the engine and the guard use one rung list.
//   node scripts/rungAlwaysCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href), R = await import(pathToFileURL(path.join(root, "lib/live/rung.js")).href);
import fs from "node:fs";
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
MK = "Chevrolet";
const mk2 = (title, price, ago, body, year = 1966, model = "Corvette") => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pc" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make: "Chevrolet", model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 900), body_style: body, modifications: null, title, currency: "USD", transmission: n % 3 ? "Manual (4-speed)" : "Automatic", exterior_color: null, source_url: "https://x/" + n } }); };
const mix = [["1966 Chevrolet Corvette Sting Ray 427/425 Convertible", 150000, "Convertible"], ["1966 Chevrolet Corvette 427/390 Coupe", 120000, "Coupe"], ["1966 Chevrolet Corvette 327/350 Convertible", 70000, "Convertible"], ["1966 Chevrolet Corvette 327/300 Coupe", 62000, "Coupe"], ["1966 Chevrolet Corvette Convertible", 90000, "Convertible"]];
for (let i = 0; i < 40; i++) { const [t, p, b] = mix[i % mix.length]; mk2(t, p + (i % 7) * 1500, 8 + i * 14, b); }
for (let i = 0; i < 6; i++) mk2("1964 Chevrolet Corvette Sting Ray Coupe", 80000 + i * 2000, 20 + i * 40, "Coupe", 1964);
for (let i = 0; i < 4; i++) mk2("1971 Chevrolet Corvette Coupe", 40000 + i * 2000, 25 + i * 50, "Coupe", 1971);
let bad = 0, total = 0;
const seen = [];
for (const [q, refines] of [["1966 Chevrolet Corvette Convertible", [null, { tx: "manual" }, { body: "coupe" }, { miTarget: 40000 }]], ["1966 Chevrolet Corvette", [null, { trim: "427" }, { year: 1966 }]], ["1964 Chevrolet Corvette", [null]], ["1971 Chevrolet Corvette", [null]], ["1969 Chevrolet Corvette", [null]]]) {
  const rv = await resolveVehicle(q, {}), v = rv.vehicle, gen = await findGeneration(v, env).catch(() => null);
  for (const asked of [0, 1, 2]) for (const refine of refines) {
    const d = (await E.oneEngineAnswer(v, gen, q, { ...env, asked }, refine)).raw; if (!d || !/^(result|thin|refusal)$/.test(String(d.tier || ""))) continue;
    total++; const good = R.RUNGS.has(d.fallbackRung) && typeof d.rungLabel === "string" && d.rungLabel.trim().length > 0; if (!good) bad++;
    seen.push(`${q} asked ${asked} ${JSON.stringify(refine)} -> ${d.tier} ${d.fallbackRung}`);
    if (!good) console.log("   lost:", q, asked, JSON.stringify(refine), d.tier, d.fallbackRung, d.rungLabel);
  }
}
ok(`${total} real engine answers (result, thin, refusal) across asked 0, 1, 2 and five refines all carry a recognized rung and a label`, total >= 15 && bad === 0, `${bad} without`);
// 1. the function on every shape of lost rung
const rowsOf = (...ys) => ys.map((y, i) => ({ id: "r" + i, year: y }));
const car = { year: 1966, make: "Chevrolet", model: "Corvette", nameModel: "Corvette" };
const a1 = E.ensureRung({ tier: "result", resolvedCar: car, rawPool: rowsOf(1966, 1966, 1966) }, car), a2 = E.ensureRung({ tier: "result", resolvedCar: car, rawPool: rowsOf(1965, 1966, 1967) }, car), a3 = E.ensureRung({ tier: "thin", resolvedCar: car, ladderStep: "family", rawPool: [] }, car), a4 = E.ensureRung({ tier: "refusal", resolvedCar: car }, car);
ok("a result of the asked year only: exact, labelled from the car", a1.fallbackRung === "exact" && a1.rungLabel === "1966 Corvette", JSON.stringify([a1.fallbackRung, a1.rungLabel]));
ok("a result spanning other years: year_widened, labelled with the years it holds", a2.fallbackRung === "year_widened" && a2.rungLabel === "Corvette models, 1965 to 1967", JSON.stringify([a2.fallbackRung, a2.rungLabel]));
ok("a family step: model_any_year", a3.fallbackRung === "model_any_year" && /all years/.test(a3.rungLabel), JSON.stringify([a3.fallbackRung, a3.rungLabel]));
ok("a refusal with no rung is given one too", R.RUNGS.has(a4.fallbackRung) && !!a4.rungLabel);
const keep = { tier: "result", fallbackRung: "generation", rungLabel: "Corvette (C2 generation)", resolvedCar: car, rawPool: rowsOf(1963) };
ok("an answer that already has a recognized rung and label is returned as it is", E.ensureRung(keep, car) === keep);
ok("other tiers (a question, not_tracked) are untouched", (() => { const q = { tier: "trim_choice" }, nt = { tier: "not_tracked" }; return E.ensureRung(q, car) === q && E.ensureRung(nt, car) === nt; })());
// store guard accepts the derived answer
{ const d = E.ensureRung({ tier: "result", poolN: 3, resolvedCar: car, rawPool: rowsOf(1966, 1966, 1966), cards: [{}, {}, {}], cluster: null }, car); ok("the store guard accepts an answer that lost its rung once the engine has given it one", S.answerCacheable(d) === true, String(S.storeGuardRejectReason(d))); 
  const lost = { tier: "result", poolN: 3, resolvedCar: car, rawPool: rowsOf(1966, 1966, 1966), cards: [{}, {}, {}], cluster: null }; ok("and refuses the same answer without one (the live symptom)", S.answerCacheable(lost) === false && /fallback_rung_not_recognized/.test(String(S.storeGuardRejectReason(lost)))); }
// 3. one list, and the engine calls it
{ const src = fs.readFileSync("lib/onebox.js", "utf8"); ok("oneEngineAnswer calls ensureRung before the output gate", /d = ensureRung\(d, vehicle\);\s*d = applyOutputGate/.test(src));
  const m = /const ENGINE_RUNGS = new Set\(\[([^\]]+)\]\)/.exec(src), mine = m ? m[1].split(",").map(x => x.trim().replace(/"/g, "")).sort().join(",") : ""; ok("the engine's rung list is the store guard's list", mine === [...R.RUNGS].sort().join(","), mine); }
console.log(failed ? `rungAlwaysCheck: ${failed} failure(s)` : "rungAlwaysCheck: all pass");
process.exit(failed ? 1 : 0);
