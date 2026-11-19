// THE DEMO'S FIRST LOAD IS SERVED FROM STORAGE, AND THE BAR'S ENDS ARE THE EXACT LOWEST AND HIGHEST SALE (Lane B, Nov 1 2026; Lane E's two findings on view b, lane-e-listing 32170ac1). Worked through the partner endpoint on a fake archive (250 ms an archive read); no production read.
// CAUSE (1): a request carrying an order was never served from the stored demo answer, and the page's first read always carries one, so every cold load of a demo car read the live engine. FIX: the stored demo answer also holds the placed sales for the default order (date),
// typed prices are placed from the stored range (partnerPlacesOf, placingFor), and only a typed mileage or another order reads live. CAUSE (2): the passthrough took d.span, the engine's ROUNDED rail; the exact lowest and highest sale are lowestSaleN / highestSaleN (the
// figures sellsForCard reads for the spread beside the range), so span now comes from those. CLASS: every demo car (DEMO_CARS and the Amazon cars) and every field the page asks for on its first read. This check fails without the fix.
//   node scripts/partnerFirstLoadCheck.mjs [repo root]
import fs from "fs";
const EPOCH = "2026-10-28T19:34:12.871Z"; let archiveReads = 0; const STORE = new Map();
const cacheFetch = async (u, init) => {
  if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { market: r.market, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
  if (init && init.method === "DELETE") { STORE.delete((u.searchParams.get("spec_key") || "").replace(/^eq\./, "")); return new Response("", { status: 204 }); }
  const k = (u.searchParams.get("spec_key") || "").replace(/^eq\./, ""), r = STORE.get(k); return new Response(JSON.stringify(r ? [{ market: r.market, computed_at: r.computed_at }] : []), { status: 200 });
};
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
const DELAY = 250;
const APP = new Map();
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/spec_market_cache")) return cacheFetch(u, init);
  if (u.pathname.endsWith("/app_config")) {
    if (init && init.method === "POST") { for (const r of [].concat(JSON.parse(init.body))) APP.set(r.key, r.value); return new Response("", { status: 201 }); }
    const k = (u.searchParams.get("key") || "").replace(/^eq\./, ""); if (/^partner_last:/.test(k)) return new Response(JSON.stringify(APP.has(k) ? [{ value: APP.get(k) }] : []), { status: 200 });
    return new Response(JSON.stringify([{ value: EPOCH }]), { status: 200 });
  }
  if (init && init.method === "POST") return new Response("", { status: 201 });
  await new Promise(r => setTimeout(r, DELAY));
  if (u.pathname.endsWith("/sales_archive")) archiveReads++;
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
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const { resolveVehicle } = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), { findGeneration } = await import(pathToFileURL(path.join(root, "lib/generations.js")).href);
const mkS = (make, model, title, price, ago, year) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pd" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", year, make, model, model_family: model, listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(20000 + n * 100), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US" } }); };
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.PARTNER_KEY = "pk"; process.env.OPS_KEY = "ok"; process.env.PROBE_KEY = "ok"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.ANTHROPIC_API_KEY = "x"; process.env.SUPABASE_ANON_KEY = "k";
MK = "Porsche"; rows = [];
const T = (title, price, ago, mi) => { mkS("Porsche", "911", title, price, ago, 2014); const r = rows[rows.length - 1]; r.raw_record.mileage = String(mi); r.raw_record.body_style = "Coupe"; };
for (let i = 0; i < 14; i++) T(`2014 Porsche 911 GT3 Coupe ${i % 2 ? "PDK" : "6-Speed"}`, 120000 + i * 3500, 15 + i * 20, 8000 + i * 2500);
const PA = await import(pathToFileURL(path.join(root, "api/partnerAnswer.js")).href);
const post = (body, hdrs = {}) => new Promise(async resolve => { const t0 = Date.now(); let code = 200; const res = { statusCode: 200, headers: {}, setHeader() {}, status(c) { code = c; return this; }, json(o) { resolve({ ms: Date.now() - t0, code, body: o }); return this; }, send(o) { resolve({ ms: Date.now() - t0, code, body: o }); return this; }, end() {} };
  await PA.default({ method: "POST", url: "/api/partnerAnswer", headers: { "x-partner-key": "pk", host: "goasksam.com", "user-agent": "t", ...hdrs }, query: {}, body }, res); });
