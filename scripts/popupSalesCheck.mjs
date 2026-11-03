// POPUP SALES (Lane E, Nov 2 2026). Live: the Find card popup on a 2016 Porsche 911 GT3 RS (19 sales on file) printed "Based on 19 sales, the latest in October 2026", the mileage line, Open full Market Check, the
// email toggle and the Look for chips, and NO sales. CAUSE: the card's market line comes from the STORED row but the popup's sales come from a SECOND engine read made when it opens (lib/live/search.js panelOf);
// when that read does not come back (a cold instance, the engine queue, a busy database: it returns undefined) the answer carried engineAnswer: null and the popup printed its header over nothing, with no reason.
// WHO ELSE: every card that opens a popup (live auction, dealer listing, question-first car, apart answer, thin answer), the Tasks card (the same kit), and any caller of panelOf. This check runs the REAL engine over a fake
// archive and fake stored rows (no network): (1) a warm instance hands the popup the engine's cards, the count it states equals the count of cards, in the order the full Market Check page prints (the engine's own d.cards);
// (2) a COLD second instance whose engine read fails (archive down) still hands the same cards, from the stored whole answer; (3) with nothing stored either, the answer carries the engine's still-reading line and
// wait (salesStill), never a bare header; (4) the rendered popup prints every sale it states (and the still-reading line when there are none), at 1440 and 390; (5) a thin answer (too few sales for a range) states its count
// and prints the sales it has or says why not; (6) a card's Market Check link carries the car beside the VIN.   node scripts/popupSalesCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
let LIVE = [], SALES = [], STORE = new Map(), ARCHIVE_DOWN = false;
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), sp = u.searchParams;
  if (!/fake\.supabase/.test(u.hostname)) return new Response("", { status: 500 });
  if (/taxonomy|generations/.test(u.pathname)) return new Response("[]", { status: 200 });   // the resolver falls back to its curated lists, as it does with the tables unreachable
  if (u.pathname.endsWith("/live_listings")) {
    const rg = String((init && init.headers && (init.headers.Range || init.headers.range)) || ""), off = Number((/^(\d+)-/.exec(rg) || [])[1] || sp.get("offset") || 0);
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, ""));
    return new Response(JSON.stringify(off > 0 ? [] : LIVE.filter(r => !mk || mk.test(r.make))), { status: 200 });
  }
  if (u.pathname.endsWith("/spec_market_cache")) {   // the stored rows (the card's market line and the stored whole Market Check answer)
    if ((init && init.method) === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, { ...r, computed_at: r.computed_at || new Date().toISOString() }); return new Response("", { status: 201 }); }
    if ((init && init.method) === "DELETE") return new Response("", { status: 204 });
    const k = sp.get("spec_key") || "", keys = k.startsWith("in.(") ? [...k.slice(4, -1).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\"/g, '"')) : [k.replace(/^eq\./, "")];
    return new Response(JSON.stringify(keys.map(x => STORE.get(x)).filter(Boolean)), { status: 200 });
  }
  if (u.pathname.endsWith("/sales_archive")) {
    if (ARCHIVE_DOWN && /raw_record|price/.test(sp.get("select") || "")) return new Response("", { status: 500 });   // the pool read fails; the resolver's name lookups still answer
    const sel = sp.get("select") || "", ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = SALES.filter(r => r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    const cols = sel.split(",").map(it => { const ci = it.indexOf(":"); const a = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null, ex = a ? it.slice(ci + 1) : it; return [a || (ex.startsWith("raw_record->>") ? ex.slice(13) : ex), ex]; });
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(cols.map(([a, ex]) => [a, ex.startsWith("raw_record->>") ? (r.raw_record[ex.slice(13)] ?? null) : (ex === "price" ? r.sale_price : ex === "auction_end_date" ? r.sale_date : r[ex] ?? null)])))), { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };


const imp = (f, q) => import(pathToFileURL(path.join(root, f)).href + (q ? "?" + q : ""));
const soon = new Date(Date.now() + 6 * 864e5).toISOString();
let id = 0;
const sale = (make, year, title, price, model = "Capri") => ({ id: "S" + ++id, source_id: "s" + id, sale_price: price, sale_date: new Date(Date.now() - (30 + id) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year, listing_title: title, vin_norm: "V" + id, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price, model_family: model,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: "60000", body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + id, source_url: null, city: "Austin", state: "TX", country_code: "US" } });

