// /buy search API (Lane C, Oct 2026). ZERO OldCarsData: live_listings (cron-filled) + the archive.
//   POST { q, asked?, anonId? }                       -> resolved car + up to 5 live listings, or the
//                                                        same question + chips One Box would ask.
//   POST { action:"watch", key, email }               -> watch_requests (key = VIN, family:..., live:...)
//   GET  ?panel=1&make&model&trim&year&body           -> { count, rows[<=3] } for the One Box live panel
import { historyEnv, houseName, normVin } from "./_historyData.js";
import { parseFilters, resolveLikeOneBox, familyAnswer, marketOf, liveForFamily, seenBefore, familyLabel } from "../lib/live/search.js";
import { findGeneration } from "../lib/generations.js";

function listingOut(r) {
  return { source: houseName(r.source), sourceSlug: r.source, title: r.listing_title, url: r.url, photo_url: r.photo_url,
    current_bid_usd: r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null,
    current_bid: r.current_bid, currency: r.currency, end_time: r.end_time, mileage: r.mileage, location: [r.location, r.country].filter(Boolean).join(", ") || null,
    vin_norm: r.vin_norm || null };
}
// The question One Box would ask, from the engine's own choice payload.
function questionOf(d) {
  if (d.generationOptions && d.generationOptions.length) return { prompt: d.prompt || "Which generation is it?", chips: d.generationOptions.map(o => ({ label: o.label, query: o.query })) };
  const opts = d.gearboxOptions || d.variantOptions || d.bodyOptions || d.modelOptions || [];
  return { prompt: d.prompt || "Which one is it?", chips: opts.map(o => ({ label: o, append: o })), baseLabel: d.baseLabel || (d.resolvedCar ? [d.resolvedCar.year, d.resolvedCar.make, d.resolvedCar.model, d.resolvedCar.trim].filter(Boolean).join(" ") : null) };
}
async function logSearch(env, vehicle, anonId) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/search_events`, {
      method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ surface: "buy", user_id: null, anon_id: anonId || null, make: vehicle ? vehicle.make || null : null, model: vehicle ? vehicle.model || null : null, year: vehicle && Number(vehicle.year) ? Number(vehicle.year) : null })
    }).then(r => { if (!r.ok) r.text().then(t => console.error("buy search_events log failed", r.status, t.slice(0, 160))); });
  } catch (e) { console.error("buy search_events log threw", e && e.message); }
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
      const live = await liveForFamily(env, vehicle, generation, {}, 3);
      res.setHeader("Cache-Control", "public, s-maxage=300");
      return res.status(200).json({ count: live.total, rows: live.rows.map(listingOut) });
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
    const q = String(b.q || "").slice(0, 200).trim();
    if (!q) return res.status(400).json({ status: "error" });
    const { text, filters } = parseFilters(q);
    const asked = Math.max(0, Math.min(9, Number(b.asked) || 0));
    const rv = await resolveLikeOneBox(text || q, env);
    if (rv.choice) { const qq = questionOf(rv.choice); return res.status(200).json({ status: "question", askIndex: rv.choice.askIndex || asked + 1, ...qq }); }
    if (rv.clarification) return res.status(200).json({ status: "unresolved", prompt: rv.clarification.question || "What year, make and model are you looking for?" });
    const { vehicle, generation } = rv;
    const refine = filters.gearbox ? { tx: filters.gearbox, label: filters.gearbox === "manual" ? "Manual" : (filters.gearboxLabel || "Automatic") } : null;
    const d = await familyAnswer(vehicle, generation, text || q, env, refine, asked);
    if (d && /_choice$/.test(String(d.tier || ""))) { const qq = questionOf(d); return res.status(200).json({ status: "question", askIndex: d.askIndex || asked + 1, ...qq }); }
    // The engine may have narrowed the car (body from the pool, trim): use its resolved car for matching.
    const rc = d && d.resolvedCar ? { ...vehicle, ...Object.fromEntries(Object.entries(d.resolvedCar).filter(([, v]) => v != null && v !== "")) } : vehicle;
    const live = await liveForFamily(env, rc, generation, filters, 5, text || q);
    const market = marketOf(d);
    const listings = await Promise.all(live.rows.map(async r => ({ ...listingOut(r), seen_before: await seenBefore(env, r.vin_norm), market })));
    logSearch(env, rc, typeof b.anonId === "string" ? b.anonId.slice(0, 64) : null);
    const familyKey = ["family", rc.make, rc.model, rc.trim, generation && generation.code, rc.bodyStyle].filter(Boolean).join(":").toLowerCase().replace(/[^a-z0-9:]+/g, "-");
    return res.status(200).json({
      status: "ok",
      resolved: { label: familyLabel(rc, generation), make: rc.make, model: rc.model, trim: rc.trim || null, year: rc.year || null, body: rc.bodyStyle || null, gen: (generation && generation.code) || rc.genCode || null,
        filters: { gearbox: filters.gearbox, gearboxLabel: refine ? refine.label : null, mileageCap: filters.mileageCap, priceCap: filters.priceCap, excludeColours: filters.excludeColours } },
      familyKey, market, total: live.total, listings
    });
  } catch (e) {
    console.error("buySearch failed:", (e && e.stack) || e);
    return res.status(500).json({ status: "error" });
  }
}