const CAR = "2014 Porsche 911 GT3";
const FIRST = { q: CAR, order: "date", prices: { item_price: 139900 } };   // the page's first read (Lane E's plainBody)
archiveReads = 0; const r1 = await post(FIRST); const reads1 = archiveReads;
console.log(`INFO  first read ${r1.ms} ms, ${reads1} archive reads, answerType ${r1.body && r1.body.answerType}, ok ${r1.body && r1.body.ok}`);
ok("the first read answers a range with the placed sales and the price's position", r1.body && r1.body.ok === true && r1.body.answerType === "range" && Array.isArray(r1.body.placedSales) && r1.body.placedSales.length === 5 && Array.isArray(r1.body.positions) && r1.body.positions.length === 1, JSON.stringify([r1.body && r1.body.answerType, r1.body && r1.body.error]));
await new Promise(r => setTimeout(r, 300));   // the stored answer is written behind the response
archiveReads = 0; const r2 = await post(FIRST); const reads2 = archiveReads;
console.log(`INFO  second read ${r2.ms} ms, ${reads2} archive reads, storedDemo ${r2.body && r2.body.storedDemo}`);
ok("the second read of the same first load comes from the stored demo answer (no archive read)", reads2 === 0 && r2.body && r2.body.storedDemo === true, `${reads2} reads, storedDemo ${r2.body && r2.body.storedDemo}`);
ok("... and is the same answer: the same range, the same placed sales, the same position", r2.body && r1.body && JSON.stringify(r2.body.range) === JSON.stringify(r1.body.range) && JSON.stringify(r2.body.placedSales) === JSON.stringify(r1.body.placedSales) && JSON.stringify(r2.body.positions) === JSON.stringify(r1.body.positions));
// a typed price is placed from the stored range with no engine read
archiveReads = 0; const r3 = await post({ q: CAR, order: "date", prices: { reserve: 1, item_price: 999999999, buy_it_now: r1.body.range.low } });
ok("a typed price changes the position and still reads no archive (placed from the stored range)", archiveReads === 0 && r3.body.storedDemo === true && r3.body.positions.find(p => p.key === "reserve").place === "below" && r3.body.positions.find(p => p.key === "item_price").place === "above" && r3.body.positions.find(p => p.key === "buy_it_now").place === "within");
// a typed mileage or another order reads live
archiveReads = 0; const r4 = await post({ q: CAR, order: "miles", mileage: 30400 });
ok("a typed mileage with the miles order reads live (and is ordered by nearness)", r4.body && !r4.body.storedDemo && r4.body.order === "miles" && Array.isArray(r4.body.placedSales));
archiveReads = 0; const r5 = await post({ q: CAR, order: "price" });
ok("another order is read live", r5.body && !r5.body.storedDemo && r5.body.order === "price");
// a request that did not ask is exactly the stored answer: no placed sales, no order
const r6 = await post({ q: CAR });
ok("a request that asks nothing gets no placedSales, no positions and no order (the answer is what it was)", r6.body && r6.body.ok === true && !("placedSales" in r6.body) && !("positions" in r6.body) && !("order" in r6.body));
// the guards stay
ok("no venue and no address anywhere in the answers served", [r1, r2, r3, r4, r5].every(r => PA.venueLeak(r.body).length === 0 && !/Bring a Trailer|https?:\/\//i.test(JSON.stringify(r.body.placedSales || []))));
ok("the answer served from storage carries the range and the card", r2.body.range && typeof r2.body.card === "string");
// 2. span: the exact lowest and highest sale, not the rounded rail
const exact = r1.body.span, prices = rows.map(r => r.sale_price);
ok("span is the included sales' exact lowest and highest sale", exact && exact.low === Math.min(...prices) && exact.high === Math.max(...prices), JSON.stringify(exact) + " vs " + Math.min(...prices) + "," + Math.max(...prices));
const shaped = PA.partnerShape({ status: "one_box", tier: "result", cluster: [130000, 150000], span: [100000, 200000], lowestSaleN: 123456, highestSaleN: 187654, poolN: 12, cards: [] }, "x", 0, {});
ok("span ignores the rounded rail (d.span) and is null without a range", shaped.span && shaped.span.low === 123456 && shaped.span.high === 187654 && PA.partnerShape({ status: "one_box", tier: "thin", cluster: null, span: [1, 2], lowestSaleN: 5, highestSaleN: 9, poolN: 3, cards: [] }, "x", 0, {}).span === null);
ok("span is guarded like every field (a venue in it would block; numbers only)", PA.venueLeak({ span: shaped.span }).length === 0 && typeof shaped.span.low === "number");

// the two typed cars named for timing (not in DEMO_CARS, so no stored demo answer: this change does not touch them; shown for the record)
for (const [car, make, model, year, base, n] of [["2008 Porsche 911 Carrera S", "Porsche", "911", 2008, 52000, 14], ["1969 Camaro", "Chevrolet", "Camaro", 1969, 55000, 14]]) {
  MK = make; rows = [];
  for (let i = 0; i < n; i++) { mkS(make, model, `${year} ${make} ${model === "911" ? "911 Carrera S Coupe" : "Camaro Coupe"}`, base + i * 1500, 15 + i * 20, year); rows[rows.length - 1].raw_record.mileage = String(20000 + i * 3000); rows[rows.length - 1].raw_record.body_style = "Coupe"; }
  archiveReads = 0; const a = await post({ q: car, order: "date", prices: { item_price: base + 8000 } }), ra = archiveReads;
  archiveReads = 0; const b = await post({ q: car, order: "date", prices: { item_price: base + 8000 } }), rb = archiveReads;
  console.log(`INFO  ${car} (typed, not a demo car): first read ${a.ms} ms (${ra} archive reads, ${a.body && a.body.answerType}), second read ${b.ms} ms (${rb} archive reads, storedDemo ${b.body && b.body.storedDemo})`);
}
console.log(failed ? `partnerFirstLoadCheck: ${failed} failure(s)` : "partnerFirstLoadCheck: all pass");
process.exit(failed ? 1 : 0);