const row = (n, o = {}) => ({ id: 9000 + n, source: "sothebysmotorsport", make: "Porsche", model: "911", year: 2016, listing_title: "2016 Porsche 911 GT3 RS", current_bid_usd: 76000, end_time: soon, country: "US", photo_url: "https://x/i.jpg", status: "live", mileage: 3000, exterior_color: "Purple", ...o });
const wait = ms => new Promise(r => setTimeout(r, ms));
const readMarket = async (L, r) => { const f = L.listingFacts(r); for (let i = 0; i < 8; i++) { const out = await L.panelOf(env, r, f); if (out && out.market && out.market.kind !== "pending") return out; await wait(1500); } return null; };
const N = 19;
for (let i = 0; i < N; i++) SALES.push(sale("Porsche", 2016, "2016 Porsche 911 GT3 RS", 150000 + i * 2500, "911"));
const L1 = await imp("lib/live/search.js", "warm"), car = row(1);
// (1) a warm instance
const w = await readMarket(L1, car), ea = w && w.engineAnswer;
const basisN = n => { const m = /Based on (\d+|[a-z-]+) sales?/i.exec(String(n || "")); const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 }; return m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : words[m[1].toLowerCase()] || null) : null; };
ok(!!ea && Array.isArray(ea.cards) && ea.cards.length === N, `warm: the popup's answer carries ${N} sales (${ea && ea.cards && ea.cards.length})`);
ok(ea && basisN(ea.basisLine) === ea.cards.length, `warm: the count the popup states ("${ea && ea.basisLine}") equals the sales it carries (${ea && ea.cards && ea.cards.length})`);
const OB = await imp("lib/onebox.js"), full = await OB.oneEngineAnswer({ make: "Porsche", model: "911", year: 2016, trim: "GT3 RS", requireYear: true }, null, "2016 Porsche 911 GT3 RS", { ...env, asked: 0 }, null).catch(() => null);
const mcCards = full && full.raw && full.raw.cards || [];
ok(mcCards.length === N && ea && ea.cards.every((c, k) => c.price === mcCards[k].price && c.date === (mcCards[k].date || null) && c.title === (mcCards[k].title || null)), "warm: the popup's sales are the full Market Check page's cards, the same sales in the same order");
// (2) a cold second instance: the card's market line is stored, the popup's own engine read does not come back
await wait(1500); const SNAP = new Map(STORE); ARCHIVE_DOWN = true;
const L2 = await imp("lib/live/search.js", "cold"), cold = await L2.panelOf(env, car, L2.listingFacts(car)).catch(e => { ok(false, "cold, engine read failed: panelOf THREW, so the panel answers 500 and the popup draws the card's own header and no sales (" + String(e && e.message).slice(0, 80) + ")"); return null; });
const ec = cold && cold.engineAnswer;
ok(!!(cold && cold.market && cold.market.kind === "range"), "cold: the stored market line is there (range)");
ok(!!ec && Array.isArray(ec.cards) && ec.cards.length === N && ec.cards.every((c, k) => c.price === ea.cards[k].price), `cold, engine read failed: the popup still gets the ${N} sales, in the same order, from the stored whole answer (${ec && ec.cards && ec.cards.length})`);
// (3) nothing stored for the whole answer either: the answer says why it has no sales
STORE.clear(); for (const [k, v] of SNAP) if (!/^MCWARM:/.test(k)) STORE.set(k, v);   // the card's stored market line stays; the stored whole answer is gone
const L3 = await imp("lib/live/search.js", "cold3"), none = await L3.panelOf(env, car, L3.listingFacts(car)).catch(e => { ok(false, "nothing stored, engine read failed: panelOf THREW (" + String(e && e.message).slice(0, 80) + ")"); return null; });
const hasCards = !!(none && none.engineAnswer && none.engineAnswer.cards && none.engineAnswer.cards.length);
ok(hasCards || !!(none && none.salesStill && none.salesStill.line && none.salesStill.retryAfterMs > 0 && none.salesStill.waitMaxMs > 0), "nothing readable: the answer carries salesStill (the engine's line and wait), never a header over nothing");
ARCHIVE_DOWN = false; STORE.clear(); for (const [k, v] of SNAP) STORE.set(k, v);
// (6) the Market Check link carries the car beside the VIN
const { mcUrlOf } = await imp("lib/mcLink.js");
{ const u = mcUrlOf({ vin_norm: "WP0AF2A97GS183456", year: 2016, make: "Porsche", model: "911", trim: "GT3 RS" }, { body: "coupe" }, { query: "2016 porsche 911 gt3 rs" }), p = new URL(u, "https://x.test").searchParams;
  ok(p.get("vin") === "WP0AF2A97GS183456" && p.get("from") === "card" && p.get("car") === "2016-porsche-911-gt3-rs", `a card link with a VIN carries the car beside it (${u})`);
  const u2 = mcUrlOf({ vin_norm: "WP0AF2A97GS183456", year: 2016, make: "Porsche", model: "911", trim: "GT3 RS" }, {}, { query: "2016 porsche 911" }), p2 = new URL(u2, "https://x.test").searchParams;
  ok(p2.get("trim") === "GT3 RS" && p2.get("car") === "2016-porsche-911", `the trim the listing states rides along when the car text lacks it (${u2})`); }
