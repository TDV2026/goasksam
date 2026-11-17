// VALUE DRIVER MINING, THE REPORT (Lane B, Nov 17 2026, lane-b-factmine; order bc85). task=factreport: READ ONLY, counts only. Per family: the canonical topics by number and share of mined listings, by source and by sale year, with the statement type and polarity
// split, the share of mentions that carry a date or a mileage, and which topics tend to appear together (listings that state both, and the lift over chance). A topic not yet in topic_map stands as its own raw words. No listing text, no seller, no price.
import { MINER_VERSION, MINE_FAMILIES, assertCountsOnly } from "./factMine.js";
import { DEFAULT_MAP, pageAll } from "./factMap.js";

export const TOP_TOPICS = 60, TOP_PAIRS = 40, PAIR_POOL = 40, ID_CHUNK = 60;
const inList = ids => "(" + ids.map(i => `"${String(i).replace(/"/g, "")}"`).join(",") + ")";
export function parseReportCall(q) {
  const get = k => String((q && q[k]) == null ? "" : q[k]).trim(), family = get("family"), map = get("map") || DEFAULT_MAP;
  if (!MINE_FAMILIES.includes(family)) return { ok: false, why: "family must be e46_m3 or p996_carrera" };
  if (!/^[a-z0-9_.-]{1,20}$/i.test(map)) return { ok: false, why: "map is a short label" };
  const top = get("top") === "" ? TOP_TOPICS : Number(get("top")); if (!Number.isFinite(top) || top < 1 || top > 200) return { ok: false, why: "top must be 1 to 200" };
  return { ok: true, call: { family, map, top: Math.floor(top) } };
}
// everything a family's analysis needs, read once: the mined listings, their mentions, the map, and each listing's sale date
export async function loadMined(call, deps, { withSales = true, soldOnly = false } = {}) {
  const runs0 = await pageAll(deps.select, `listing_mining_runs?select=listing_id,source,sold_or_attempt,characters_read&family=eq.${call.family}&miner_version=eq.${MINER_VERSION}&status=eq.done&order=listing_id.asc`);
  const mentions = await pageAll(deps.select, `listing_mentions?select=listing_id,source,topic,statement_type,polarity,has_date,has_mileage&family=eq.${call.family}&miner_version=eq.${MINER_VERSION}&order=id.asc`);
  const map = await pageAll(deps.select, `topic_map?select=raw_topic,canonical_topic&family=eq.${call.family}&map_version=eq.${encodeURIComponent(call.map)}&order=raw_topic.asc`);
  if (!runs0 || !mentions || !map) return null;
  const runs = soldOnly ? runs0.filter(r => r.sold_or_attempt === "sold") : runs0;   // the price read is SOLD listings only: an attempt never reaches it
  const sales = new Map();
  if (withSales) {
    const bySrc = new Map(); for (const r of runs) { const sid = String(r.listing_id).slice(String(r.source).length + 1); (bySrc.get(r.source) || bySrc.set(r.source, []).get(r.source)).push(sid); }
    for (const [source, sids] of bySrc) for (let i = 0; i < sids.length; i += ID_CHUNK) {
      const part = sids.slice(i, i + ID_CHUNK), got = await deps.select(`sales_archive?select=source_id,sale_date,year,mileage,transmission,body_style,listing_title,sale_price_usd,sale_price,currency:raw_record->>currency&source_slug=eq.${source}&source_id=in.${encodeURIComponent(inList(part))}`);
      if (!Array.isArray(got)) return null;
      for (const g of got) sales.set(`${source}:${g.source_id}`, g);
    }
  }
  return { runs, mentions, map, sales };
}
export const canonOf = map => { const m = new Map(map.map(x => [x.raw_topic, x.canonical_topic])); return t => m.get(t) || t; };
const share = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
const saleYearOf = d => d && d.sale_date ? String(d.sale_date).slice(0, 4) : "unknown";

export function reportFrom({ runs, mentions, map, sales }, call) {
  const canon = canonOf(map), total = runs.length, perSource = {};
  for (const r of runs) perSource[r.source] = (perSource[r.source] || 0) + 1;
  const topics = new Map();   // canonical -> { listings:Set, src:{}, year:{}, type:{}, pol:{}, mentions, date, miles }
  const byListing = new Map();
  for (const m of mentions) {
    const c = canon(m.topic), t = topics.get(c) || topics.set(c, { listings: new Set(), src: {}, year: {}, type: {}, pol: {}, n: 0, date: 0, miles: 0, srcSeen: new Set(), yearSeen: new Set() }).get(c);
    t.n++; t.type[m.statement_type] = (t.type[m.statement_type] || 0) + 1; t.pol[m.polarity] = (t.pol[m.polarity] || 0) + 1; if (m.has_date) t.date++; if (m.has_mileage) t.miles++;
    if (!t.listings.has(m.listing_id)) { t.listings.add(m.listing_id); t.src[m.source] = (t.src[m.source] || 0) + 1; const y = saleYearOf(sales && sales.get(m.listing_id)); t.year[y] = (t.year[y] || 0) + 1; }
    (byListing.get(m.listing_id) || byListing.set(m.listing_id, new Set()).get(m.listing_id)).add(c);
  }
  const ranked = [...topics.entries()].sort((a, b) => b[1].listings.size - a[1].listings.size || (a[0] < b[0] ? -1 : 1));
  const out = { task: "factreport", family: call.family, map_version: call.map, miner_version: MINER_VERSION, mined_listings: total, mined_by_source: perSource, mentions: mentions.length, listings_with_a_mention: byListing.size, canonical_topics: topics.size, topics: [], pairs: [] };
  for (const [c, t] of ranked.slice(0, call.top)) out.topics.push({ topic: c, listings: t.listings.size, share_of_listings_pct: share(t.listings.size, total), by_source: t.src, by_source_share_pct: Object.fromEntries(Object.entries(t.src).map(([s, n]) => [s, share(n, perSource[s])])), by_sale_year: t.year, statement_types: t.type, polarity: t.pol, mentions: t.n, with_a_date_pct: share(t.date, t.n), with_a_mileage_pct: share(t.miles, t.n) });
  const pool = ranked.slice(0, PAIR_POOL).map(([c, t]) => [c, t.listings]), pairs = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) { let both = 0; const [a, A] = pool[i], [b, B] = pool[j], [s, o] = A.size <= B.size ? [A, B] : [B, A]; for (const id of s) if (o.has(id)) both++; if (both) pairs.push({ a, b, listings_with_both: both, lift: Math.round((both / total) / ((A.size / total) * (B.size / total)) * 100) / 100 }); }
  out.pairs = pairs.sort((x, y) => y.listings_with_both - x.listings_with_both || y.lift - x.lift).slice(0, TOP_PAIRS);
  return out;
}
export async function runFactReport(query, deps) {
  const p = parseReportCall(query); if (!p.ok) return { ok: false, status: 400, why: p.why };
  const data = await loadMined(p.call, deps); if (!data) return { ok: false, status: 409, why: "tables not created: run docs/supabase-factmine.sql in the Supabase SQL Editor" };
  return { ok: true, status: 200, body: assertCountsOnly(reportFrom(data, p.call)) };
}
