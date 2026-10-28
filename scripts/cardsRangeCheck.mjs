// e96 parts 8 and 10: every card outside the printed range carries its label ("Above the typical range", "Below the typical range"); the three representative cards come from inside the range
// and only a range with fewer than three cards borrows one from outside, labelled; a sale under 500 miles on a car over 15 years old prints no mileage unless its title says N-Mile (the sale stays in the set).
//   node scripts/cardsRangeCheck.mjs [repo root]
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
const ask = async (model, asked = 2) => (await E.oneEngineAnswer({ make: MK, model, trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} ${model}`, { ...env, asked }, null)).raw;   // asked 2: the question cap is spent, so the pooled result with its option lines is what the engine answers
const hasPooled = a => !!(a.cluster || (a.raw && a.raw.cluster));
const chart = a => { const t = a.trend || (a.raw && a.raw.trend); return !!(t && ((t.movement && t.movement.buckets && t.movement.buckets.length) || (t.quarters && t.quarters.some(q => q.count >= 8)))); };
const fill = (model, plan) => { for (const [body, tx, base, count, agoStart] of plan) for (let i = 0; i < count; i++) sale(model, body, tx, base + (i % 5) * 400, agoStart + i * 9); };
const salemi = (model, price, ago, mi, year, title) => { sale(model, "Coupe", null, price, ago); const r = rows[rows.length - 1]; r.raw_record.mileage = String(mi); if (year) r.year = year; if (title) { r.listing_title = title; r.raw_record.title = title; } };
MK = "Testmake";
// A. 20 sales spread over 20,000 to 60,000: the printed range is the middle; the cards outside it are labelled
for (let i = 0; i < 20; i++) salemi("CR1", 20000 + i * 2100, 5 + i * 9, 20000 + i * 5000);
let a = await ask("CR1");
const cl = a.cluster;
ok("range: the answer has a printed range and cards", a.tier === "result" && Array.isArray(cl) && Array.isArray(a.cards) && a.cards.length >= 15, JSON.stringify(cl));
const outside = a.cards.filter(c => c.price < cl[0] || c.price > cl[1]), inside = a.cards.filter(c => c.price >= cl[0] && c.price <= cl[1]);
ok("cards: every card outside the printed range is labelled above or below", outside.length > 0 && outside.every(c => c.rangeLabel === (c.price > cl[1] ? "Above the typical range" : "Below the typical range")), `${outside.length} outside, ${outside.filter(c => !c.rangeLabel).length} unlabelled`);
ok("cards: no card inside the range carries a label", inside.every(c => !c.rangeLabel), `${inside.filter(c => c.rangeLabel).length}`);
const rep = a.representative || {};
ok("representative: the three cards sit inside the printed range", [rep.closest, rep.high, rep.low].filter(Boolean).length === 3 && [rep.closest, rep.high, rep.low].every(c => c.price >= cl[0] && c.price <= cl[1] && !c.rangeLabel), JSON.stringify([rep.closest, rep.high, rep.low].map(c => c && c.price)));
// B. the judge: an unlabelled card outside the range is a violation, a labelled one is not
const J = (c) => E.setConsistencyOf({ tier: "result", poolN: 1, cluster: [20000, 30000], rawPool: [{ id: "a", _usd: 40000 }], cards: [{ id: "a", price: 40000, ...c }] }, null);
ok("judge: an unlabelled card outside the range is a violation", J({}).some(v => /outside the printed range/.test(v)), JSON.stringify(J({})));
ok("judge: the same card labelled is consistent", !J({ rangeLabel: "Above the typical range" }).some(v => /outside the printed range/.test(v)), JSON.stringify(J({ rangeLabel: "Above the typical range" })));
// C. low-mile tile
for (let i = 0; i < 9; i++) salemi("LM1", 40000 + i * 800, 5 + i * 9, 20000 + i * 1000, 1985);
salemi("LM1", 41000, 90, 151, 1985, "1985 Testmake LM1 Replacement Speedometer");
salemi("LM1", 42000, 100, 454, 1985, "454-Mile 1985 Testmake LM1");
salemi("LM1", 43000, 110, 100, new Date().getUTCFullYear() - 3, "2023 Testmake LM1");
a = await ask("LM1");
const cardOf = t => (a.cards || []).find(c => t === "454" ? c.price === 42000 : c.title === t);
const c151 = cardOf("1985 Testmake LM1 Replacement Speedometer"), c454 = cardOf("454");
ok("low miles: a 151-mile sale on a 1985 car hides its mileage", c151 && c151.milesHidden === true && c151.mileageText == null, JSON.stringify(c151 && [c151.milesHidden, c151.mileageText]));
ok("low miles: the sale stays in the set", Number(a.poolN) >= 11 || (a.cards || []).length >= 11, `${a.poolN} ${(a.cards || []).length}`);
ok("low miles: a title that says N-Mile keeps its mileage", c454 && c454.milesHidden === false, JSON.stringify(c454 ? [c454.milesHidden, c454.mileageText] : (a.cards || []).map(c => c.title).slice(0, 14)));
ok("low miles: unit check, a recent car under 500 miles keeps its mileage, an old car at 20,000 keeps its", E.milesHiddenOf({ raw_title: "2023 X", mileage: "100", year: new Date().getUTCFullYear() - 3 }) === false && E.milesHiddenOf({ raw_title: "1985 X", mileage: "20000", year: 1985 }) === false && E.milesHiddenOf({ raw_title: "1985 X", mileage: "151", year: 1985 }) === true);
console.log(failed ? `cardsRangeCheck: ${failed} FAIL` : "cardsRangeCheck: all PASS");
process.exit(failed ? 1 : 0);
