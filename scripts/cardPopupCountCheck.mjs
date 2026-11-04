// A CARD AND ITS POPUP COUNT ONE POOL (Lane B, Nov 3 2026, job lane-b-genline; live on Find: the 1989 911 Speedster card said "10 sales since Nov 2024", its popup "Based on 18 sales since November 2024").
// CAUSE: findAnswerOf makes the sales NEAR THE LISTING'S MILES the card's headline (basis "band": that band's range and count) when the listing states its mileage and the band reaches a range, but the popup (panelOf)
// read the whole pool for a card with no option of its own, so one car carried two counts and two ranges. WHO ELSE: every Find card whose listing states a mileage and whose band reaches 8 sales (any car, any pool), and the
// Tasks card (same kit); a card on a named option opens on it through the pick, a card on the whole pool opens on the whole pool, and both are held here too so the class cannot come back by another door.
// This check runs the card (cardSlotsOf) and the popup (panelOf, the pick when the card names a band) for each kind of card and fails on ANY difference in count or range between what the card prints and what the popup
// states and carries. It must fail on main (the near-miles card).   node scripts/cardPopupCountCheck.mjs [repo root]
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

const C = await imp("lib/live/cardSlots.js");
const mkS = (year, model, title, price, miles) => { const r = sale("Porsche", year, title, price, model); r.raw_record.mileage = String(miles); return r; };
const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const numOf = t => { const m = /\b(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+sales?\b/i.exec(String(t || "")); return m ? (/^\d/.test(m[1]) ? Number(m[1].replace(/,/g, "")) : words[m[1].toLowerCase()]) : null; };
const dollars = t => (String(t || "").match(/\$[\d,]+/g) || []).map(x => Number(x.replace(/[$,]/g, "")));
let CASE = 0;
const compare = async (name, listing, seedSales) => {
  SALES.length = 0; STORE.clear(); seedSales();
  const L = await imp("lib/live/search.js", "c" + ++CASE), f = L.listingFacts(listing);
  let out = null; for (let i = 0; i < 8; i++) { const o = await L.panelOf(env, listing, f); if (o && o.market && o.market.kind !== "pending") { out = o; break; } await wait(1500); }
  if (!out) { ok(false, `${name}: the card's market did not come back`); return; }
  const slots = C.cardSlotsOf({ market: out.market, miles: listing.mileage }), band = slots.cardBand;
  let pop = out;
  if (band) pop = await L.panelOf(env, listing, f, { dimension: band.dimension, value: band.value });
  const ea = pop && pop.engineAnswer;
  const cardN = numOf(slots.cardLabel), cardRange = dollars(slots.cardHeadline);
  ok(cardN > 0 && cardRange.length === 2, `${name}: the card prints a count and a range (${slots.cardLabel} | ${slots.cardHeadline})`);
  ok(!!ea && Array.isArray(ea.cards) && ea.cards.length > 0, `${name}: the popup carries sales`);
  if (!ea || !ea.cards) return;
  const popN = numOf(ea.basisLine || ""), cards = ea.cards.length;
  ok(popN === cardN, `${name}: the popup states the card's count (card ${cardN}; popup says "${ea.basisLine}")`);
  ok(cards === cardN, `${name}: the popup carries the card's sales (card ${cardN}; popup lists ${cards})`);
  const prices = ea.cards.map(c => c.price).filter(x => x > 0), lo = Math.min(...prices), hi = Math.max(...prices);
  ok(cardRange[0] >= lo && cardRange[1] <= hi, `${name}: the card's range ${cardRange.join(" to ")} sits inside the popup's sales (${lo} to ${hi})`);
};
const night = (o = {}) => row(1, { make: "Porsche", model: "911", year: 1989, listing_title: "1989 Porsche 911 Speedster", mileage: 28000, source: "bringatrailer", current_bid_usd: 190000, ...o });
// (1) THE LIVE CASE: two generations at about one price, the listing states 28,000 miles; only some of the sales are near it
const speedsters = () => { for (let i = 0; i < 10; i++) SALES.push(mkS(1989, "911", "1989 Porsche 911 Carrera Speedster", 170000 + i * 4000, 8000 + i * 3000)); for (let i = 0; i < 8; i++) SALES.push(mkS(1994, "911", "1994 Porsche 911 Speedster", 175000 + i * 5000, 4000 + i * 2500)); };
await compare("1989 Speedster, 28,000 miles stated (the near-miles card)", night(), speedsters);
// (2) the same car, no mileage stated: the card and the popup both read the whole pool
await compare("1989 Speedster, no mileage stated (the whole-pool card)", night({ mileage: null }), speedsters);
// (3) another car, another pool: a 2016 GT3 RS with 3,000 miles among 19 sales at every mileage
const gt3 = () => { for (let i = 0; i < 19; i++) SALES.push(mkS(2016, "911", "2016 Porsche 911 GT3 RS", 150000 + i * 2500, 1000 + i * 2200)); };
await compare("2016 GT3 RS, 3,000 miles stated", row(2, { mileage: 3000 }), gt3);
await compare("2016 GT3 RS, 30,000 miles stated", row(3, { mileage: 30000 }), gt3);
console.log(fail ? `\ncardPopupCountCheck: ${fail} FAIL` : `\ncardPopupCountCheck: ${pass} pass, 0 FAIL`);
process.exit(fail ? 1 : 0);
