// /buy search API (Lane C, Oct 2026). ZERO OldCarsData: live_listings (cron-filled) + the archive.
//   POST { q, filters? }                -> what was understood + every live match (first 10 enriched with
//                                          their own family's market line and seen-before), facets, US first.
//                                          /buy never asks: filters (from the words or the chips) narrow.
//   POST { action:"enrich", ids:[...] } -> market line + seen-before for more cards ("Show all").
//   POST { action:"watch", key, email } -> watch_requests (key = VIN, family:..., live:...)
//   GET  ?panel=1&make&model&trim&year&body -> { count, rows[<=3] } for the One Box live panel.
import { historyEnv, houseName, normVin } from "./_historyData.js";
import { parseQuery, emptyFilters, gensNamed, resolveForBuy, searchLive, listingFacts, listingMarket, seenBefore, nounFor, liveForFamily, liveRows, familyMarket, COUNTRY_NAME } from "../lib/live/search.js";
import { findGeneration } from "../lib/generations.js";

const FIRST = 10, MAX = 200;
const titleCaseIfShouting = s => { s = String(s || ""); return s && s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()) : s; };
function cardOf(x) {
  const r = x.r, facts = x.facts, cc = String(r.country || "").toUpperCase();
  return { id: r.id, source: houseName(r.source), sourceSlug: r.source, title: r.listing_title, url: r.url, photo_url: r.photo_url,
    current_bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, current_bid: r.current_bid != null ? Math.round(Number(r.current_bid)) : null, currency: r.currency || "USD",
    bid_at: r.bid_at || r.last_seen || null, end_time: r.end_time, year: r.year,
    miles: facts.miles, colour: facts.colour, body: facts.body, gearbox: facts.gearboxLabel,
    location: titleCaseIfShouting(r.location) || null, country: cc || null, countryName: COUNTRY_NAME[cc] || cc || null, abroad: !!cc && cc !== "US",
    vin_norm: r.vin_norm || null, generation: x.gen ? x.gen.code : null, unknown: x.unknown };
}
async function enrich(env, x) {
  const [market, seen] = await Promise.all([listingMarket(env, x.r, x.facts), seenBefore(env, x.r.vin_norm)]);
  return { ...cardOf(x), market, seen_before: seen };
}
async function logSearch(env, v, anonId) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/search_events`, {
      method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ surface: "buy", user_id: null, anon_id: anonId || null, make: v ? v.make || null : null, model: v ? v.model || null : null, year: v && Number(v.year) ? Number(v.year) : null })
    });
    if (!r.ok) console.error("buy search_events log failed", r.status, (await r.text().catch(() => "")).slice(0, 160));
  } catch (e) { console.error("buy search_events log threw", e && e.message); }
}
// Client chip state, sanitised to the known filter shape.
function cleanFilters(raw) {
  const f = emptyFilters(); if (!raw || typeof raw !== "object") return null;
  const arr = (k, re) => Array.isArray(raw[k]) ? raw[k].map(String).filter(s => re.test(s)).slice(0, 12) : [];
  f.bodies = arr("bodies", /^[a-z ]{3,20}$/); f.colours = arr("colours", /^[a-z]{3,10}$/); f.notColours = arr("notColours", /^[a-z]{3,10}$/);
  f.countries = arr("countries", /^[A-Z]{2}$/); f.houses = arr("houses", /^[a-z]{2,24}$/); f.gens = arr("gens", /^[A-Za-z0-9.]{1,8}$/);
  f.gearbox = raw.gearbox === "manual" || raw.gearbox === "auto" ? raw.gearbox : null; f.gearboxLabel = typeof raw.gearboxLabel === "string" ? raw.gearboxLabel.slice(0, 20) : null;
  for (const k of ["miMax", "miMin", "priceMax", "priceMin", "yearMin", "yearMax"]) f[k] = Number(raw[k]) > 0 ? Number(raw[k]) : null;
  return f;
}

export default async function handler(req, res) {
  const env = historyEnv();
  if (!env) return res.status(500).json({ status: "error" });
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET" && req.query && req.query.panel) {
      const q = req.query;
      const vehicle = { make: String(q.make || ""), model: String(q.model || ""), trim: q.trim ? String(q.trim) : null, year: Number(q.year) || null, bodyStyle: q.body ? String(q.body) : null };
      if (!vehicle.make || !vehicle.model) return res.status(200).json({ count: 0, rows: [] });
      const generation = await findGeneration(vehicle, env);
      const live = await liveForFamily(env, vehicle, generation, null, 3);
      res.setHeader("Cache-Control", "public, s-maxage=300");
      return res.status(200).json({ count: live.total, rows: live.rows.map(r => ({ source: houseName(r.source), title: r.listing_title, url: r.url, current_bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, current_bid: r.current_bid, currency: r.currency, end_time: r.end_time, bid_at: r.bid_at || r.last_seen || null })) });
    }
    if (req.method !== "POST") return res.status(405).json({ status: "error" });
    const b = req.body || {};
    if (b.action === "watch") {
      const raw = String(b.key || "").trim();
      const key = /^(family|live):/i.test(raw) ? raw.toLowerCase().replace(/[^a-z0-9:._-]/g, "").slice(0, 120) : normVin(raw);
      const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
      if (!key || key.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ ok: false });
      const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?on_conflict=vin_norm,email`, {
        method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify([{ vin_norm: key, email }])
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    if (b.action === "enrich") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isFinite).slice(0, 60);
      if (!ids.length) return res.status(200).json({ cards: [] });
      const rows = await liveRows(env, `id=in.(${ids.join(",")})`);
      const cards = await Promise.all(rows.map(r => { const facts = listingFacts(r); return Promise.all([listingMarket(env, r, facts), seenBefore(env, r.vin_norm)]).then(([market, seen]) => ({ id: r.id, market, seen_before: seen })); }));
      return res.status(200).json({ cards });
    }
    const q = String(b.q || "").slice(0, 200).trim();
    if (!q) return res.status(400).json({ status: "error" });
    const parsed = parseQuery(q);
    const v = await resolveForBuy(parsed.text || q, env);
    if (!v) return res.status(200).json({ status: "unresolved", message: "I couldn’t tell which car that is. Try a make and model, like Porsche 911 or Ferrari 812." });
    const f = cleanFilters(b.filters) || parsed.filters;
    if (!b.filters) { const named = gensNamed(parsed.text, v.make); if (named.length > 1 || (named.length === 1 && !v.genCode)) f.gens = named; }
    const { rows, facets } = await searchLive(env, v, f, parsed.text);
    // US first, then abroad; inside each, every-filter-confirmed before "may match".
    const ordered = [...rows.filter(x => !String(x.r.country || "").toUpperCase() || String(x.r.country).toUpperCase() === "US"), ...rows.filter(x => String(x.r.country || "").toUpperCase() && String(x.r.country).toUpperCase() !== "US")]
      .sort((a, b2) => { const ab = c => (String(c.r.country || "").toUpperCase() && String(c.r.country).toUpperCase() !== "US" ? 2 : 0) + (c.unknown.length ? 1 : 0); return ab(a) - ab(b2); });
    const capped = ordered.slice(0, MAX);
    const first = await Promise.all(capped.slice(0, FIRST).map(x => enrich(env, x)));
    const emptyMarket = rows.length ? null : await familyMarket(env, v, f);
    const rest = capped.slice(FIRST).map(cardOf);
    logSearch(env, v, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
    const familyKey = ["family", v.make, v.parentModel || v.model, v.trim, (f.gens || []).join("-"), (f.bodies || []).join("-")].filter(Boolean).join(":").toLowerCase().replace(/[^a-z0-9:-]+/g, "-");
    return res.status(200).json({
      status: "ok",
      understood: { make: v.make, model: v.parentModel || v.model || null, trim: v.trim || null, year: v.year || null, noun: nounFor(v, f), filters: f },
      total: rows.length, shownCap: capped.length, cards: first.concat(rest), facets, familyKey, emptyMarket
    });
  } catch (e) {
    console.error("buySearch failed:", (e && e.stack) || e);
    return res.status(500).json({ status: "error" });
  }
}
