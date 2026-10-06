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
import { converse } from "../lib/live/converse.js";
import { listingDetail, facetsOf } from "../lib/live/search.js";
import { vinAppearances } from "./_historyData.js";
import { validateBearer } from "../lib/_auth.js";
import { freshnessOn, underReserve, ocdWithRetry } from "../lib/live/ocdGuard.js";
import { callOldCarsData, configureOcdUsage, flushOcdUsage } from "../lib/_ocd.js";
import { mapLiveRecord, upsertLive } from "../lib/live/feed.js";
import { listingCoord } from "../lib/live/geo.js";

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
    if (b.action === "geocoverage") return res.status(200).json(await geoCoverage(env));
    if (b.action === "converse") return res.status(200).json(await converseOut(env, b));
    if (b.action === "detail") return res.status(200).json(await detailOut(env, b));
    if (b.action === "save" || b.action === "list" || b.action === "watchsearch" || b.action === "remove") return await savedSearches(env, req, res, b);
    const q = String(b.q || "").slice(0, 200).trim();
    if (!q) return res.status(400).json({ status: "error" });
    const parsed = parseQuery(q);
    const v = await resolveForBuy(parsed.text || q, env);
    if (!v) return res.status(200).json({ status: "unresolved", message: "Sam couldn’t tell which car that is. Try a make and model, like Porsche 911 or Ferrari 812." });
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

