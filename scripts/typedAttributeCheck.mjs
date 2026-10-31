// TYPED GEARBOX, ENGINE AND BODY WORDS ARE APPLIED OR ANNOUNCED, NEVER DROPPED; THE CLASSIC BODIES ARE SEPARATE POOLS; SALES CAN BE READ BY DATE (Lane B, Oct 30 2026, two readers on launch day).
// THE THREE LIVE CASES: "2005-6 Pontiac GTO 6-speed" returned manual and automatic together; "W123 Mercedes with a V8" returned a four-cylinder 230TE; "1932 Ford V-8 Roadster" pooled a 1933 Phaeton and a street rod, and
// "1930 Packard 745 Deluxe Eight Roadster" returned Phaetons as in range and a 1929 626 Speedster as the top sale.
// CAUSES: (1) no code read an N-speed, engine or swap word in the typed text (only manual, stick and automatic were read), so the answer silently widened; (2) the body table put Phaeton and Tourer under Convertible and Speedster under Roadster,
// and every open body shared one family, so a typed Roadster pooled them; (3) a street rod or rat rod is a modified car that no fence set aside.
// FIX: lib/typedAttributes.js (one table: how a word is typed, how a sale states it); runOneBox applies it as refine.attrs (the sales that state it) or announces it (typedAttributes, typedAttributeLines: "Sales do not say their engine, so Sam could
// not filter by V8."), one chip each in appliedFilters with the refine that takes it off (attrsOff); lib/bodyWords.js has Convertible Sedan, Town Car, Victoria, Phaeton, Speedster as bodies of their own, and before 1949 a Roadster, Cabriolet and
// Convertible are three pools (pw_ keys, never shown); street rods and rat rods are set aside; salesOrder sends every sales list both ways (price as sent, date newest first) as positions, so a page toggles and computes nothing.
// CLASS: every gearbox, engine and body word the reader can type, on any car; the check fails if a typed word is neither applied nor announced, and fails on each of the three cases without the fix.
//   node scripts/typedAttributeCheck.mjs [repo root]
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

import { findGeneration } from "../lib/generations.js";
const mkS = (make, model, title, price, ago, year, tx) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };


const run = async (q, veh, build) => { rows = []; build(); const gen = await findGeneration(veh, env).catch(() => null); return (await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw; };
const T = await import(pathToFileURL(path.join(root, "lib/typedAttributes.js")).href).catch(() => null);
const GTO = { year: 2005, make: "Pontiac", model: "GTO" };
const gtoSales = () => { for (let i = 0; i < 10; i++) mkS("Pontiac", "GTO", "2005 Pontiac GTO 6-Speed", 24000 + i * 500, 20 + i * 12, 2005, "Manual (6-speed)"); for (let i = 0; i < 10; i++) mkS("Pontiac", "GTO", "2005 Pontiac GTO", 15000 + i * 400, 25 + i * 12, 2005, "Automatic (4-speed)"); };
// 1. the GTO: "6-speed" is applied, the pool is the 6-speed cars, a chip names it and the chip's refine takes it off
{ const d = await run("2005 Pontiac GTO 6-speed", GTO, gtoSales); const ta = (d.typedAttributes || [])[0];
  ok("GTO 6-speed: the typed word is applied (a chip, the sales that say it)", !!ta && ta.key === "speed6" && ta.status === "applied" && ta.matched === 10 && (d.appliedFilters || []).some(f => f.kind === "gearbox" && f.words === "6-speed"), JSON.stringify(d.typedAttributes));
  ok("GTO 6-speed: the pool is the 6-speed cars only (no automatic among the sales)", Number(d.poolN) === 10 && (d.rawPool || []).every(r => /6-speed/i.test(r.rtitle)), String(d.poolN));
  const clear = ((d.appliedFilters || []).find(f => f.kind === "gearbox") || {}).clear, d2 = clear ? (await E.oneEngineAnswer({ ...GTO, raw: "2005 Pontiac GTO 6-speed" }, null, "2005 Pontiac GTO 6-speed", { ...env, asked: 0 }, clear)).raw : null;
  ok("GTO 6-speed: the chip's refine takes it off and the typed word is not read again", !!d2 && !(d2.typedAttributes || []).length && Number(d2.poolN) === 20, d2 && String(d2.poolN)); }
// 2. the W123 V8: no sale says V8, so the answer says so in the engine's sentence and keeps the pool
{ const d = await run("W123 Mercedes with a V8", { year: null, make: "Mercedes-Benz", model: "W123" }, () => { for (let i = 0; i < 10; i++) mkS("Mercedes-Benz", "W123", "1983 Mercedes-Benz W123 230TE", 12000 + i * 500, 20 + i * 12, 1983, "Automatic"); });
  ok("W123 V8: announced, with the engine's sentence", (d.typedAttributeLines || []).includes("Sales do not say their engine, so Sam could not filter by V8.") && d.typedAttributes[0].status === "not_carried", JSON.stringify(d.typedAttributeLines)); }
// 3. every gearbox and engine word, on a pool that carries it and a pool that does not: applied or announced, never neither
{ const WORDS = [["3-speed", "3-Speed"], ["4-speed", "4-Speed"], ["5-speed", "5-Speed"], ["six-speed", "6-Speed"], ["V8", "V8"], ["V-8", "V8"], ["V6", "V6"], ["V12", "V12"], ["flat-six", "flat-six"], ["straight-six", "straight-six"], ["inline-6", "inline-6"], ["four-cylinder", "four-cylinder"], ["turbo", "Turbo"], ["supercharged", "Supercharged"]];
  const CAR = { year: 1990, make: "Testmake", model: "Roadrunner" };
  for (const [word, titleWord] of WORDS) {
    const q = `1990 Testmake Roadrunner ${word}`;
    const have = await run(q, CAR, () => { for (let i = 0; i < 6; i++) mkS("Testmake", "Roadrunner", `1990 Testmake Roadrunner ${titleWord}`, 20000 + i * 500, 20 + i * 12, 1990); for (let i = 0; i < 6; i++) mkS("Testmake", "Roadrunner", "1990 Testmake Roadrunner", 15000 + i * 400, 25 + i * 12, 1990); });
    ok(`"${word}": a pool that states it is narrowed to those sales and a chip says so`, (have.typedAttributes || []).length === 1 && have.typedAttributes[0].status === "applied" && Number(have.poolN) === 6 && (have.appliedFilters || []).length === 1, JSON.stringify(have.typedAttributes));
    const none = await run(q, CAR, () => { for (let i = 0; i < 12; i++) mkS("Testmake", "Roadrunner", "1990 Testmake Roadrunner", 15000 + i * 400, 25 + i * 12, 1990); });
    ok(`"${word}": a pool that does not state it keeps its sales and says so in the engine's sentence`, (none.typedAttributes || []).length === 1 && none.typedAttributes[0].status === "not_carried" && Number(none.poolN) === 12 && /^Sales do not say their (engine|gearbox), so Sam could not filter by /.test((none.typedAttributeLines || [])[0] || ""), JSON.stringify(none.typedAttributeLines));
  }
  for (const word of ["LS-swap", "restomod"]) { const d = await run(`1990 Testmake Roadrunner ${word}`, CAR, () => { for (let i = 0; i < 12; i++) mkS("Testmake", "Roadrunner", "1990 Testmake Roadrunner", 15000 + i * 400, 25 + i * 12, 1990); });
    ok(`"${word}": announced (swaps and restomods are in no read)`, (d.typedAttributes || []).length === 1 && d.typedAttributes[0].status === "set_aside" && (d.typedAttributeLines || []).length === 1, JSON.stringify(d.typedAttributeLines)); }
  // a word that is the car's own name is the car, not an attribute
  const own = await run("1990 Testmake Roadrunner Turbo", { ...CAR, trim: "Turbo" }, () => { for (let i = 0; i < 12; i++) mkS("Testmake", "Roadrunner", "1990 Testmake Roadrunner Turbo", 15000 + i * 400, 25 + i * 12, 1990); });
  ok("a word in the car's own name (a Turbo trim) is not read as an attribute", !(own.typedAttributes || []).length); }
// 4. the classic bodies: a typed body returns only that body, for every body, before and after 1949
{ const BODIES = ["Roadster", "Phaeton", "Tourer", "Speedster", "Cabriolet", "Convertible Sedan", "Coupe", "Sedan", "Victoria", "Town Car"];
  const seed = (year) => () => { for (const b of BODIES) for (let i = 0; i < 4; i++) mkS("Testmake", "Eight", `${year} Testmake Eight ${b}`, 40000 + i * 1000 + BODIES.indexOf(b) * 300, 20 + i * 12, year); };
  for (const year of [1930, 1936]) for (const b of BODIES) {
    const d = await run(`${year} Testmake Eight ${b}`, { year, make: "Testmake", model: "Eight", bodyStyle: b === "Tourer" ? "touring" : b.toLowerCase().replace(/ /g, "") }, seed(year));
    const titles = (d.rawPool || d.cards || []).map(r => r.rtitle || r.title || ""), others = BODIES.filter(x => x !== b && !(x === "Sedan" && b === "Convertible Sedan"));
    ok(`${year} ${b}: only ${b} sales, none of the other bodies`, titles.length > 0 && titles.every(t => new RegExp(b + "$", "i").test(t.trim())) , JSON.stringify([...new Set(titles)]).slice(0, 200)); } }
// 5. the street rod and rat rod are set aside
{ const d = await run("1932 Testmake Eight Roadster", { year: 1932, make: "Testmake", model: "Eight", bodyStyle: "roadster" }, () => { for (let i = 0; i < 9; i++) mkS("Testmake", "Eight", "1932 Testmake Eight Roadster", 60000 + i * 1000, 20 + i * 12, 1932); for (let i = 0; i < 3; i++) mkS("Testmake", "Eight", "1932 Testmake Eight Roadster Street Rod", 90000 + i * 1000, 20 + i * 12, 1932); });
  ok("a street rod is set aside from the pool", (d.rawPool || []).length > 0 && !(d.rawPool || []).some(r => /street rod/i.test(r.rtitle)), String((d.rawPool || []).length)); }
// 6. the Ford V-8 and Packard cases
{ const d = await run("1932 Ford V-8 Roadster", { year: 1932, make: "Ford", model: "V8", bodyStyle: "roadster" }, () => {
    for (let i = 0; i < 4; i++) mkS("Ford", "V8", "1932 Ford Model 18 V8 Roadster", 60000 + i * 5000, 30 + i * 20, 1932); for (let i = 0; i < 3; i++) mkS("Ford", "V8", "1933 Ford Model 40 V8 Deluxe Phaeton", 40000 + i * 5000, 35 + i * 20, 1933);
    for (let i = 0; i < 3; i++) mkS("Ford", "V8", "1932 Ford Roadster Street Rod With a Chevy 350 V8", 70000 + i * 5000, 40 + i * 20, 1932); for (let i = 0; i < 3; i++) mkS("Ford", "V8", "1931 Ford Model A Roadster", 30000 + i * 3000, 45 + i * 20, 1931); });
  const titles = (d.rawPool || []).map(r => r.rtitle);
  ok("1932 Ford V-8 Roadster: no Phaeton and no street rod in the pool", titles.length > 0 && !titles.some(t => /phaeton|street rod/i.test(t)), JSON.stringify([...new Set(titles)]));
  ok("... and the V-8 in the name is the car's, not an engine to look for", !(d.typedAttributes || []).length, JSON.stringify(d.typedAttributes));
  ok("... a pool wider than the typed year says so", /1931/.test(String(d.scope_reason || d.rungLabel || "")), String(d.scope_reason || d.rungLabel)); }
{ const d = await run("1930 Packard 745 Deluxe Eight Roadster", { year: 1930, make: "Packard", model: "Eight", bodyStyle: "roadster" }, () => {
    for (let i = 0; i < 3; i++) mkS("Packard", "Eight", "1930 Packard Eight Dual-Cowl Phaeton", 90000 + i * 5000, 30 + i * 20, 1930); for (let i = 0; i < 3; i++) mkS("Packard", "Eight", "1929 Packard 626 Speedster", 120000 + i * 9000, 40 + i * 20, 1929);
    for (let i = 0; i < 2; i++) mkS("Packard", "Eight", "1930 Packard 745 Deluxe Eight Roadster", 130000 + i * 9000, 50 + i * 20, 1930); for (let i = 0; i < 2; i++) mkS("Packard", "Eight", "1931 Packard Eight Roadster", 125000 + i * 9000, 55 + i * 20, 1931); });
  const titles = (d.rawPool || []).map(r => r.rtitle);
  ok("1930 Packard 745 Deluxe Eight Roadster: Roadsters only, no Phaeton and no 1929 Speedster", titles.length > 0 && titles.every(t => /roadster/i.test(t)) && !titles.some(t => /phaeton|speedster/i.test(t)), JSON.stringify([...new Set(titles)])); }
// 7. sales by date: the same sales, price order as sent, date order newest first, the default price
{ const d = await run("2005 Pontiac GTO", GTO, gtoSales), so = E.withReadFields(d, "2005 Pontiac GTO", { year: 2005 }).salesOrder, n = (d.cards || []).length;
  ok("salesOrder: price is the default and date is offered", !!so && so.default === "price" && so.options.map(o => o.value).join() === "price,date");
  ok("salesOrder: both orders are the same sales (a permutation of every position)", !!so && [so.price, so.date].every(a => a.length === n && new Set(a).size === n));
  const dates = so ? so.date.map(i => String(d.cards[i].date || "")) : [];
  ok("salesOrder: date is newest first", dates.length > 1 && dates.every((x, i) => i === 0 || dates[i - 1] >= x), dates.slice(0, 4).join(" "));
  ok("salesOrder: price is the order the list is sent in", !!so && so.price.every((x, i) => x === i)); }
// 8. the table: typed words and the sales that state them
ok("lib/typedAttributes.js exists", !!T);
console.log(failed ? `typedAttributeCheck: ${failed} failure(s)` : "typedAttributeCheck: all pass");
process.exit(failed ? 1 : 0);
