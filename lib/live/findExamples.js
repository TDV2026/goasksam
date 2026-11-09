// FIND EXAMPLES (Lane B, Nov 2026, the Find empty state, CREW ONLY, NOT LIVE until Sam says so in writing). Up to three real live auction cars, chosen by the engine, for the Find page's empty state.
//   findExamples(env, req) -> [ { title, platform, url, photo, live: true, endsAt, findUrl, priceLabel, timeLine, soldBefore } ] (1 to 3 items) or null. Lane E's names and shapes (docs/lane-notes.md, cf59a345).
// RULES: the featuredHistory eligibility (the car is live at selection AND at every serve, by a keyed read; a real current photo; a real https link; a price the trust layer can state in dollars, never current_bid_usd on its own),
// DIFFERENT MAKES, VISUAL VARIETY (decade, colour, body), at least one soldBefore when one is available, STABLE while live (a stored car is kept while it passes every rule again and only an ended or failed car is replaced), and
// soldBefore is true ONLY when the car's VIN has a COMPLETED sale confirmed by the featuredHistory rules (the earlier record's sale link and photo are checked; a listed-only earlier record is false). The price line and the time line are
// reason table sentences (lib/reasonWords.js tasks.demo_current_bid, demo.time_left): the page prints them as sent. ZERO OldCarsData. Stored under STORE_KEY ("crew_find_examples", a crew-only key), refreshed by the 15 minute pull
// (api/pullLive.js), which answers a word, never a car. CREW GATE: null without the signed crew cookie (a plain gas_crew=ok, a forged or tester cookie included). Kill switch: FIND_EXAMPLES=0.
import { withClock } from "./withClock.js";
import { supabaseSelect, supabaseInsert, supabaseDelete } from "../_supabase.js";
import { vinAppearances, houseName } from "../../api/_historyData.js";
import { isCrewRequest } from "../_crew.js";
import { evaluateCandidate, genuinePhoto, liveNow, monthYear } from "./featuredHistory.js";
import { reasonLine } from "../reasonWords.js";
import { choosePhoto, photoCandidates, headPhoto } from "./photoRule.js";

export const STORE_KEY = "crew_find_examples";
export const STORE_V = 1;
export const MAX_ITEMS = 3;
export const MAX_CHECK_AGE_MS = 90 * 60 * 1000;
export const SWEEP_EVERY_MS = 30 * 60 * 1000;
export const MIN_LEFT_MS = 30 * 60 * 1000;
export const MAX_HISTORY_READS = 80;
export const LIVE_SELECT = "live_listings?status=eq.live&photo_url=not.is.null&select=*";
const norm = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ""));

export const defaultDeps = () => ({
  now: () => Date.now(),
  select: (env, q) => supabaseSelect(env, q),
  write: (env, row) => supabaseInsert("app_config", [row], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=key"),
  clear: (env, key) => supabaseDelete(env, `app_config?key=eq.${key}`),
  appearances: (env, vin) => vinAppearances(env, vin),
  head: headPhoto,   // the photo rule (lib/live/photoRule.js): a 200 under 600 KB at selection
  urlStatus: async u => { try { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000); const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: c.signal }); clearTimeout(t); return r.status; } catch { return null; } },
  facts: async row => (await import("./search.js")).listingFacts(row)
});