const out = { ea, cold: ec, none };
// (5) a thin answer: three sales, too few for a range
const thinRow = row(2, { listing_title: "2019 Aston Martin Vantage AMR", make: "Aston Martin", model: "Vantage", year: 2019, source: "bringatrailer" });
for (let i = 0; i < 3; i++) SALES.push(sale("Aston Martin", 2019, "2019 Aston Martin Vantage AMR", 120000 + i * 3000, "Vantage"));
const L4 = await imp("lib/live/search.js", "thin"), thin = await (async () => { const f = L4.listingFacts(thinRow); for (let i = 0; i < 6; i++) { const o = await L4.panelOf(env, thinRow, f); if (o && o.market && o.market.kind !== "pending") return o; await wait(1500); } return null; })();
out.thin = thin;
// SWEEP of the other card types, through the same panelOf: what each hands the popup
const kinds = {}, kindLib = {};
const probe = async (name, r, mkSales) => { mkSales(); const L = await imp("lib/live/search.js", "k" + name.replace(/\W/g, "")); const f = L.listingFacts(r); let o = null; for (let i = 0; i < 6; i++) { o = await L.panelOf(env, r, f).catch(e => ({ error: String(e) })); if (o && (o.error || (o.market && o.market.kind !== "pending"))) break; await wait(1500); } kinds[name] = o; kindLib[name] = { L, r, f, picks: [] }; const ox = o && o.engineAnswer && Array.isArray(o.engineAnswer.options) ? o.engineAnswer.options : []; for (const x of ox) kindLib[name].picks.push(!(Number(x.n) > 0) ? null : await L.panelOf(env, r, f, { dimension: x.dimension, value: x.value }).catch(e => ({ error: String(e) }))); return o; };
await probe("dealer", row(3, { seller_type: "dealer", source: "carsandbids" }), () => {});
await probe("apart", row(4, { listing_title: "2008 Porsche 911 Carrera S", year: 2008, model: "911", source: "bringatrailer", transmission: "Manual" }), () => { for (let i = 0; i < 10; i++) SALES.push(sale("Porsche", 2008, "2008 Porsche 911 Carrera S 6-Speed Manual", 70000 + i * 1500, "911")); for (let i = 0; i < 10; i++) SALES.push(sale("Porsche", 2008, "2008 Porsche 911 Carrera S Tiptronic", 52000 + i * 1500, "911")); });
const msale = (year, title, price, mi, model) => { const s = sale("BMW", year, title, price, model); s.raw_record.mileage = String(mi); return s; };
await probe("apartMiles", row(5, { listing_title: "1995 BMW M3 Coupe", make: "BMW", model: "M3", year: 1995, source: "bringatrailer", mileage: 28000 }), () => { SALES.length = 0; for (let i = 0; i < 8; i++) SALES.push(msale(1995, "1995 BMW M3 Coupe", 98000 + i * 2500, 18000 + i * 3000, "M3")); for (let i = 0; i < 8; i++) SALES.push(msale(1995, "1995 BMW M3 Coupe", 62000 + i * 2000, 55000 + i * 5000, "M3")); for (let i = 0; i < 11; i++) SALES.push(msale(1995, "1995 BMW M3 Coupe", 16000 + i * 700, 104000 + i * 6000, "M3")); });
await probe("apartFew", row(6, { listing_title: "1996 BMW M3 Coupe", make: "BMW", model: "M3", year: 1996, source: "bringatrailer", mileage: 28000 }), () => { SALES.length = 0; for (let i = 0; i < 3; i++) SALES.push(msale(1996, "1996 BMW M3 Coupe", 98000 + i * 2500, 18000 + i * 3000, "M3")); for (let i = 0; i < 8; i++) SALES.push(msale(1996, "1996 BMW M3 Coupe", 62000 + i * 2000, 55000 + i * 5000, "M3")); for (let i = 0; i < 11; i++) SALES.push(msale(1996, "1996 BMW M3 Coupe", 16000 + i * 700, 104000 + i * 6000, "M3")); });
await probe("question", row(5, { listing_title: "1965 Ford Mustang", make: "Ford", model: "Mustang", year: 1965, source: "bringatrailer" }), () => { for (const b of ["Coupe", "Convertible", "Fastback"]) for (let i = 0; i < 6; i++) SALES.push(sale("Ford", 1965, `1965 Ford Mustang ${b}`, 30000 + i * 1000, "Mustang")); });
await probe("nosales", row(6, { listing_title: "2021 Lotus Evija", make: "Lotus", model: "Evija", year: 2021, source: "bringatrailer" }), () => {});
if (process.env.DBG) for (const [k, o] of Object.entries(kinds)) console.log("SWEEP", k, JSON.stringify({ market: o && o.market && { kind: o.market.kind, count: o.market.count }, tier: o && o.engineAnswer && o.engineAnswer.tier, cards: o && o.engineAnswer && o.engineAnswer.cards && o.engineAnswer.cards.length, basis: o && o.engineAnswer && o.engineAnswer.basisLine, thin: o && o.engineAnswer && o.engineAnswer.thinLine, still: !!(o && o.salesStill), err: o && o.error }));
if (process.env.DUMPSHAPES) { const strip = m => { if (!m) return m; const { rows, recent, ...r } = m; return r; }; fs.writeFileSync(process.env.DUMPSHAPES, JSON.stringify({ range: strip(w.market), thin: strip(out.thin.market), apart: strip(kinds.apart.market), apartMiles: strip(kinds.apartMiles.market), apartFew: strip(kinds.apartFew.market), question: strip((kinds.question || {}).market), dealer: strip((kinds.dealer || {}).market) }, null, 1)); }
// (4) and (5) the RENDERED popup, at 1440 and 390: it prints every sale the answer states, and when it has none says why
const { startBrowser } = await imp("scripts/e98Render.mjs"), { openPanel } = await imp("scripts/e98PanelRender.mjs");
const br = await startBrowser();
const draw = async (width, panelBody) => { const p = await openPanel(br, width, { panelBody }); await wait(500); const r = await p.evaluate(() => ({ rows: document.querySelectorAll(".mcdrawer .md-row").length, head: (document.querySelector(".mcdrawer .md-s") || {}).textContent || "", still: (document.querySelector(".mcdrawer .md-still") || {}).textContent || "", full: (document.querySelector(".mcdrawer .md-full") || {}).getAttribute ? (document.querySelector(".mcdrawer .md-full") || { getAttribute() { return null; } }).getAttribute("href") : null, text: document.querySelector(".mcdrawer") ? document.querySelector(".mcdrawer").innerText : "" })); await p.close(); return r; };
for (const width of [1440, 390]) {
  const a = await draw(width, w);
  ok(a.rows === N && basisN(a.head) === a.rows, `popup at ${width}: it prints ${N} sales and the count it states ("${a.head}") equals the ${a.rows} printed`);
  const b2 = await draw(width, none);
  ok(b2.rows > 0 || (none.salesStill && b2.still === none.salesStill.line && b2.still.length > 10), `popup at ${width}, sales not read yet: it prints the engine's still-reading line, not a header over nothing ("${b2.still}")`);
  const t = out.thin, th = await draw(width, t);
  const tn = basisN(th.head) || (t && t.market && t.market.count);
  ok(th.rows > 0 && th.rows === Number(tn), `popup at ${width}, thin answer: it prints the ${tn} sales it states (${th.rows})`);
}
// THE PAGE KEEPS NO WAIT OF ITS OWN (Lane E, Nov 2 2026, pageWaitCheck): the drawer asks again only at the ENGINE's salesStill values. Without waitMaxMs and retryAfterMs it prints the still-reading line and does not ask again; with them it asks again at the engine's cadence.
{ const still = (extra) => ({ market: none.market, engineAnswer: null, representative: {}, salesStill: { line: none.salesStill.line, ...extra } });
  const asks = async (extra) => { let n = 0; const p = await openPanel(br, 1440, { panelBody: still(extra), onPanel: () => n++ }); await wait(1500); const line = await p.evaluate(() => (document.querySelector(".mcdrawer .md-still") || {}).textContent || ""); return { n, line }; };
  const bare = await asks({}), partial = await asks({ waitMaxMs: 60000 }), partial2 = await asks({ retryAfterMs: 100 }), full = await asks({ retryAfterMs: 100, waitMaxMs: 60000 });
  ok(bare.n === 1 && bare.line === none.salesStill.line, `salesStill with no wait values: the drawer prints the engine's line and does not ask again (${bare.n} request)`);
  ok(partial.n === 1 && partial2.n === 1, `salesStill with only one of the two values: no retry (${partial.n}, ${partial2.n} requests)`);
  ok(full.n >= 3, `salesStill with the engine's retryAfterMs and waitMaxMs: the drawer asks again at the engine's cadence (${full.n} requests in 1.5 s)`); }