// ---------------------------------------------------------------- the conversation
function cleanState(s) {
  s = s && typeof s === "object" ? s : {};
  return {
    messages: (Array.isArray(s.messages) ? s.messages : []).map(m => String(m || "").slice(0, 300)).filter(Boolean).slice(-10),
    filters: cleanFilters(s.filters) || null,
    answered: (Array.isArray(s.answered) ? s.answered : []).map(String).filter(k => /^(generation|body|mileage|budget|location|zip)$/.test(k)),
    asked: Math.max(0, Math.min(3, Number(s.asked) || 0)),
    zip: /^\d{5}$/.test(String(s.zip || "")) ? String(s.zip) : null,
    place: typeof s.place === "string" && /^[A-Za-z .,'-]{3,60}$/.test(s.place) ? s.place.trim() : null,
    showNow: !!s.showNow
  };
}
async function converseOut(env, b) {
  const st = cleanState(b.state);
  if (!st.messages.length) return { type: "nonsense", say: "Tell Sam a car, a budget or a type of car and Sam will find what's live.", options: ["a black manual BMW M3", "Porsches under $50k", "anything ending today"] };
  const r = await converse(env, st);
  if (r.type === "question" || r.type === "nonsense") return r;
  if (r.type === "groups") {
    const groups = await Promise.all(r.groups.map(async g => {
      const mk = await listingMarket(env, g.items[0].r, g.items[0].facts);
      const cards = await Promise.all(g.items.slice(0, 40).map((x, i) => (i < (r.perCard ? 3 : 0)) ? enrich(env, x) : cardOf(x)));
      return { label: g.label, n: g.n, market: mk, cards };
    }));
    logSearch(env, null, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
    return { type: "groups", say: r.say || null, groups, footnote: !!r.footnote, perCard: !!r.perCard };
  }
  const matches = (r.matches || []).slice(0, MAX);
  const ordered = [...matches].sort((a, x) => { const k = c => (c.distance != null ? 0 : (String(c.r.country || "").toUpperCase() && String(c.r.country).toUpperCase() !== "US" ? 2 : 0) + (c.unknown.length ? 1 : 0)); return k(a) - k(x); });
  const cards = await Promise.all(ordered.map((x, i) => i < FIRST ? enrich(env, x) : cardOf(x)));
  cards.forEach((c, i) => { if (ordered[i].distance != null) c.distance = ordered[i].distance; });
  logSearch(env, null, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
  return { type: "results", say: r.say, market: r.market || null, outOfScope: !!r.outOfScope, geo: !!r.geo, closest: !!r.closest, total: (r.matches || []).length, cards, facets: r.closest ? null : facetsOf(ordered), filters: r.filters || null };
}
async function detailOut(env, b) {
  const id = Number(b.id); if (!Number.isFinite(id)) return { ok: false };
  const rows = await liveRows(env, `id=eq.${id}`);
  let row = rows && rows[0]; if (!row) return { ok: false };
  row = await freshBid(env, row);
  const facts = listingFacts(row);
  const [detail, hist] = await Promise.all([listingDetail(env, row), row.vin_norm ? vinAppearances(env, row.vin_norm) : Promise.resolve(null)]);
  const history = hist && hist.appearances ? hist.appearances.map(a => ({ kind: a.kind, date: a.date, house: a.house, price: a.kind === "sale" ? a.priceUsd : a.bidUsd, miles: a.mileage, url: a.url })) : [];
  return { ok: true, card: cardOf({ r: row, facts, gen: null, unknown: [] }), detail, history, historyUrl: row.vin_norm && history.length ? `/vin/${row.vin_norm}` : null };
}
// ---------------------------------------------------------------- saved searches (signed in)
async function savedSearches(env, req, res, b) {
  const user = await validateBearer(req.headers.authorization || "").catch(() => null);
  if (!user || !user.userId) return res.status(401).json({ ok: false, needSignIn: true });
  const H = { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json" };
  const base = `${env.supabaseUrl}/rest/v1/buy_conversations`;
  if (b.action === "list") {
    const r = await fetch(`${base}?user_id=eq.${user.userId}&select=id,title,messages,filters,state,watch,updated_at&order=updated_at.desc&limit=50`, { headers: H });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, items: r.ok ? await r.json() : [] });
  }
  if (b.action === "save") {
    const st = cleanState(b.state);
    const title = String(b.title || st.messages[0] || "Search").slice(0, 120);
    const row = { user_id: user.userId, title, messages: st.messages, filters: st.filters || {}, state: st, updated_at: new Date().toISOString() };
    const r = b.id && /^[0-9a-f-]{36}$/.test(String(b.id))
      ? await fetch(`${base}?id=eq.${b.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) })
      : await fetch(base, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify([row]) });
    const out = r.ok ? await r.json() : null;
    if (!r.ok) console.error("buy_conversations save failed", r.status);
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, id: out && out[0] && out[0].id });
  }
  if (b.action === "remove" && /^[0-9a-f-]{36}$/.test(String(b.id))) {
    const r = await fetch(`${base}?id=eq.${b.id}&user_id=eq.${user.userId}`, { method: "DELETE", headers: H });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  }
  if (b.action === "watchsearch" && /^[0-9a-f-]{36}$/.test(String(b.id))) {
    const email = user.email || String(b.email || "").toLowerCase();
    if (!email) return res.status(400).json({ ok: false });
    await fetch(`${base}?id=eq.${b.id}&user_id=eq.${user.userId}`, { method: "PATCH", headers: H, body: JSON.stringify({ watch: true, updated_at: new Date().toISOString() }) });
    const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?on_conflict=vin_norm,email`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify([{ vin_norm: "search:" + b.id, email }]) });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  }
  return res.status(400).json({ ok: false });
}

// On-demand current bid for one auction when its detail view opens, cached 5 minutes. OFF unless
// LIVE_FRESHNESS=1, and never under the monthly reserve. One metered request at most (2 retries on 5xx).
const bidCache = new Map();
async function freshBid(env, row) {
  if (!freshnessOn() || !process.env.OLDCARSDATA_API_KEY) return row;
  const key = row.source + "|" + row.source_listing_id, hit = bidCache.get(key);
  if (hit && Date.now() - hit.at < 300e3) return { ...row, ...hit.patch };
  if (await underReserve(env)) return row;
  try {
    configureOcdUsage({ ...env, job: "pull_live_bid" });
    const r = await ocdWithRetry(() => callOldCarsData("/auctions/" + encodeURIComponent(row.source_listing_id), {}, process.env.OLDCARSDATA_API_KEY));
    const rec = (r && (r.data || r)) || null;
    const m = rec && mapLiveRecord(Array.isArray(rec) ? rec[0] : rec, new Date().toISOString());
    await flushOcdUsage();
    if (!m) return row;
    await upsertLive(env, [m]);
    const patch = { current_bid: m.current_bid, current_bid_usd: m.current_bid_usd != null ? m.current_bid_usd : row.current_bid_usd, bid_at: m.bid_at || new Date().toISOString(), end_time: m.end_time || row.end_time };
    bidCache.set(key, { at: Date.now(), patch });
    return { ...row, ...patch };
  } catch (e) { console.error("freshBid:", e && e.message); return row; }
}

// Which sources give a usable US location (city + state that geocodes), over the live listings. Read-only.
async function geoCoverage(env) {
  const rows = await liveRows(env, "id=gt.0");
  const by = {};
  for (const r of rows) {
    const s = houseName(r.source); by[s] = by[s] || { live: 0, us: 0, usable: 0, abroad: 0 };
    by[s].live++;
    const cc = String(r.country || "").toUpperCase();
    if (cc && cc !== "US") { by[s].abroad++; continue; }
    by[s].us++;
    if (listingCoord(r)) by[s].usable++;
  }
  return { ocdRequests: 0, sources: by };
}