// the title the Find card names the car by: year, make, model
export const titleOf = row => [row.year, row.make, row.model].filter(Boolean).join(" ").trim() || String(row.listing_title || "").trim();
// ONE eligibility for every live demo card: live (minLeftMs of auction left at selection, none at a serve), a real current photo, a real link, a make and a model, and a price the trust layer states in dollars
export function eligibleRow(row, facts, now, minLeftMs = 0) {
  if (!liveNow(row, now) || Date.parse(row.end_time) - now < minLeftMs) return false;
  if (!genuinePhoto(row.photo_url) || !isHttps(row.url)) return false;
  if (!String(row.make || "").trim() || !String(row.model || "").trim()) return false;
  const p = num(facts && facts.priceUsd);
  return p > 0 && facts.priceState !== "suspect" && facts.priceState !== "unconverted";
}
export async function liveRow(env, id, d) {
  const rows = await d.select(env, `live_listings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return Array.isArray(rows) ? (rows[0] || false) : null;   // null: unreadable; false: not there
}
export async function candidatePool(env, d, now) {
  const rows = await d.select(env, LIVE_SELECT + `&end_time=gt.${encodeURIComponent(new Date(now + MIN_LEFT_MS).toISOString())}&order=end_time.desc&limit=400`);
  return Array.isArray(rows) ? rows : null;
}
// soldBefore: true ONLY on a VIN with a completed sale the featuredHistory rules confirm (their evidence link and photo checked)
export async function soldBefore(env, row, d, now) {
  if (String(row.vin_norm || "").length < 6) return false;
  const a = await d.appearances(env, row.vin_norm).catch(() => null);
  if (!a || !a.ok) return false;
  const apps = (a.appearances || []).map(x => ({ ...x, vinNorm: a.vinNorm }));
  const pre = evaluateCandidate(row, apps, { nowMs: now });
  if (!pre.ok) return false;
  const us = {}; for (const u of [pre.featured.previous.url, pre.featured.previous.photo]) us[u] = await d.urlStatus(u);
  const e = evaluateCandidate(row, apps, { nowMs: now, urlStatus: us });
  return !!(e.ok && e.featured.kind === "sold");
}
export function itemOf(row, facts, sold, now, photo = null) {
  const title = titleOf(row), left = Date.parse(row.end_time) - now;
  return { title, platform: houseName(row.source), url: row.url, photo: photo || row.photo_url, live: true, endsAt: new Date(row.end_time).toISOString(), findUrl: "/find?q=" + encodeURIComponent(title),
    priceLabel: reasonLine("tasks.demo_current_bid", { price: facts.priceUsd }), timeLine: reasonLine("demo.time_left", { ms: left }), soldBefore: !!sold };
}
async function readStore(env, d, key = STORE_KEY) {
  const rows = await d.select(env, `app_config?key=eq.${key}&select=value&limit=1`);
  if (!Array.isArray(rows)) return { failed: true };
  const v = rows[0] && rows[0].value;
  return { value: v && typeof v === "object" ? v : null };
}
// the choice among candidates: a sold-before car first while none is chosen, then the most different in decade, colour and body from what is chosen, later end first, id last (deterministic)
export function chooseNext(cands, chosen, tie = null) {
  const used = { dec: new Set(chosen.map(c => Math.floor((Number(c.row.year) || 0) / 10))), col: new Set(chosen.map(c => c.facts.colour || "")), body: new Set(chosen.map(c => c.facts.body || "")), plat: new Set(chosen.map(c => norm(houseName(c.row.source)))) };
  const haveSold = chosen.some(c => c.sold), makes = new Set(chosen.map(c => norm(c.row.make)));
  const score = c => (!haveSold && c.sold ? 1000 : 0) + (used.plat.has(norm(houseName(c.row.source))) ? 0 : 20) + (used.dec.has(Math.floor((Number(c.row.year) || 0) / 10)) ? 0 : 10) + (c.facts.colour && !used.col.has(c.facts.colour) ? 5 : 0) + (c.facts.body && !used.body.has(c.facts.body) ? 3 : 0);
  return cands.filter(c => !makes.has(norm(c.row.make))).sort((a, b) => score(b) - score(a) || (tie ? tie(a, b) : 0) || Date.parse(b.row.end_time) - Date.parse(a.row.end_time) || String(a.row.id).localeCompare(String(b.row.id)))[0] || null;
}

// SERVE. Crew only. A stored pick older than MAX_CHECK_AGE_MS is never served; each car is read again by a keyed read at the serve and dropped if it is not live right now.
export async function findExamples(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FIND_EXAMPLES === "0" || !isCrewRequest(reqOrCookie)) return null;
  const s = await readStore(env, d), st = s.value, now = d.now();
  if (!st || st.v !== STORE_V || !Array.isArray(st.entries) || !(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS)) return null;
  const items = [], seen = new Set();
  for (const e of st.entries.slice(0, MAX_ITEMS)) {
    const row = await liveRow(env, e.listingId, d);
    if (!row) continue;
    const facts = await Promise.resolve(d.facts(row));
    if (!eligibleRow(row, facts, now) || seen.has(norm(row.make))) continue;
    seen.add(norm(row.make)); items.push(itemOf(row, facts, e.sold, now, e.photo || null));
  }
  return items.length ? items : null;
}

// THE DAILY PICK (Lane B, Nov 8 2026, per Sam). Once every 24 hours (the Pacific date, stored as pickDate under the crew key) the three are chosen, the same for every visitor, by rules in this order:
//   1 live auctions only (eligibleRow: live now with time left, a real first photo, a real link, a year make and model, a price the trust layer states in dollars)
//   2 one car from Bring a Trailer, one from Cars & Bids, one from a third supported platform; when a platform has none: three different platforms, then three different makes
//   3 three different makes, always
//   4 varied and photogenic (decade, colour, body; the photo and the identifying title are eligibility)
//   5 at least one car whose VIN has a confirmed earlier sale, when one is available
//   and never the three newest listings. Deterministic: no clock or randomness in the choice; ties break on a hash of the pick date and the listing id, so the same pool on the same day gives the same three.
export const SLOT_PLATFORMS = ["bringatrailer", "carsandbids"];
export const ptDateKey = ms => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const hashOf = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const pickable = row => Number(row.year) > 1885 && !!String(row.make || "").trim() && !!String(row.model || "").trim();
const slotOf = row => { const s = String(row.source || "").toLowerCase(); return s === "bringatrailer" ? "bringatrailer" : s === "carsandbids" ? "carsandbids" : "third"; };
const newestKey = r => [Date.parse(r.first_seen || r.created_at || "") || 0, Number(r.id) || 0];
export function newestThree(cands) { return cands.slice().sort((a, b) => { const x = newestKey(a.row), y = newestKey(b.row); return y[0] - x[0] || y[1] - x[1]; }).slice(0, 3).map(c => c.row.id); }
// locked: cars already chosen and still live (an hourly replacement keeps them); the open slots are filled by the same rules
export function pickDaily(cands, locked, dateKey) {
  const chosen = locked.slice(), tie = (a, b) => hashOf(dateKey + ":" + a.row.id) - hashOf(dateKey + ":" + b.row.id);
  const all = cands.filter(c => pickable(c.row) && !chosen.some(k => String(k.row.id) === String(c.row.id)));
  // never the three newest listings: they are set aside while the rest can still make three cars of three makes
  const skip = new Set(newestThree(cands).map(String)), rest = all.filter(c => !skip.has(String(c.row.id)));
  const makesIn = list => new Set([...list, ...chosen].map(c => norm(c.row.make))).size;
  const pool = makesIn(rest) >= MAX_ITEMS ? rest : all;
  const take = subset => { const next = chooseNext(subset.filter(c => !chosen.includes(c)), chosen, tie); if (next) chosen.push(next); return !!next; };
  const has = slot => chosen.some(c => slotOf(c.row) === slot);
  // 2 the slots: Bring a Trailer, Cars & Bids, a third platform
  for (const slot of ["bringatrailer", "carsandbids", "third"]) if (chosen.length < MAX_ITEMS && !has(slot)) take(pool.filter(c => slotOf(c.row) === slot));
  // a slot with no car: three different platforms, then three different makes
  while (chosen.length < MAX_ITEMS) { const used = new Set(chosen.map(c => norm(c.row.source))); if (!take(pool.filter(c => !used.has(norm(c.row.source)))) && !take(pool)) break; }
  // 5 a car with a confirmed earlier sale: chooseNext puts one first in its slot whenever none is chosen yet (sold-before bonus), so one is among the three whenever the rules allow it
  return chosen;
}

// REFRESH (the cron, never a visitor; the first quarter of every hour, day and night, and with each live pull). Confirms each stored car is still live by a keyed read (status and end time), replaces an ended, withdrawn or no longer eligible one at once by the
// same rules, and on a new Pacific date picks all three afresh. Zero OldCarsData. A failure stores nothing.
export async function refreshFindExamples(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps }, now = d.now(), iso = new Date(now).toISOString(), dateKey = ptDateKey(now);
  if (process.env.FIND_EXAMPLES === "0") return { stored: null, why: "off" };
  const drop = async why => { await Promise.resolve(d.clear(env, STORE_KEY)).catch(() => {}); return { stored: null, why }; };
  try {
    const s = await readStore(env, d);
    if (s.failed) return await drop("store_unreadable");
    const st = s.value, kept = [], newDay = !st || st.pickDate !== dateKey;
    if (!newDay && st && st.v === STORE_V && Array.isArray(st.entries)) {
      for (const e of st.entries.slice(0, MAX_ITEMS)) {
        const row = await liveRow(env, e.listingId, d);
        if (row === null) return await drop("live_unreadable");
        if (!row) continue;   // withdrawn or gone: replaced below
        const facts = await Promise.resolve(d.facts(row));
        if (eligibleRow(row, facts, now) && pickable(row) && !kept.some(k => norm(k.row.make) === norm(row.make))) { const photo = e.photo || await choosePhoto(photoCandidates(row), d.head); if (photo) kept.push({ row, facts, sold: !!e.sold, photo }); }
      }
    } else if (!newDay && st && st.none && Date.parse(st.sweptAt) > now - SWEEP_EVERY_MS) return { stored: null, why: "swept_recently" };
    const funnel = { live: 0, eligible: 0, withVin: 0, soldBefore: 0, kept: kept.length, chosen: 0 };
    let chosen = kept.slice();
    if (chosen.length < MAX_ITEMS) {
      const live = await candidatePool(env, d, now);
      if (!live) return await drop("live_unreadable");
      funnel.live = live.length;
      const have = new Set(chosen.map(c => String(c.row.id))), cands = [];
      for (const row of live) { if (have.has(String(row.id))) continue; const facts = await Promise.resolve(d.facts(row)); if (eligibleRow(row, facts, now, MIN_LEFT_MS)) cands.push({ row, facts, sold: false }); }
      funnel.eligible = cands.length; funnel.withVin = cands.filter(c => String(c.row.vin_norm || "").length >= 6).length;
      // the earlier sale is read for the cars with a VIN only, a bounded number of them, in a fixed order (zero OldCarsData: the archive)
      let reads = 0; for (const c of cands.slice().sort((a, b) => hashOf(dateKey + ":" + a.row.id) - hashOf(dateKey + ":" + b.row.id))) { if (reads >= MAX_HISTORY_READS || String(c.row.vin_norm || "").length < 6) continue; reads++; c.sold = await soldBefore(env, c.row, d, now); if (c.sold) funnel.soldBefore++; }
      // THE PHOTO RULE (Nov 8 2026): each newly picked car's first photo is HEADed (a 200 under 600 KB), else its next photo, else the car is skipped and the pick is made again without it
      let pool = cands.concat(kept), skipped = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        chosen = pickDaily(pool, kept, dateKey);
        const bad = [];
        for (const c of chosen) { if (c.photo) continue; c.photo = await choosePhoto(photoCandidates(c.row), d.head); if (!c.photo) bad.push(c); }
        if (!bad.length) break;
        skipped += bad.length; pool = pool.filter(x => !bad.includes(x)); chosen = kept.slice();
      }
      funnel.photoSkipped = skipped;
      funnel.chosen = chosen.length - kept.length;
    }
    if (!chosen.length) { await d.write(env, { key: STORE_KEY, value: { none: true, sweptAt: iso, pickDate: dateKey } }); return { stored: null, why: "none_eligible", funnel }; }
    const value = { v: STORE_V, entries: chosen.map(c => ({ listingId: c.row.id, sold: !!c.sold, photo: c.photo || null })), pickDate: newDay ? dateKey : st.pickDate, selectedAt: (!newDay && st && st.selectedAt && kept.length ? st.selectedAt : iso), checkedAt: iso };
    await d.write(env, { key: STORE_KEY, value });
    return { stored: value, why: newDay ? "picked" : kept.length === chosen.length && kept.length ? "kept" : "replaced", funnel };
  } catch (e) {
    if (process.env.FX_DEBUG) console.error(e);
    return await drop("error");
  }
}

// FALLBACK (Lane B, Nov 8 2026): when findExamples is null (the pull has not run since the last live car ended, or no live car passes), the Find page still shows three recent COMPLETED sales of Porsche 911s from the archive, each a record, never a live
// car. findExamplesFallback(env, req) -> [ { title, platform, url, photo, live: false, soldAt, dateLine, priceLabel, findUrl, fallback: true } ] (up to 3) or null. Crew gated like the live field, same kill switch. The figures are the archive's own: priceLabel is the
// sale price in dollars (sale_price_usd, never converted here) through the reason table ("Sold for $X"), dateLine the sale month ("Sold October 2026"). Stored under FALLBACK_KEY and rebuilt by the pull or, when the key is absent or a day old, by the first crew read
// (a bounded archive read, written back). A failed read keeps the last stored items; nothing is ever invented to fill the three.
export const FALLBACK_KEY = "crew_find_examples_fallback";
export const FALLBACK_V = 1;
export const FALLBACK_MAX_AGE_MS = 24 * 3600 * 1000;
export const FALLBACK_WINDOW_DAYS = 180;
const NOT_SOLD = /not.?sold|reserve.?not|no.?sale|unsold|withdrawn|cancel|passed|failed/i;
export const FALLBACK_SELECT = days => `sales_archive?make=eq.Porsche&listing_title=ilike.*911*&sale_price_usd=gt.0&project_flag=is.null&sale_date=gte.${new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)}&order=sale_date.desc&select=id,source_slug,mileage,vin_norm,transmission,exterior_color,body_style,sale_date,platform,listing_title,year,make,model,sale_price_usd,img:raw_record->>featured_image_url,url:raw_record->>url,url2:raw_record->>source_url,st:raw_record->>status,st2:raw_record->>auction_status&limit=80`;
export function saleItemOf(r) {
  const title = [r.year, r.make, r.model].filter(Boolean).join(" ").trim() || String(r.listing_title || "").trim(), price = num(r.sale_price_usd), url = r.url || r.url2, when = monthYear(r.sale_date);
  const isPorsche911 = /^porsche$/i.test(r.make) && /911/.test(String(r.listing_title || "") + " " + title);
  if (!title || !isPorsche911 || !(price > 0) || !when || !genuinePhoto(r.img) || !isHttps(r.img) || !isHttps(url) || !String(r.platform || "").trim()) return null;
  if (NOT_SOLD.test(String(r.st || "") + " " + String(r.st2 || ""))) return null;
  return { title, platform: String(r.platform).trim(), url, photo: r.img, live: false, soldAt: String(r.sale_date).slice(0, 10), dateLine: reasonLine("demo.sold_date", { when }), priceLabel: reasonLine("demo.sold_for", { price }), findUrl: "/find?q=" + encodeURIComponent(title), fallback: true };
}
// the three: newest first, a different platform and a different car (title) each while one is available, then the newest left
export function chooseSaleRows(rows) { const by = new Map(chooseSales(rows).map((it, i) => [it.url, i])); return (rows || []).filter(r => by.has(r.url || r.url2)).sort((a, b) => by.get(a.url || a.url2) - by.get(b.url || b.url2)); }
export function chooseSales(rows) {
  const items = (rows || []).map(saleItemOf).filter(Boolean), out = [], plats = new Set(), titles = new Set();
  for (const it of items) { if (out.length >= MAX_ITEMS) break; if (plats.has(norm(it.platform)) || titles.has(norm(it.title))) continue; out.push(it); plats.add(norm(it.platform)); titles.add(norm(it.title)); }
  for (const it of items) { if (out.length >= MAX_ITEMS) break; if (out.some(o => o.url === it.url)) continue; out.push(it); }
  return out;
}
export async function refreshFindFallback(env, deps = {}) {
  const d = { ...defaultDeps(), ...deps }, now = d.now();
  try {
    let rows = null;
    for (const days of [FALLBACK_WINDOW_DAYS, 730]) { rows = await d.select(env, FALLBACK_SELECT(days)); if (!Array.isArray(rows)) return { stored: null, why: "archive_unreadable" }; if (chooseSales(rows).length >= MAX_ITEMS) break; }
    const items = chooseSales(rows);
    if (!items.length) return { stored: null, why: "none_found" };   // the last stored items stay
    const sales = chooseSaleRows(rows).map(r => ({ id: r.id, source_slug: r.source_slug, mileage: r.mileage, vin_norm: r.vin_norm, transmission: r.transmission || null, exterior_color: r.exterior_color || null, body_style: r.body_style || null, sale_date: r.sale_date, listing_title: r.listing_title, year: r.year, make: r.make, model: r.model, sale_price_usd: r.sale_price_usd, img: r.img, url: r.url || r.url2, platform: r.platform }));
    const value = { v: FALLBACK_V, items, sales, builtAt: new Date(now).toISOString() };
    await d.write(env, { key: FALLBACK_KEY, value });
    return { stored: value, why: "built" };
  } catch (e) { return { stored: null, why: "error" }; }
}
export async function findExamplesFallback(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FIND_EXAMPLES === "0" || !isCrewRequest(reqOrCookie)) return null;
  const now = d.now();
  let s = await readStore(env, d, FALLBACK_KEY), st = s.value;
  const fresh = x => x && x.v === FALLBACK_V && Array.isArray(x.items) && Date.parse(x.builtAt) > now - FALLBACK_MAX_AGE_MS;
  if (!fresh(st)) { const r = await refreshFindFallback(env, d); if (r.stored) st = r.stored; }
  // served as stored, each item checked again against the shape: a record, never a live car
  const items = st && st.v === FALLBACK_V && Array.isArray(st.items) ? st.items.filter(it => it && it.live === false && it.fallback === true && genuinePhoto(it.photo) && isHttps(it.url) && /^Sold for \$[\d,]+$/.test(String(it.priceLabel)) && /^Sold [A-Z][a-z]+ \d{4}$/.test(String(it.dateLine))).slice(0, MAX_ITEMS) : [];
  return items.length ? items : null;
}

// ---- THE ENGINE CARD SHAPES (Lane B, Nov 8 2026, Lane E's refine8 SHAPES B): the page draws Find's own card and the Task row, so the fields carry the engine objects those components read. A card is the object /api/buySearch returns for one listing (api/buySearch.js
// enrichFast: bid with its time, source and time label, tags, chips, the range line, sam_lines, history_url); a completed sale is the SAME object for the sold car with end_time in the past, no bid, and card.sold = { price: "$98,500", when: "October 12, 2026" } (reason table
// demo.sold_price, demo.sold_when). Nothing is computed here: the card is the engine's own, and a car whose card cannot be built is dropped, never drawn thin.
export const genuinePhotoUrl = u => genuinePhoto(u) && isHttps(u);
export const CARD_WAIT_MS = 9000;
export async function liveCardOf(env, row, d, deps = {}) {
  try {
    const enrich = deps.enrich || (await import("../../api/buySearch.js")).enrichFast, facts = await Promise.resolve(d.facts(row));
    const c = await withClock(enrich(env, { r: row, facts, distance: null, gen: null, unknown: [] }), CARD_WAIT_MS);
    return c && typeof c === "object" ? c : null;
  } catch { return null; }
}
// the live row shape a sold car is read through: the archive sale in the columns the card reads, ended, no bid, no VIN (the card's history reads are for a car still for sale)
export const rowOfSale = s => ({ id: s.id, source: s.source_slug, url: s.url, listing_title: s.listing_title, year: s.year, make: s.make, model: s.model, vin_norm: null, mileage: s.mileage, mileage_unit: "miles", end_time: new Date(Date.parse(String(s.sale_date).slice(0, 10) + "T00:00:00Z")).toISOString(), current_bid: 0, current_bid_usd: 0, currency: "USD", photo_url: s.img, status: "ended", location: null, country: "US", transmission: s.transmission || null, exterior_color: s.exterior_color || null, body: s.body_style || null });
export async function soldCardOf(env, sale, d, deps = {}) {
  try {
    if (!sale || !(Number(sale.sale_price_usd) > 0) || !sale.source_slug || !isHttps(sale.url) || !genuinePhoto(sale.img)) return null;
    const row = rowOfSale(sale), enrich = deps.enrich || (await import("../../api/buySearch.js")).enrichFast, facts = await Promise.resolve(d.facts(row));
    // THE SAME MARKET BLOCK A LIVE CARD GETS (Nov 8 2026): the engine's read for this car's spec (the stored Market Check answer for its family, read the way a live card's is), so the card carries the range line, the chips and the SAM lines; only the bid badge differs (SOLD FOR). A read that is not back is not replaced by "No sales yet": the card is dropped.
    const readMarket = deps.market || (async (e, r, f) => (await import("./search.js")).listingMarket(e, r, f, { notTracked: true }));
    const market = await withClock(Promise.resolve(readMarket(env, row, facts)), CARD_WAIT_MS);
    if (!market || ["pending", "none", "not_tracked", "unmatched"].includes(market.kind)) return null;
    const c = await withClock(enrich(env, { r: row, facts, distance: null, gen: null, unknown: [], market }), CARD_WAIT_MS);
    if (!c || typeof c !== "object") return null;
    const when = reasonLine("demo.sold_when", { date: sale.sale_date });
    if (!when) return null;
    return { ...c, current_bid_usd: 0, bid_at: null, sold: { price: reasonLine("demo.sold_price", { price: Number(sale.sale_price_usd) }), when } };
  } catch { return null; }
}
// the stored sales (read through like findExamplesFallback), as engine cards of completed sales
export async function storedSales(env, d) {
  const now = d.now();
  let s = await readStore(env, d, FALLBACK_KEY), st = s.value;
  if (!(st && st.v === FALLBACK_V && Array.isArray(st.sales) && Date.parse(st.builtAt) > now - FALLBACK_MAX_AGE_MS)) { const r = await refreshFindFallback(env, d); if (r.stored) st = r.stored; }
  return st && st.v === FALLBACK_V && Array.isArray(st.sales) ? st.sales : [];
}
export async function saleCards(env, d, deps, n) {
  const out = []; for (const sale of await storedSales(env, d)) { if (out.length >= n) break; const card = await soldCardOf(env, sale, d, deps); if (card) out.push({ card }); } return out;
}
// the live cars findExamples would serve right now (the same keyed reads and rules), as rows
async function liveExampleRows(env, d, now) {
  const s = await readStore(env, d), st = s.value, rows = [], seen = new Set();
  if (!st || st.v !== STORE_V || !Array.isArray(st.entries) || !(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS)) return rows;
  for (const e of st.entries.slice(0, MAX_ITEMS)) { const row = await liveRow(env, e.listingId, d); if (!row) continue; const facts = await Promise.resolve(d.facts(row)); if (!eligibleRow(row, facts, now) || seen.has(norm(row.make))) continue; seen.add(norm(row.make)); rows.push(e.photo ? { ...row, photo_url: e.photo } : row); }
  return rows;
}
// THE FIELD: findExamplesField(env, req) -> [ { card } ] (three live cars), or { cars: [ { card } ], fallback: [ { card } ] } (the live cars then completed sales to make up to three), or null. Crew gated, same kill switch.
export async function findExamplesField(env, reqOrCookie, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  if (process.env.FIND_EXAMPLES === "0" || !isCrewRequest(reqOrCookie)) return null;
  const now = d.now(), rows = await liveExampleRows(env, d, now), cars = [];
  for (const row of rows) { const card = await liveCardOf(env, row, d, deps); if (card && Date.parse(card.end_time) > now && !card.sold) cars.push({ card }); }
  if (cars.length >= MAX_ITEMS) return cars.slice(0, MAX_ITEMS);
  const fallback = await saleCards(env, d, deps, MAX_ITEMS - cars.length);
  return cars.length || fallback.length ? { cars, fallback } : null;
}