// the other card types through the same popup: a dealer listing and a question-first car print every sale their answer carries
for (const k of ["dealer", "question"]) { const o = kinds[k], n = o && o.engineAnswer && o.engineAnswer.cards ? o.engineAnswer.cards.length : 0, d = await draw(1440, o), bn = basisN(d.head);
  ok(n > 0 && d.rows === n && (bn === null || bn === d.rows), `popup, ${k} card: it prints the ${n} sales its answer carries (${d.rows} printed; states ${bn === null ? "no count" : bn})`); }
// AN ANSWER THAT PRICES APART PRINTS ITS OPTIONS AS CHIPS (Lane E, Nov 3 2026; the live 1995 BMW M3 Coupe popup: "pick one to see its range" over no options, and one option's heading ("Over 100,000 miles $16,000 to $23,000, 11 sales
// since November 2025") over a list of every mileage band). CAUSE: drawerHtml printed the answer's basisLine/thinLine, the engine's otherLines (the options the headline does not already state) and ALL of the pool's cards, and never read
// the answer's options or headlineLines, so an answer with no single range showed its apart line over nothing, or one option's line over the whole pool. CLASS: every card whose answer is apart or split, on every dimension
// (mileage bands, gearbox, body, year), in the Find popup and the Tasks card (one kit). Before a pick: the engine's apart line and one chip per option (the engine's own headline line, in its order), no sales and no option's heading;
// a pick asks the engine for that option (panelOf with the pick) and prints its heading and its own sales, never the mixed pool.
for (const k of ["apart", "apartMiles"]) {
  const o = kinds[k], ea = o && o.engineAnswer, opts = ea && ea.options || [], hl = ea && ea.headlineLines || [], lib = kindLib[k];
  ok(opts.length >= 2 && hl.length === opts.length && /^(apart|split)$/.test(String(ea.optionsState)), `${k}: the engine's answer is apart with ${opts.length} options and a headline line for each`);
  const picks = lib.picks;
  picks.forEach((pk, i) => ok(opts[i].rangeFloor === true || (pk && pk.option && pk.engineAnswer && pk.engineAnswer.cards.length > 0 && pk.engineAnswer.cards.length < ea.cards.length), `${k}: the engine answers a pick of "${opts[i].label}" with that option's own ${pk && pk.engineAnswer ? pk.engineAnswer.cards.length : 0} sales, not the pool's ${ea.cards.length}`));
  if (k === "apartMiles") picks.forEach((pk, i) => { const b = { lt50: [0, 50000], "50to100": [50000, 100000], gt100: [100000, Infinity] }[opts[i].value]; ok(!b || (pk && pk.engineAnswer.cards.every(c => c.mi >= b[0] && c.mi < b[1])), `${k}: every sale under "${opts[i].label}" has its miles inside that band`); });
  for (const width of [1440, 390]) {
    const p = await openPanel(br, width, { panelBody: o, optionBody: v => picks[opts.findIndex(x => String(x.value) === String(v.value) && x.dimension === v.dimension)] });
    const snap = () => p.evaluate(() => ({ chips: Array.from(document.querySelectorAll(".mcdrawer .md-chip")).map(c => c.textContent), rows: document.querySelectorAll(".mcdrawer .md-row").length, heads: Array.from(document.querySelectorAll(".mcdrawer .md-s")).map(e => e.textContent), text: document.querySelector(".mcdrawer").innerText, pressed: Array.from(document.querySelectorAll(".mcdrawer .md-chip[aria-pressed=true]")).length, opts: document.querySelectorAll(".mcdrawer .md-opt").length }));
    const a = await snap();
    ok(JSON.stringify(a.chips) === JSON.stringify(ea.chipLines || hl), `${k} at ${width}: the popup prints one chip per option, the engine's own lines in its order (${a.chips.length} of ${opts.length})`);
    ok(a.rows === 0 && a.heads.length === 1 && a.heads[0] === ea.thinLine && a.opts === 0, `${k} at ${width}: before a pick it prints the engine's apart line ("${a.heads[0]}") and no sales`);
    const bandHead = hl.filter(t => a.text.split(t).length - 1 > 1);
    ok(bandHead.length === 0, `${k} at ${width}: no option's heading is printed beside its chip before a pick`);
    const i0 = opts.findIndex(x => x.rangeFloor !== true), want = picks[i0] && picks[i0].engineAnswer;
    await p.evaluate(i => document.querySelector(`.mcdrawer .md-chip[data-mdopt="${i}"]`).click(), i0); await wait(700);
    const b = await snap();
    ok(want && b.rows === want.cards.length && b.rows < ea.cards.length && b.pressed === 1, `${k} at ${width}: a pick shows only that option's ${want && want.cards.length} sales (${b.rows} printed, the pool has ${ea.cards.length})`);
    ok(want && b.heads[0] === (want.basisLine || want.thinLine) && b.chips.length === opts.length, `${k} at ${width}: a pick prints that option's own heading ("${b.heads[0]}") and keeps the chips`);
    await p.close();
  }
}
{ const kit = await imp("lib/findCardKit.js"), code = kit.buildKitSource().code, tp = fs.readFileSync(path.join(root, "api/tasksPage.js"), "utf8");
  ok(/data-mdopt/.test(code) && /option: \{ dimension: o\.dimension/.test(code) && /md-chips/.test(kit.findCardKitJs()), "Tasks card: it lifts Find's drawer whole, so an apart answer prints the same option chips and the same pick (one kit, no copy)");
  ok(!/data-mdopt|perOption/.test(tp), "Tasks page: no option logic of its own"); }
// THE FIND CARD IS ONE SIZE AND SHAPE IN EVERY STATE (Lane E, Nov 3 2026, lane-e-cardsize; Sam: "every card is the same size and shape"). The live 1995 M3 Coupe card printed its band chips as full sentences, one to a row, and the picked line as a headline
// outside the box: far taller than a range card. CAUSE: the card had a different shape for each state (a range in the large serif and two small lines, a sentence for an answer with no range, then chips) and each state a different height. RULE: one Sam
// box, three slots in this order, from the engine for every answer: a small label, the headline, a small line (cardLabel, cardHeadline, cardLine; lib/live/cardSlots.js); the page prints those and nothing else; each slot keeps its height. The pick stays in
// the popup behind See the sales, and the popup opens on the band the headline shows (cardBand). CLASS: every state below, at 1440 and 390; Find and, through the one kit, the Tasks card.
{
  const { cardSlotsOf } = await imp("lib/live/cardSlots.js");
  const states = { "result with a range": w.market, "apart by gearbox (matched option)": kinds.apart.market, "apart by mileage band (matched band)": kinds.apartMiles.market, "a thin band beside other bands (the live M3)": kinds.apartFew.market, "question first (alike)": kinds.question.market, "dealer listing": kinds.dealer.market, "thin (three sales)": out.thin.market,
    "one venue (the fence)": { kind: "count", count: 12, window: "since June 2026", thinReason: "house_share", thinLine: "These sales come mostly from one place, so no range is shown.", query: "x" }, "no sales": { kind: "count", count: 0, query: "x" }, "not tracked": { kind: "not_tracked", notTrackedLine: "Sam does not track this car yet.", query: null }, "refused": { kind: "refused", refusalLine: "Sam does not read this one: the listing does not say enough to match it to a car.", query: null }, "unmatched": { kind: "unmatched", query: null } };
  const seen = {};
  for (const width of [1440, 390]) {
    const hs = [];
    for (const [name, mk] of Object.entries(states)) {
      const f = cardSlotsOf({ market: mk, sam_lines: [], miles: 28000 }), p = await openPanel(br, width, { marketOnly: mk, cardFields: f, noOpen: true });
      const r = await p.evaluate(() => { const a = document.querySelector("article.car"), sl = a && a.querySelector(".sl"); const kids = sl ? Array.from(sl.children).filter(x => !x.classList.contains("who")) : [], h = a && a.querySelector(".cs-head"); return a ? { h: Math.round(a.getBoundingClientRect().height), kids: kids.map(x => x.className), label: (a.querySelector(".cs-label") || {}).textContent, head: (h || {}).textContent, line: (a.querySelector(".cs-line") || {}).textContent, oneLine: h ? h.scrollWidth <= h.clientWidth + 1 : null, see: !!a.querySelector("button.act[data-mc]"), chips: a.querySelectorAll(".md-chip").length, text: a.innerText, vauc: !!a.querySelector("a.vauc") } : null; });
      seen[name] = r; hs.push([name, r && r.h]);
      ok(r && r.vauc && JSON.stringify(r.kids) === JSON.stringify(["cs-label", "cs-head", "cs-line"]), `card at ${width}, ${name}: the Sam box is exactly label, headline, line`);
      ok(r && r.label === f.cardLabel && r.head === f.cardHeadline && r.line === f.cardLine && f.cardHeadline.length > 0, `card at ${width}, ${name}: it prints the engine's three fields as sent ("${f.cardLabel}" | "${f.cardHeadline}" | "${f.cardLine}")`);
      ok(r && r.oneLine === true, `card at ${width}, ${name}: the headline is one line ("${f.cardHeadline}")`);
      ok(!/\b(January|February|March|April|June|July|August|September|October|November|December)\b/.test(f.cardLabel), `card at ${width}, ${name}: the label abbreviates the month ("${f.cardLabel}")`);
      ok(r && r.chips === 0 && !(/\b(pick|choose)\b/i.test(r.text) && !r.see), `card at ${width}, ${name}: no chips on the card, and nothing to pick without See the sales`);
      const sales = Number(mk.count) > 0 || (mk.options || []).length > 0 || (mk.kind === "range" && mk.low > 0);
      if (mk.query) ok(r && r.see === sales, `card at ${width}, ${name}: See the sales ${sales ? "prints" : "is hidden"}`);
      await p.close();
    }
    const all = hs.map(x => x[1]), spread = Math.max(...all) - Math.min(...all);
    console.log(`CARDSIZE ${width}px: ${hs.map(x => x[0] + " " + x[1]).join("; ")}`);
    ok(spread <= 18, `card height at ${width}: every state is one height, within one small line (spread ${spread}px over ${hs.length} states)`);
  }
  const f3 = cardSlotsOf({ market: kinds.apartFew.market, sam_lines: [], miles: 28000 }), o3 = kinds.apartFew.market.options;
  ok(/^50,000 to 100,000 miles, 8 sales since Jul 2026$/.test(f3.cardLabel) && f3.cardHeadline === "$65,500 to $72,500" && f3.cardLine === "Under 50,000 miles: 3 sales, too few. See the sales for each band." && f3.cardBand.value === "50to100", `the live M3 shape: label, headline and line as specified ("${f3.cardLabel}" | "${f3.cardHeadline}" | "${f3.cardLine}")`);
  // the popup opens on the band the card headline shows
  { const lib = kindLib.apartFew, idx = v => o3.findIndex(x => String(x.value) === String(v.value) && x.dimension === v.dimension);
    const p = await openPanel(br, 1440, { marketOnly: kinds.apartFew.market, cardFields: f3, panelBody: kinds.apartFew, optionBody: v => lib.picks[idx(v)] }); await wait(1000);
    const r = await p.evaluate(() => ({ d: !!document.querySelector(".mcdrawer"), pressed: Array.from(document.querySelectorAll(".mcdrawer .md-chip[aria-pressed=true]")).map(x => x.getAttribute("data-mdkey")), rows: document.querySelectorAll(".mcdrawer .md-row").length }));
    ok(r.d && r.pressed.length === 1 && r.pressed[0] === "mileage|50to100" && r.rows === lib.picks[idx({ dimension: "mileage", value: "50to100" })].engineAnswer.cards.length, `See the sales opens the popup on the band the headline shows (${r.pressed}), with that band's ${r.rows} sales`);
    await p.close(); }
}
// THE THIN BAND IS A CHIP YOU CAN PICK (Lane E, Nov 3 2026): a band with too few sales for a range lists its sales under "Under 50,000 miles: 4 sales, too few for a range." and no figures; only a band with no sales is plain text. The chips are the engine's short form.
{
  const k = kinds.apartFew, ea = k.engineAnswer, opts = ea.options, lib = kindLib.apartFew, i0 = opts.findIndex(o => o.rangeFloor === true && o.n > 0);
  ok(i0 >= 0 && Array.isArray(ea.chipLines) && ea.chipLines.length === opts.length && Array.isArray(ea.pickLines), "thin band: the engine sends a chip line and a pick heading for each option");
  ok(ea.chipLines[i0] === `${opts[i0].label}, ${opts[i0].n} sales` && ea.pickLines[i0] === `${opts[i0].label}: ${opts[i0].n} sales, too few for a range.`, `thin band: chip "${ea.chipLines[i0]}", heading "${ea.pickLines[i0]}"`);
  ok(lib.picks[i0] && lib.picks[i0].engineAnswer && lib.picks[i0].engineAnswer.cards.length === opts[i0].n, `thin band: the engine answers a pick of "${opts[i0].label}" with its ${opts[i0].n} sales (${lib.picks[i0] && lib.picks[i0].engineAnswer ? lib.picks[i0].engineAnswer.cards.length : 0})`);
  const zero = { ...opts[i0], value: "none0", label: "Over 200,000 miles", n: 0 }, ea0 = { ...ea, options: [...opts, zero], headlineLines: [...ea.headlineLines, "Over 200,000 miles, no sales"], chipLines: [...ea.chipLines, "Over 200,000 miles, 0 sales"], pickLines: [...ea.pickLines, null] };
  for (const width of [1440, 390]) {
    const p = await openPanel(br, width, { panelBody: { ...k, engineAnswer: ea0 }, optionBody: v => lib.picks[opts.findIndex(x => String(x.value) === String(v.value) && x.dimension === v.dimension)] });
    const snap = () => p.evaluate(() => ({ chips: Array.from(document.querySelectorAll(".mcdrawer .md-chip")).map(c => ({ t: c.textContent, btn: c.tagName === "BUTTON" })), rows: document.querySelectorAll(".mcdrawer .md-row").length, head: (document.querySelector(".mcdrawer .md-s") || {}).textContent || "" }));
    const a = await snap();
    ok(JSON.stringify(a.chips.map(c => c.t)) === JSON.stringify(ea0.chipLines) && a.chips[i0].btn === true && a.chips[a.chips.length - 1].btn === false, `thin band at ${width}: the chips are the engine's short form, the thin band is a button and the band with no sales is plain text`);
    await p.evaluate(i => document.querySelector(`.mcdrawer .md-chip[data-mdopt="${i}"]`).click(), i0); await wait(800);
    const b = await snap();
    ok(b.rows === opts[i0].n && b.head === ea.pickLines[i0] && !/\$\d/.test(b.head), `thin band at ${width}: a pick lists its ${opts[i0].n} sales under "${b.head}" with no figures (${b.rows} printed)`);
    await p.close();
  }
}

// A KILOMETRE LISTING PRINTS ITS KM AND THE ENGINE'S MILES (Lane E, Nov 3 2026; the red M3 card: "61,000 km" beside a line in miles). The engine reads a km listing's mileage as miles (lib/live/liveTrust.js converts, facts.miles) and reads
// the bands and lines in miles; the card kept only the km. The card now carries both numbers the engine returns (km, kmMiles) and prints "61,000 km (37,900 miles)".
{ const { cardOf } = await imp("api/buySearch.js"), Lk = await imp("lib/live/search.js", "km"), kr = row(7, { listing_title: "1995 BMW M3 Coupe 61,000 km", make: "BMW", model: "M3", year: 1995, mileage: 37900, source: "bringatrailer" }), kf = Lk.listingFacts(kr), kc = cardOf({ r: kr, facts: kf, gen: null, unknown: [] });
  ok(kc.km === 61000 && kc.miles === null && kc.kmMiles > 37000 && kc.kmMiles < 38500, `km listing: the card carries the km the listing states (${kc.km}) and the engine's miles (${kc.kmMiles})`);
  const code = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), cl = JSON.parse(/^const CLIENT = (".*");$/m.exec(code)[1]);
  const ml = new Function("num", "notUS", "cityOf", "awayWords", "esc", cl.slice(cl.indexOf("  function metaLine("), cl.indexOf("\n  }\n", cl.indexOf("  function metaLine(")) + 4) + "\nreturn metaLine;")(n => Math.round(Number(n)).toLocaleString("en-US"), () => false, () => "", () => "", x => String(x));
  const line = ml({ km: kc.km, kmMiles: kc.kmMiles, miles: kc.miles, location: "Austin, TX" }).replace(/<[^>]+>/g, "");
  ok(/61,000 km \([\d,]+ miles\)/.test(line), `km listing: the card prints both ("${line}")`); }
