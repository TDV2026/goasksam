// The Market Check landing's "An example" band (Lane A, Oct 2026). Runs ONE fixed car through the
// SAME engine Market Check's own search uses (api/_historyData.js oneBoxFor -> lib/onebox.js
// runOneBox - never a second implementation) so the range, the bar, Sam's take, the miles question
// and the sales are all real. Cached in spec_market_cache (the same table /buy's landing example
// uses, a different key) so the landing page is a cheap table read, not a live engine call on every
// request. Refreshed nightly by scripts/buildMarketCheckExample.js, after the VIN index / archive are
// freshest; a cold/missing row falls back to a live, timeout-bounded build so the page never 500s.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { oneBoxFor, familyOf } from "../../api/_historyData.js";
import { supabaseSelect, supabaseInsert } from "../_supabase.js";

// A dense, well-known spec so the pool is always comfortably past the 5-sale floor. If this ever
// needs to change (the spec goes thin), swap the text here - nothing else needs touching.
// MUST stay byte-identical to the landing's first example chip (lib/live/marketCheckLanding.js) and
// its placeholder's example: "one engine, one answer" (Sam, Oct 2026) - the landing and a visitor
// tapping that chip run the identical query, so they read the identical pool, range, outliers and
// freshness. No body-style suffix: the body-style question (lib/onebox.js bodyOptions) is itself part
// of what the chip returns, so the example must start from the same ambiguous (not pre-scoped) pool.
const EXAMPLE_CAR_TEXT = "2008 Porsche 997 Carrera S";
const EXAMPLE_KEY = "market-check|landing-example|v1";
const TTL = 24 * 3600e3; // daily; scripts/buildMarketCheckExample.js forces a fresh build nightly
const MIN_SALES = 5;
const MAX_CARDS = 40; // enough for several "Show 10 more" clicks without an oversized cache row

async function resolveExampleId() {
  const r = await resolveVehicle(EXAMPLE_CAR_TEXT, {});
  const v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null;
  if (!v || !v.make || !v.model) return null;
  return { year: v.year, make: v.make, model: v.model, trim: v.trim || null, family: familyOf(v), genCode: v.genCode || null, bodyStyle: v.bodyStyle || null, vehicle: v };
}

// Reduces the engine's full decision object to exactly what the landing needs. Returns null when the
// car does not clear the honesty floor (no cluster, or fewer than MIN_SALES matching sales) - the
// page hides the whole band rather than show a thin or fabricated example.
function reduce(d) {
  if (!d || !d.cluster || !Array.isArray(d.cluster) || d.cluster.length !== 2) return null;
  const cards = Array.isArray(d.cards) ? d.cards.filter(c => Number(c.price) > 0) : [];
  if (cards.length < MIN_SALES) return null;
  const span = Array.isArray(d.span) && d.span.length === 2 ? d.span : d.cluster;
  const v = d.resolvedCar || {};
  const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  return {
    name,
    // shortLabel/bodyStyle/windowLabel/freshness feed the landing's "997 Carrera S coupes, sold in
    // the last twelve months" pool label and the real freshness line (Sam's mock, item 6) - no second
    // computation of either, both read straight off the same engine response the sales came from.
    shortLabel: [v.model, v.trim].filter(Boolean).join(" ") || name,
    bodyStyle: v.bodyStyle || null,
    windowLabel: d.windowLabel || null,
    freshness: d.freshness || null,
    cluster: [Number(d.cluster[0]), Number(d.cluster[1])],
    span: [Number(span[0]), Number(span[1])],
    samsTake: (d.samsTake && d.samsTake.sentence) ? String(d.samsTake.sentence) : null,
    earned: (d.earned && (d.earned.kind === "mileage" || d.earned.kind === "transmission")) ? d.earned : null,
    // The body style question (lib/onebox.js bodyOptions), same basis as earned - null once the pool
    // reads single-body. Carried straight through so the landing can ask it "alongside miles" exactly
    // as the real chip search does.
    bodyOptions: Array.isArray(d.bodyOptions) && d.bodyOptions.length ? d.bodyOptions : null,
    cards: cards.slice(0, MAX_CARDS).map(c => ({
      price: c.price, mi: c.mi || null, mileageText: c.mileageText || null, platform: c.platform || null,
      platformSlug: c.platformSlug || null, date: c.date || null, month: c.month || null,
      transmission: c.transmission || null, title: c.title || null, image: c.image || null, url: c.url || null
    }))
  };
}

async function build() {
  const id = await resolveExampleId();
  if (!id) { console.error("marketCheckExample build: resolveExampleId returned null for", JSON.stringify(EXAMPLE_CAR_TEXT)); return null; }
  const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
  if (!env.supabaseUrl || !env.supabaseKey) { console.error("marketCheckExample build: no Supabase env"); return null; }
  const d = await oneBoxFor(env, id, null);
  if (!d) { console.error("marketCheckExample build: oneBoxFor returned null, id=", JSON.stringify(id)); return null; }
  const r = reduce(d);
  if (!r) console.error("marketCheckExample build: reduce() rejected, tier=", d.tier, "cluster=", JSON.stringify(d.cluster), "cards=", Array.isArray(d.cards) ? d.cards.length : d.cards);
  return r;
}

let cache = { at: 0, data: undefined }, inflight = null;

async function readStored(env) {
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(EXAMPLE_KEY)}&select=market,computed_at&limit=1`).catch(() => null);
  const r = rows && rows[0];
  return r && Date.now() - Date.parse(r.computed_at) < TTL ? { data: r.market, at: Date.parse(r.computed_at) } : null;
}
async function store(env, data) {
  try { await supabaseInsert("spec_market_cache", [{ spec_key: EXAMPLE_KEY, market: data, low_usd: data ? data.cluster[0] : null, high_usd: data ? data.cluster[1] : null, sale_count: data ? data.cards.length : null, computed_at: new Date().toISOString() }], env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=spec_key"); }
  catch { /* best-effort */ }
}

// Returns the reduced example object, or null when the car does not qualify. Never throws, never
// stalls the page: memory, then the stored row, then (at most waitMs) a fresh build; past waitMs
// returns undefined so the caller can render the page without the band while the build finishes for
// next time. opts.fresh forces a synchronous rebuild (the nightly script).
export async function marketCheckExample(waitMs = 4000, opts = {}) {
  const env = { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY };
  if (!env.supabaseUrl || !env.supabaseKey) return null;
  if (opts.fresh) { const d = await build(); cache = { at: Date.now(), data: d }; await store(env, d); return d; }
  if (cache.data !== undefined && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) inflight = (async () => {
    const st = await readStored(env);
    if (st) { cache = { at: st.at, data: st.data }; return st.data; }
    const d = await build();
    cache = { at: Date.now(), data: d }; await store(env, d); return d;
  })().catch(e => { console.error("marketCheckExample:", e && e.message); cache = { at: Date.now() - TTL + 300e3, data: null }; return null; }).finally(() => { inflight = null; });
  const p = inflight;
  return Promise.race([p, new Promise(res => setTimeout(() => res(undefined), waitMs))]);
}
