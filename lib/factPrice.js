// VALUE DRIVER MINING, THE PRICE READ (Lane B, Nov 17 2026, lane-b-factmine; order bc85). task=factprice: READ ONLY, SOLD LISTINGS ONLY. For each canonical topic stated on THIRTY OR MORE sold listings and not stated on thirty or more: the sold prices of the listings that
// state it and of those that do not, compared inside strata of the same mileage band, model year group, variant and body, gearbox, sale year and source, with the listing's length (characters the miner read, in terciles) as a control. The effect is the
// listing-weighted mean, over strata that hold both kinds, of the median sold price with the topic against the median without (in percent). The listings are split in two by a hash of the listing id: the effect is computed on each half, and it is CONFIRMED only when
// the second half agrees in direction and at least half the size of the first and each half has enough matched listings. Output: counts, medians, the effect and confirmed or not. Wording is observational: sold for, never adds or is worth.
import { createHash } from "node:crypto";
import { MINE_FAMILIES, variantOf, assertCountsOnly } from "./factMine.js";
import { parseReportCall, loadMined, canonOf, kindsOf } from "./factReport.js";

export const MIN_LISTINGS = 30, MIN_MATCHED_PER_HALF = 8, MIN_STRATA = 3, AGREE_FRACTION = 0.5, MIN_EFFECT = 0.02;   // an effect under 2 percent is noise at these counts: it is reported, never confirmed
const median = a => { const s = a.filter(x => Number.isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const halfOf = id => parseInt(createHash("sha1").update(String(id)).digest("hex").slice(0, 8), 16) % 2;
const miles = v => { const n = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
export const milesBand = m => m == null ? "unknown" : m < 25000 ? "under25k" : m < 50000 ? "25to50k" : m < 90000 ? "50to90k" : "90kplus";
export const yearGroup = (family, y) => { y = Number(y); if (!(y > 0)) return "unknown"; return family === "e46_m3" ? (y <= 2002 ? "2000to2002" : "2003to2006") : (y <= 2001 ? "1999to2001" : "2002to2004"); };
const gearbox = (r, text) => { const t = String(r.transmission || ""); return /manual|smg|sequential|6-speed|5-speed|6 speed|stick/i.test(t) && !/auto|tiptronic/i.test(t) ? (/smg|sequential/i.test(t) ? "smg" : "manual") : /auto|tiptronic/i.test(t) ? "auto" : "unknown"; };
const bodyOf = title => /convertible|cabrio|cabriolet/i.test(title) ? "convertible" : /targa/i.test(title) ? "targa" : /coupe|coupé/i.test(title) ? "coupe" : "unstated";
const terciles = a => { const s = [...a].sort((x, y) => x - y); return [s[Math.floor(s.length / 3)], s[Math.floor(2 * s.length / 3)]]; };

// listings: [{ id, source, price, year, saleYear, mileage, title, transmission, length, topics:Set }]
export function analyse(listings, family, opts = {}) {
  const minL = opts.minListings || MIN_LISTINGS, lens = listings.map(l => l.length).filter(x => x > 0), [t1, t2] = lens.length ? terciles(lens) : [0, 0];
  const L = listings.map(l => ({ ...l, half: halfOf(l.id), key: [l.source, l.saleYear, yearGroup(family, l.year), milesBand(l.mileage), variantOf(family, l.title) || "-", bodyOf(l.title), gearbox(l), l.length <= t1 ? "short" : l.length <= t2 ? "mid" : "long"].join("|") }));
  const counts = new Map(); for (const l of L) for (const t of l.topics) counts.set(t, (counts.get(t) || 0) + 1);
  const effect = (rows, topic) => {   // within strata: median with against median without, weighted by the smaller side
    const strata = new Map(); for (const l of rows) { const s = strata.get(l.key) || strata.set(l.key, { w: [], o: [] }).get(l.key); (l.topics.has(topic) ? s.w : s.o).push(l.price); }
    let num = 0, den = 0, nw = 0, no = 0, k = 0;
    for (const s of strata.values()) { if (!s.w.length || !s.o.length) continue; const mw = median(s.w), mo = median(s.o); if (!(mo > 0)) continue; const w = Math.min(s.w.length, s.o.length); num += w * (mw / mo - 1); den += w; nw += s.w.length; no += s.o.length; k++; }
    return { strata: k, matched_with: nw, matched_without: no, effect: den ? num / den : null };
  };
  const out = { reported: [], skipped_under_threshold: 0, topics_seen: counts.size, listings: L.length };
  for (const [topic, nWith] of [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    const nWithout = L.length - nWith; if (nWith < minL || nWithout < minL) { out.skipped_under_threshold++; continue; }
    const withP = L.filter(l => l.topics.has(topic)).map(l => l.price), withoutP = L.filter(l => !l.topics.has(topic)).map(l => l.price);
    const all = effect(L, topic), h1 = effect(L.filter(l => l.half === 0), topic), h2 = effect(L.filter(l => l.half === 1), topic);
    const enough = h1.matched_with >= MIN_MATCHED_PER_HALF && h1.matched_without >= MIN_MATCHED_PER_HALF && h2.matched_with >= MIN_MATCHED_PER_HALF && h2.matched_without >= MIN_MATCHED_PER_HALF && h1.strata >= MIN_STRATA && h2.strata >= MIN_STRATA;
    const confirmed = !!(enough && h1.effect != null && h2.effect != null && Math.abs(h1.effect) >= MIN_EFFECT && Math.sign(h1.effect) === Math.sign(h2.effect) && Math.abs(h2.effect) >= AGREE_FRACTION * Math.abs(h1.effect));
    const pct = x => x == null ? null : Math.round(x * 1000) / 10;
    const e = pct(all.effect), word = e == null ? null : e > 0 ? "more" : e < 0 ? "less" : "the same";
    out.reported.push({ topic, listings_with: nWith, listings_without: nWithout, median_with: Math.round(median(withP)), median_without: Math.round(median(withoutP)), matched_with: all.matched_with, matched_without: all.matched_without, strata: all.strata, effect_pct: e,
      first_half: { matched_with: h1.matched_with, matched_without: h1.matched_without, strata: h1.strata, effect_pct: pct(h1.effect) }, second_half: { matched_with: h2.matched_with, matched_without: h2.matched_without, strata: h2.strata, effect_pct: pct(h2.effect) }, confirmed,
      line: e == null ? null : `Sold listings that state ${topic} sold for ${word === "the same" ? "the same" : Math.abs(e) + "% " + word} (median, within matched listings)${confirmed ? "; the second half agrees" : "; the second half does not confirm it"}.` });
  }
  return out;
}
export async function runFactPrice(query, deps) {
  const p = parseReportCall(query); if (!p.ok) return { ok: false, status: 400, why: p.why };
  const data = await loadMined(p.call, deps, { soldOnly: true }); if (!data) return { ok: false, status: 409, why: "tables not created, or topic_map has no kind column: run docs/supabase-factmine.sql in the Supabase SQL Editor" };
  const canon = canonOf(data.map), kinds = kindsOf(data.map), topicsOf = new Map(), aside = { topics: new Set(), mentions: 0 };
  for (const m of data.mentions) { const c = canon(m.topic); if (!p.call.includeEquipment && kinds.get(c) === "equipment") { aside.topics.add(c); aside.mentions++; continue; }   // equipment is set aside by default, and counted
    (topicsOf.get(m.listing_id) || topicsOf.set(m.listing_id, new Set()).get(m.listing_id)).add(c); }
  const listings = [];
  for (const r of data.runs) {
    const s = data.sales.get(r.listing_id); if (!s) continue;
    const price = Number(s.sale_price_usd) > 0 ? Number(s.sale_price_usd) : (String(s.currency || "USD").toUpperCase() === "USD" && Number(s.sale_price) > 0 ? Number(s.sale_price) : null); if (!price) continue;
    listings.push({ id: r.listing_id, source: r.source, price, year: s.year, saleYear: s.sale_date ? String(s.sale_date).slice(0, 4) : "unknown", mileage: miles(s.mileage), title: s.listing_title || "", transmission: s.transmission, length: Number(r.characters_read) || 0, topics: topicsOf.get(r.listing_id) || new Set() });
  }
  const res = analyse(listings, p.call.family);
  return { ok: true, status: 200, body: assertCountsOnly({ task: "factprice", family: p.call.family, map_version: p.call.map, sold_only: true, min_listings_each_side: MIN_LISTINGS, set_aside: { kind: "equipment", included: !!p.call.includeEquipment, topics: aside.topics.size, mentions: aside.mentions }, ...res }) };
}