// (6b) THE FULL MARKET CHECK PAGE, opened from that link: the VIN decodes to make and year with no model (the case that used to land on a model question or a bare model), the card's car text rides beside it,
// and Market Check reads the car the card showed. Rendered page, the VIN lookup answered with a partial decode, the first thing the page asks the engine to read is captured.
{
  const html = await (await imp("scripts/e98Render.mjs")).pageHtml("api/marketCheck.js", "/market-check", false), p = await br.newPage(), asked = [];
  await p.setViewport({ width: 1440, height: 900 }); await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; }); await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/vehicleIdentity") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "needs_confirmation", vehicle: { year: 2016, make: "Porsche", vin: "WP0AF2A97GS183456" }, clarification: { kind: "vin_confirmation", question: "That VIN decodes to a 2016 Porsche. Which model?", modelOptions: [{ label: "911", value: "911" }, { label: "Cayman", value: "Cayman" }] } }) });
    if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { asked.push(r.postData() || ""); return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
    if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(root, loc))) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(root, loc), "utf8") });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/market-check?vin=WP0AF2A97GS183456&from=card&car=2016-porsche-911-gt3-rs", { waitUntil: "networkidle2" }).catch(() => {}); await wait(2500);
  const asksModel = await p.evaluate(() => /Which model/i.test(document.body.innerText));
  ok(asked.length > 0 && asked.some(b => /gt3[ -]?rs/i.test(b)) && !asksModel, `Market Check opened from a card's link with a VIN reads the card's car ("2016 porsche 911 gt3 rs"), never a model question or the bare model (asked ${asked.length}x; model question shown: ${asksModel})`);
  await p.close();
}
await br.close();
if (process.env.DBG) console.log("DBG thin", JSON.stringify({ market: out.thin && out.thin.market && { kind: out.thin.market.kind, count: out.thin.market.count }, tier: out.thin && out.thin.engineAnswer && out.thin.engineAnswer.tier, cards: out.thin && out.thin.engineAnswer && out.thin.engineAnswer.cards && out.thin.engineAnswer.cards.length, basis: out.thin && out.thin.engineAnswer && out.thin.engineAnswer.basisLine, still: out.thin && out.thin.salesStill }));
console.log(`popupSalesCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
