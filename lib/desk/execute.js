// Sam Desk — DSL executor (Stage 1).
// =====================================================================
// Compiles a VALIDATED DSL (lib/desk/query.js) into archive reads by REUSING
// the One Box engine (buildSpec + fetchQualifying + hammerUsd + house helpers),
// so the Desk can never disagree with One Box or /sell on the same car.
// Pools are the same materialised sales_archive pools; compute is on hammerUsd
// (house premium backed out), display is on priceDisplay/nativePrices. Medians
// and quartiles only; never a mean, never a midpoint. Archive-only, ZERO OCD.
// =====================================================================

import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { generationsForModel, findGeneration, generationModelToken } from "../generations.js";
import { buildSpec, fetchQualifying, recordExcludeReason } from "../onebox.js";
import { isHouseSource, sourceSlugOf, hammerUsd, priceDisplay, nativePrices, dedupBySaleIdentity, mileageInfo } from "../_houseComps.js";
import { eventFromRecord, roomForHouseMonth, houseDisplay } from "../houseCalendar.js";
import { windowLabel } from "./query.js";
import { classifySaleType } from "./roomType.js";
import { fetchAttempts, computeVelocity, ATTEMPT_PLATFORMS, fetchBroadSales } from "./measures.js";

const PLATFORM_DISPLAY = { bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty", sothebysmotorsport: "Sotheby's Motorsport", mbmarket: "MB Market", pcarmarket: "PCARMarket" };
function platformDisplay(slug) { return PLATFORM_DISPLAY[slug] || slug; }

const DAY = 864e5;
const HT_WINDOW_DAYS = 1095;              // 36 months, matches One Box; never widened
const THIN_MIN = 5;                        // PRICE_RANGE_MIN parity: below this, say thin, no stats

// ---- window / date range ----
function isoDay(d) { return new Date(d).toISOString().slice(0, 10); }
function startOfQuarter(dt) { const m = dt.getUTCMonth(); return new Date(Date.UTC(dt.getUTCFullYear(), m - (m % 3), 1)); }

export function resolveWindow(filters, todayISO) {
  const today = todayISO ? new Date(todayISO + "T00:00:00Z") : new Date();
  const t = today.getTime();
  if (filters.sale_from || filters.sale_to) return { fromIso: filters.sale_from || "2000-01-01", toIso: filters.sale_to || isoDay(t), label: `${filters.sale_from || "…"} to ${filters.sale_to || "…"}` };
  const w = filters.window || "36mo";
  const rel = { "7d": 7, "30d": 30, "90d": 90, "6mo": 183, "12mo": 365, "18mo": 548, "24mo": 730, "36mo": 1095 }[w];
  if (rel) return { fromIso: isoDay(t - rel * DAY), toIso: isoDay(t), label: windowLabel(w) };
  const q0 = startOfQuarter(today);
  if (w === "qtd" || w === "this_quarter") return { fromIso: isoDay(q0), toIso: isoDay(t), label: windowLabel(w) };
  if (w === "last_quarter") { const end = new Date(q0.getTime() - DAY); const start = startOfQuarter(end); return { fromIso: isoDay(start), toIso: isoDay(end), label: "last quarter" }; }
  if (w === "ytd" || w === "this_year") return { fromIso: `${today.getUTCFullYear()}-01-01`, toIso: isoDay(t), label: windowLabel(w) };
  if (w === "last_year") { const y = today.getUTCFullYear() - 1; return { fromIso: `${y}-01-01`, toIso: `${y}-12-31`, label: "last year" }; }
  return { fromIso: isoDay(t - HT_WINDOW_DAYS * DAY), toIso: isoDay(t), label: "last 36 months" };
}

// ---- generation expansion ("air-cooled 911" -> 901/930/964/993) ----
// A descriptor is resolved against the model's curated generations. air/water-cooled
// only means anything for the 911 (pre-996 = air, 996+ = water); for other models the
// descriptor is ignored and the whole nameplate (optionally year-scoped) is used.
function expandGenerations(vehicle, filters) {
  const gens = generationsForModel(vehicle.make, vehicle.model) || [];
  if (filters.generation) {
    const code = String(filters.generation).toLowerCase();
    const hit = gens.find(g => String(g.code).toLowerCase() === code);
    return hit ? [hit] : [];
  }
  const desc = String(filters.descriptor || vehicle.generationHint || "").toLowerCase();
  const is911 = /porsche/i.test(vehicle.make) && /911/.test(String(vehicle.model));
  if (is911 && /air[\s-]?cooled/.test(desc)) return gens.filter(g => g.yearStart < 1999);
  if (is911 && /water[\s-]?cooled/.test(desc)) return gens.filter(g => g.yearStart >= 1999);
  // A generation/chassis code embedded in the descriptor scopes to THAT generation ("E30 M3" ->
  // e30 only, "964 Carrera" -> 964), never the whole nameplate. Guards against the resolver
  // dropping the code into a bare model + descriptor.
  const descToks = desc.replace(/[^a-z0-9\s]/g, " ");
  const codeHit = gens.find(g => { const c = String(g.code).toLowerCase().replace(/[^a-z0-9]/g, ""); return c.length >= 2 && new RegExp(`\\b${c}\\b`).test(descToks); });
  if (codeHit) return [codeHit];
  // Year RANGE (both bounds given): return EVERY generation overlapping [year_min, year_max], not
  // just the one containing year_min. Fixes the widening-shrinks-a-pool bug (b): a Carrera T scoped
  // 2016-2019 was reading only 991.1 (2012-2016, the gen containing 2016) and missing 991.2
  // (2017-2019) where the Carrera T actually lives, so the wider range returned 0 while 2018-2019
  // returned 10. Widening can never shrink a pool.
  const yMin = filters.year_min != null ? Number(filters.year_min) : null;
  const yMax = filters.year_max != null ? Number(filters.year_max) : null;
  if (yMin != null && yMax != null && yMax !== yMin && gens.length) {
    const overlap = gens.filter(g => g.yearEnd >= yMin && g.yearStart <= yMax);
    if (overlap.length) return overlap;
  }
  if (vehicle.year && gens.length) { const g = findGenerationSync(gens, vehicle.year); if (g) return [g]; }
  // No year, no descriptor code: if the nameplate HAS curated generations, union ALL of them (each
  // year-bounded). Covers the whole model history AND avoids a badged family (M3, M4) whose
  // buildSpec anchors on year±2 collapsing to an invalid year window when no year is given.
  if (gens.length) return gens;
  return [];   // unmapped nameplate: whole model, no year scoping
}
function findGenerationSync(gens, year) { return gens.find(g => year >= g.yearStart && year <= g.yearEnd) || null; }

// ---- stats (medians + quartiles only; NEVER a mean) ----
function sortedNums(a) { return a.filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y); }
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}
const median = s => percentile(s, 0.5);

// ---- grouping key extractors ----
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function priceBandOf(v) {
  if (!(v > 0)) return "unknown";
  const b = [[25e3, "under 25k"], [50e3, "25k to 50k"], [100e3, "50k to 100k"], [250e3, "100k to 250k"], [500e3, "250k to 500k"], [1e6, "500k to 1M"]];
  for (const [ceil, lbl] of b) if (v < ceil) return lbl;
  return "1M and up";
}
function groupKey(dim, row) {
  const d = row.auction_end_date || row.date;
  const dt = d ? new Date(d) : null;
  switch (dim) {
    case "venue": return isHouseSource(row) ? (houseDisplay(sourceSlugOf(row)) || row.source || "House") : (row.source || "Online");
    case "channel": return isHouseSource(row) ? "house" : "online";
    case "sale_type": return (row._saleType && row._saleType.type) || "online";
    case "year": return dt ? String(dt.getUTCFullYear()) : "unknown";
    case "month": return dt ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}` : "unknown";
    case "quarter": return dt ? `${dt.getUTCFullYear()} Q${Math.floor(dt.getUTCMonth() / 3) + 1}` : "unknown";
    case "day_of_week": return dt ? DOW[dt.getUTCDay()] : "unknown";
    case "season": { if (!dt) return "unknown"; const m = dt.getUTCMonth(); return m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "fall"; }
    case "model_year": return row.year ? String(row.year) : "unknown";
    case "price_band": return priceBandOf(Number(row.value));
    case "generation": return row._gen || "unknown";
    case "transmission": { const t = String(row.transmission || "").toLowerCase(); return /man|stick|\bmt\b/.test(t) ? "manual" : /auto|pdk|dct|tiptronic|\bat\b/.test(t) ? "automatic" : "other"; }
    default: return "all";
  }
}

// ---- receipts (one row per real transaction) ----
function toReceipt(row, excluded) {
  const slug = sourceSlugOf(row);
  const house = isHouseSource(row);
  const disp = priceDisplay(row);            // buyer-paid, native, labelled
  const nat = nativePrices(row);
  const d = row.auction_end_date || row.date;
  let room = null;
  if (house && d) {
    const dt = new Date(d);
    const dataRoom = eventFromRecord({ slug, city: row.city, url: row.srcurl || row.srcurl2 || row.url });
    room = dataRoom || roomForHouseMonth(slug, dt.getUTCMonth() + 1);   // {room, source:'data'|'inferred'}
  }
  const mi = row.mi || mileageInfo(row);
  const st = row._saleType || null;
  return {
    date: d, venue: house ? (houseDisplay(slug) || row.source) : (row.source || "Online"),
    channel: house ? "house" : "online",
    sale_type: st ? { type: st.type, source: st.source } : null,
    room: room ? { text: room.room, source: room.source } : null,
    price_basis: house ? "buyer_paid+hammer" : "hammer",
    hammer_usd: Number.isFinite(row.value) ? Math.round(row.value) : null,
    buyer_paid: disp ? { amount: disp.amount, currency: disp.currency, premium_inclusive: disp.premiumInclusive } : null,
    native: nat ? { currency: nat.currency, hammer: nat.hammer, total: nat.total } : null,
    mileage: mi && mi.structured != null ? mi.structured : (mi && mi.stated != null ? mi.stated : null),
    chassis: row.vin_norm || row.vin || row.chassis_vin_norm || null,
    title_status: row.ts || null,
    year: row.year || null,
    title: row.raw_title || row.title || null,
    link: row.srcurl || row.srcurl2 || row.url || null,
    generation: row._gen || null,
    excluded: excluded ? true : false,
    excluded_reason: excluded || null
  };
}

// ---- main ----
export async function executeDsl(dsl, env, opts = {}) {
  const todayISO = opts.todayISO || null;
  const filters = dsl.filters || {};
  const win = resolveWindow(filters, todayISO);
  // (e) A RECORD question wants the single highest sale. Ideally that scans ALL of our data, but the
  // price-sorted scan has no sale_price index yet, so a truly all-time scan of a HIGH-VOLUME model
  // (M3) blows the Supabase statement timeout. Until the index lands (see docs), scan a wide but
  // bounded window (6 years) that reliably completes and, in practice, holds the record for almost
  // every model (the high-value sales are recent). The definition states the actual window scanned.
  const isRecord = (dsl.measures || []).includes("record");
  const RECORD_WINDOW_DAYS = 2192; // ~6 years
  if (isRecord && !filters.sale_from && !filters.sale_to && (!filters.window || filters.window === "36mo")) {
    win.fromIso = isoDay(Date.now() - RECORD_WINDOW_DAYS * DAY); win.label = "the last 6 years";
  }

  // 0. Car-less market query ("sell-through on Bring a Trailer", scoped by venue/channel only).
  const hasCar = filters.make || filters.model || filters.descriptor || filters.trim || filters.generation;
  if (!hasCar) return await executeMarket(dsl, env, opts, win, filters);

  // 1. resolve the car. Resolve the STRUCTURED nameplate (make/model/trim) when present;
  // the descriptor ("air-cooled 911") carries era/cooling modifiers the resolver doesn't
  // parse, so it's used only for generation expansion (step 2), with adjectives stripped
  // as a resolve fallback when no structured nameplate was given.
  const carPhrase = [filters.make, filters.model, filters.trim].filter(Boolean).join(" ").trim();
  const descClean = String(filters.descriptor || "").replace(/\b(air|water)[\s-]?cooled\b/gi, "").trim();
  const text = carPhrase || descClean || String(filters.descriptor || "").trim();
  let vehicle = opts.vehicle ? sanitizeResolvedVehicle(opts.vehicle) : null;
  let resolution = null;
  if (!vehicle) {
    resolution = await resolveVehicle(text, {});
    const rv = resolution.vehicle || {};
    // A bare nameplate ("Porsche 911", "Corvette") resolves as needs_clarification because
    // the consumer flow asks WHICH generation. The Desk does its own generation scoping, so
    // that is not a failure here: accept any resolution that pinned a make + model. Only a
    // genuinely unresolvable car (no make, or no model and none supplied) fails.
    const model = rv.model || filters.model || null;
    if (!rv.make || !model) {
      return { ok: false, reason: "unresolved_car", resolution, window: win, coverage: null };
    }
    vehicle = { ...rv, model };
  }
  // explicit DSL year range overrides the resolved single year for scoping. A SINGLE year pins
  // vehicle.year (selects one generation); a RANGE (year_min != year_max) must NOT pin it, or
  // buildSpec's generation re-bind collapses every generation back to the one containing year_min
  // (the widening-shrinks-a-pool bug b: 2016-2019 rebound to 991.1 2012-2016 and lost the 991.2
  // Carrera T). expandGenerations reads the range directly; the year_min/year_max post-filter trims.
  const yRange = filters.year_min != null && filters.year_max != null && Number(filters.year_max) !== Number(filters.year_min);
  if (yRange) {
    // Range: clear any single year (from opts.vehicle OR year_min) so buildSpec's generation
    // re-bind cannot collapse the whole overlapping-generation set back to one generation.
    vehicle = { ...vehicle, year: null };
  } else if (filters.year_min != null) {
    vehicle = { ...vehicle, year: Number(filters.year_min) };
  }

  // Porsche chassis-code nameplate ("993 Turbo", "964 Carrera"): the archive files these under
  // model "911" with the code in the title, so a model=993 scope misses them. Read as 911 inside
  // the code's generation window; the trim (Turbo) then scopes the title correctly.
  let forcedGens = null;
  if (/porsche/i.test(vehicle.make) && /^\d{3}$/.test(String(vehicle.model || ""))) {
    const code = String(vehicle.model);
    const g = (generationsForModel("Porsche", "911") || []).find(x => String(x.code) === code);
    vehicle = { ...vehicle, model: "911" };
    if (g) forcedGens = [g];
  }

  // 2. expand generations
  const gens = forcedGens || expandGenerations(vehicle, filters);
  // A RECORD scans ALL of the model's history for the single highest sale, which is model-wide, not
  // per-generation. Fanning out one all-time fetch PER generation (6 for M3) blows the Supabase
  // statement timeout without the 36-month date filter and returns a query_error. Collapse to ONE
  // model-scoped all-time fetch for a record (the top sales file under the model anyway), unless a
  // specific generation was named.
  const genList = (isRecord && !filters.generation && !forcedGens) ? [null] : (gens.length ? gens : [null]);

  // 3. per-generation pool via the shared engine, unioned by sale id. collectExcluded records
  // every row the shared qualifier rejected, WITH reason (no silent drops, change 3).
  const sinceIso = win.fromIso;
  const seen = new Set();
  let pool = [];
  const excluded = [];                 // { row, reason } — surfaced in receipts, never dropped silently
  const genLabels = [];
  const diag = { collectExcluded: true, excluded: [] };
  const trimTok = vehicle.trim && String(vehicle.trim).trim() ? String(vehicle.trim).trim() : "";
  const houseQuery = filters.channel === "house";
  // Fail-loud fetch (change a/c): fetchQualifying swallows a FAILED archive query (supabaseSelect
  // null) into [], indistinguishable from a genuinely empty pool - under load this rendered a
  // non-deterministic thin/empty state (GT350 returned different pools across runs, once all
  // GT500). Retry with backoff on diag.queryError; if it still fails, THROW so the caller returns
  // an explicit error the user sees, never a silent empty pool. A successful fetch returns the FULL
  // pool every time, so the same query is deterministic.
  const fetchQ = async (spec) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      diag.queryError = false;
      const rows = (await fetchQualifying(spec, sinceIso, env, diag)) || [];
      if (!diag.queryError) return rows;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
    const e = new Error("archive query failed after retries"); e.deskQueryError = true; throw e;
  };
  try {
    for (const gen of genList) {
      const spec = buildSpec(vehicle, gen, text);
      // House-tier (parity with /sell's house comparison): a house sale is a named receipt, valid
      // WITHOUT a photo (RULE 1). For a houses-only query, match /sell by not requiring a photo, so
      // photo-less house sales (Duesenberg Model J) count. Online rows are filtered out anyway.
      if (houseQuery) spec.houseTier = true;
      // Trim-scope guard (parity with One Box priceBandForVehicle): a named trim filters the TITLE so
      // "Carrera RS 2.7 Lightweight" reads that trim and honestly thins, never the whole 911 family.
      if (trimTok && !spec.titleContains && !spec.perfInclude && !spec.badge) spec.titleContains = trimTok;
      // RECORD: price-sorted, tight-limit fetch so the all-time highest sale is found for a
      // high-volume model whose record predates the recent 1000 (keeps it under the statement timeout).
      if (isRecord) spec.recordSort = true;
      let rows = await fetchQ(spec);
      // Chassis-code union when thin (modern cars file under the code): 993 Turbo also reads the 993 pool.
      const codeTok = generationModelToken(gen);
      if (rows.length < 8 && codeTok && codeTok.toLowerCase() !== String(spec.model || "").toLowerCase()) {
        const more = await fetchQ({ ...spec, model: codeTok });
        const s2 = new Set(rows.map(r => r.id));
        for (const r of more) if (!s2.has(r.id)) rows.push(r);
      }
      for (const r of rows) {
        if (gen) r._gen = gen.code;
        if (!seen.has(r.id)) { seen.add(r.id); pool.push(r); }
      }
      if (gen) genLabels.push(`${gen.code} (${gen.yearStart}–${gen.yearEnd})`);
    }
  } catch (e) {
    if (e && e.deskQueryError) return { ok: false, reason: "query_error", window: win, coverage: null };
    throw e;
  }
  pool = dedupBySaleIdentity(pool);
  // e2: honour an explicit generation CODE in the TITLE over the year-based bucket. A "1992 BMW M3
  // (E30) DTM" is an E30 chassis mislabelled into e36 because 1992 is the e36 start year; the title
  // carries the truth. Re-tag any row whose title names a chassis-shaped generation code for this
  // model (letter+2-3 digits like e30/f82, or a bare 3-digit code like 993/997); skip word codes
  // ("first"/"second") and 2-char codes to avoid spurious matches.
  const modelGens = generationsForModel(vehicle.make, vehicle.model) || [];
  const codeRes = modelGens
    .map(g => ({ code: g.code, core: String(g.code).split(".")[0] }))
    .filter(x => /^[a-z]\d{2,3}$/i.test(x.core) || /^\d{3}$/.test(x.core))
    .map(x => ({ code: x.code, re: new RegExp(`\\b${x.core}\\b`, "i") }));
  let genTitleFixed = 0;
  if (codeRes.length) {
    for (const r of pool) {
      const t = String(r.raw_title || r.title || "");
      const hit = codeRes.find(x => x.re.test(t));
      if (hit && r._gen !== hit.code) { r._genTitleFrom = r._gen || null; r._gen = hit.code; genTitleFixed++; }
    }
  }
  // upstream (qualifier) exclusions, deduped by id, that fall inside the window
  const exSeen = new Set(pool.map(r => r.id));
  for (const e of (diag.excluded || [])) {
    const r = e.row, d = r.auction_end_date || r.date;
    if (exSeen.has(r.id)) continue; exSeen.add(r.id);
    if (d && win.toIso && d > win.toIso) continue;
    if (d && win.fromIso && d < win.fromIso) continue;
    excluded.push({ row: r, reason: e.reason });
  }

  // tag live/online sale type on every kept row (change 2)
  for (const r of pool) r._saleType = classifySaleType(r);

  // 4. window upper bound + explicit filters (channel, sale_to, model-year range, sale_type)
  pool = pool.filter(r => {
    const d = r.auction_end_date || r.date;
    if (d && win.toIso && d > win.toIso) return false;
    if (filters.year_max != null && r.year && r.year > Number(filters.year_max)) return false;
    if (filters.year_min != null && r.year && r.year < Number(filters.year_min)) return false;
    return true;
  });
  // Data-error floor: HOUSE SOURCES ONLY (change 3). Some house rows carry a real car title but a
  // junk price (an RM "1985 911 Targa" at $20). No house sells a collector car under this floor, so
  // these are bad data. Online marketplaces are NEVER floored (a real $2k online project is valid).
  // Floored rows are NOT dropped: they move to the excluded list and show in receipts with a reason.
  const DESK_PRICE_FLOOR = 2500;
  const kept = [];
  for (const r of pool) {
    if (isHouseSource(r) && Number(r.value) < DESK_PRICE_FLOOR) excluded.push({ row: r, reason: `below the $${DESK_PRICE_FLOOR.toLocaleString("en-US")} house data-error floor` });
    else kept.push(r);
  }
  pool = kept;
  const flooredCount = excluded.filter(e => /data-error floor/.test(e.reason)).length;

  const channel = filters.channel && filters.channel !== "all" ? filters.channel : null;
  if (channel === "house") pool = pool.filter(isHouseSource);
  else if (channel === "online") pool = pool.filter(r => !isHouseSource(r));
  if (filters.venue) {
    const wanted = [].concat(filters.venue).map(v => String(v).toLowerCase());
    pool = pool.filter(r => wanted.includes(sourceSlugOf(r)) || wanted.includes(String(r.source || "").toLowerCase()));
  }
  if (filters.sale_type) {
    const want = [].concat(filters.sale_type).map(s => String(s).toLowerCase());
    pool = pool.filter(r => want.includes((r._saleType && r._saleType.type) || "online"));
  }
  // Scope the excluded list to the SAME channel/venue/sale_type as the answer, so "no silent
  // drops" lists only the rows relevant to THIS query (a houses-only query never lists excluded
  // BaT rows). Every excluded row shown is one that would have counted but for its reason.
  let exScoped = excluded;
  if (channel === "house") exScoped = exScoped.filter(e => isHouseSource(e.row));
  else if (channel === "online") exScoped = exScoped.filter(e => !isHouseSource(e.row));
  if (filters.venue) {
    const wanted = [].concat(filters.venue).map(v => String(v).toLowerCase());
    exScoped = exScoped.filter(e => wanted.includes(sourceSlugOf(e.row)) || wanted.includes(String(e.row.source || "").toLowerCase()));
  }
  if (filters.sale_type) {
    const want = [].concat(filters.sale_type).map(s => String(s).toLowerCase());
    exScoped = exScoped.filter(e => want.includes((classifySaleType(e.row).type)));
  }

  // 4b. Non-sold outcomes (auction_attempts). Online platforms only (houses never report a
  // no-sale), so a houses-only outcome query is honestly empty. Needed when the outcome is
  // reserve_not_met/withdrawn, or a rate measure is asked.
  const rateMeasures = dsl.measures.filter(m => ["sell_through_rate", "reserve_not_met_rate", "withdrawn_rate"].includes(m));
  const outcomeIsNonSold = ["reserve_not_met", "withdrawn"].includes(dsl.outcome);
  let attempts = [];
  if (outcomeIsNonSold || rateMeasures.length) {
    const raw = await fetchAttempts(vehicle, genList, win, env, filters);
    attempts = raw.filter(a => {
      if (channel === "house") return false;                 // houses: no attempts data
      if (filters.venue) { const w = [].concat(filters.venue).map(v => String(v).toLowerCase()); if (!w.includes(a.source_slug)) return false; }
      return ATTEMPT_PLATFORMS.includes(a.source_slug);
    }).map(a => ({ ...a, value: a._bidUsd, auction_end_date: a.attempt_date, source: platformDisplay(a.source_slug), _attempt: true, raw_title: `${a.year || ""} ${vehicle.make} ${vehicle.model}`.trim() }));
  }
  // When the QUESTION is about non-sold cars, the answer pool IS the attempts of that status.
  if (outcomeIsNonSold) pool = attempts.filter(a => a.auction_status === dsl.outcome);

  // 4c. Velocity (same-chassis repeat sales) is computed off the sold pool.
  const velocity = dsl.measures.includes("velocity") ? computeVelocity(pool.filter(r => !r._attempt)) : null;

  // 5. group + aggregate (medians/quartiles only). Up to two dimensions (composite key).
  const groupBy = (dsl.groupBy && dsl.groupBy.length) ? dsl.groupBy : [];
  const primary = groupBy[0] || null;
  const keyOf = (r) => groupBy.length ? groupBy.map(d => groupKey(d, r)).join(" · ") : "all";
  const buckets = new Map();
  for (const r of pool) { const key = keyOf(r); (buckets.get(key) || buckets.set(key, []).get(key)).push(r); }
  // attempts grouped by the same dimension(s) (for sell-through / rate measures)
  const attemptBuckets = new Map();
  if (rateMeasures.length) for (const a of attempts) { const key = keyOf(a); (attemptBuckets.get(key) || attemptBuckets.set(key, []).get(key)).push(a); }
  const total = pool.length;
  const priceLabel = outcomeIsNonSold ? "bid-to (high bid, reserve not met)" : "hammer";
  const allKeys = new Set([...buckets.keys(), ...(rateMeasures.length ? attemptBuckets.keys() : [])]);
  const rows = [];
  for (const key of allKeys) {
    const rs = buckets.get(key) || [];
    const at = attemptBuckets.get(key) || [];
    const vals = sortedNums(rs.map(r => Number(r.value)));
    const dates = rs.map(r => r.auction_end_date || r.date).filter(Boolean).sort();
    const soldN = rs.length, notSoldN = at.length;
    const reserveN = at.filter(a => a.auction_status === "reserve_not_met").length;
    const withdrawnN = at.filter(a => a.auction_status === "withdrawn").length;
    // Stats are ALWAYS computed (charts need median/quartiles even when the table does not show
    // them, e.g. Q2 whiskers); the table renders only the requested measures. Never a mean.
    const row = {
      group: key,
      count: rs.length,
      share: total ? +(rs.length / total).toFixed(3) : null,
      median: median(vals), p25: percentile(vals, 0.25), p75: percentile(vals, 0.75),
      min: vals[0] ?? null, max: vals[vals.length - 1] ?? null,
      freshness: dates.length ? dates[dates.length - 1] : null,
      thin: vals.length < THIN_MIN
    };
    if (dsl.measures.includes("sell_through_rate")) row.sell_through_rate = (soldN + notSoldN) ? +(soldN / (soldN + notSoldN)).toFixed(3) : null;
    if (dsl.measures.includes("reserve_not_met_rate")) row.reserve_not_met_rate = (soldN + notSoldN) ? +(reserveN / (soldN + notSoldN)).toFixed(3) : null;
    if (dsl.measures.includes("withdrawn_rate")) row.withdrawn_rate = (soldN + notSoldN) ? +(withdrawnN / (soldN + notSoldN)).toFixed(3) : null;
    if (rateMeasures.length) { row.sold_n = soldN; row.not_sold_n = notSoldN; }
    rows.push(row);
  }
  // sort: by count desc (the natural "which house sold most" order); time dims sort by key
  if (["month", "year", "quarter", "day_of_week", "model_year"].includes(primary)) rows.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  else rows.sort((a, b) => b.count - a.count);

  // per-group live/online split (for the read: flag venues whose pool is mostly online lots)
  const houseInPool = pool.filter(isHouseSource);
  const onlineHouse = houseInPool.filter(r => (r._saleType && r._saleType.type) === "online").length;
  const saleTypeSplit = { live: houseInPool.length - onlineHouse, online: onlineHouse, house_total: houseInPool.length };
  if (primary === "venue") {
    for (const row of rows) {
      const rs = buckets.get(row.group) || [];
      const hrs = rs.filter(isHouseSource);
      row.online_share = hrs.length ? +(hrs.filter(r => (r._saleType && r._saleType.type) === "online").length / hrs.length).toFixed(3) : null;
    }
  }
  // (d) traceability: attach the actual MAX and MIN sale receipt to each grouped row, drawn from
  // the FULL group pool (not the 300 recent sample), so a reader can trace every figure - the max
  // especially - to its receipt even when that sale is older than the recent window.
  if (primary) {
    for (const row of rows) {
      const rs = (buckets.get(row.group) || []).filter(r => Number.isFinite(Number(r.value)) && Number(r.value) > 0);
      if (!rs.length) continue;
      const byVal = rs.slice().sort((a, b) => Number(b.value) - Number(a.value));
      row.max_receipt = toReceipt(byVal[0], null);
      row.min_receipt = toReceipt(byVal[byVal.length - 1], null);
    }
  }

  // 6. coverage line + receipts (kept + excluded, no silent drops)
  const bySource = new Map();
  for (const r of pool) { const s = r.source || sourceSlugOf(r); const d = r.auction_end_date || r.date; if (!bySource.has(s) || (d && d < bySource.get(s))) bySource.set(s, d); }
  // Cap the receipts payload for a large pool (the answer uses the full pool; receipts are a
  // recent sample). Keep all excluded rows (usually few) so "no silent drops" stays complete.
  const RCAP = 300;
  const keptSorted = pool.slice().sort((a, b) => String(b.auction_end_date || b.date).localeCompare(String(a.auction_end_date || a.date)));
  const keptReceipts = keptSorted.slice(0, RCAP).map(r => toReceipt(r, null));
  const keptSampled = pool.length > RCAP ? { shown: RCAP, of: pool.length } : null;
  const exReceipts = exScoped.map(e => toReceipt({ ...e.row, _saleType: classifySaleType(e.row) }, e.reason));
  const receipts = keptReceipts.concat(exReceipts).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const inferredRooms = keptReceipts.some(r => r.room && r.room.source === "inferred");
  const saleTypeInferred = keptReceipts.some(r => r.sale_type && r.sale_type.source === "inferred");
  // tally exclusion reasons (scoped to the query)
  const exReasons = {};
  for (const e of exScoped) { const k = /data-error floor/.test(e.reason) ? "house data-error floor" : e.reason; exReasons[k] = (exReasons[k] || 0) + 1; }
  const coverage = {
    sources: [...bySource.entries()].map(([source, earliest]) => ({ source, earliest })).sort((a, b) => (a.earliest || "").localeCompare(b.earliest || "")),
    rooms_inferred: inferredRooms,
    sale_type_inferred: saleTypeInferred,
    sale_type_split: saleTypeSplit,
    thin_threshold: THIN_MIN,
    excluded_total: exScoped.length,
    excluded_by_reason: exReasons,
    floored_house_rows: exScoped.filter(e => /data-error floor/.test(e.reason)).length,
    window: win.label,
    window_from: win.fromIso, window_to: win.toIso,
    price_basis: outcomeIsNonSold ? "bid-to (high bid)" : dsl.price_basis,
    generations: genLabels,
    receipts_sampled: keptSampled
  };
  if (outcomeIsNonSold || rateMeasures.length) {
    coverage.attempts_note = "non-sold outcomes (sell-through, reserve not met, withdrawn) cover the online platforms that report a result (Bring a Trailer, Cars & Bids, Hagerty, Sotheby's Motorsport, MB Market); auction houses do not report no-sales";
    coverage.attempts_total = attempts.length;
  }

  // (e)+(e3) RECORD view: the single highest sale + top five, sorted by price, with halos, race
  // cars and restomods SET ASIDE via the shared rule (recordExcludeReason, same as One Box) unless
  // the question names a halo/generation/trim. Computed from the FULL pool so the top sale is always
  // traceable to its receipt, never lost to the recent-sample cap.
  let record = null;
  if (isRecord) {
    const wantHalo = !!(trimTok || filters.generation);
    const ranked = pool.filter(r => Number.isFinite(Number(r.value)) && Number(r.value) > 0);
    const eligible = [], setAside = [];
    for (const r of ranked) {
      const why = recordExcludeReason(r.raw_title || r.title, vehicle.make, { wantHalo });
      (why ? setAside : eligible).push({ r, why });
    }
    eligible.sort((a, b) => Number(b.r.value) - Number(a.r.value));
    setAside.sort((a, b) => Number(b.r.value) - Number(a.r.value));
    const covStart = (coverage.sources && coverage.sources[0] && coverage.sources[0].earliest) || null;
    record = {
      definition: `Record means the single highest sale in our data over ${win.label}${covStart ? ` (earliest in this pool ${covStart})` : ""}. Halos, race cars and restomods are set aside unless the question asks for them.`,
      coverage_start: covStart,
      top: eligible.slice(0, 5).map(x => toReceipt(x.r, null)),
      set_aside: setAside.slice(0, 8).map(x => ({ ...toReceipt(x.r, null), record_excluded_as: x.why })),
      eligible_total: eligible.length,
      set_aside_total: setAside.length,
      want_halo: wantHalo
    };
  }

  return {
    ok: true,
    resolvedLabel: vehicle.canonicalLabel || [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    vehicle, window: win, generations: genLabels,
    total, primaryDimension: primary,
    saleTypeSplit,
    outcome: dsl.outcome,
    priceLabel,
    velocity,
    record,
    genTitleFixed,
    answer: rows,
    receipts,
    coverage,
    thin: total < THIN_MIN
  };
}

// Car-less market query: a cross-market question scoped by venue/channel only (Q2 sell-through on
// Bring a Trailer by price band, quarter over quarter). Broad sold pool + attempts, same grouping.
async function executeMarket(dsl, env, opts, win, filters) {
  const measures = dsl.measures;
  const rateMeasures = measures.filter(m => ["sell_through_rate", "reserve_not_met_rate", "withdrawn_rate"].includes(m));
  const outcomeIsNonSold = ["reserve_not_met", "withdrawn"].includes(dsl.outcome);
  let pool = await fetchBroadSales(win, env, filters);
  for (const r of pool) r._saleType = classifySaleType(r);
  const channel = filters.channel && filters.channel !== "all" ? filters.channel : null;
  if (channel === "house") pool = pool.filter(isHouseSource);
  else if (channel === "online") pool = pool.filter(r => !isHouseSource(r));

  let attempts = [];
  if (outcomeIsNonSold || rateMeasures.length) {
    const raw = await fetchAttempts(null, [null], win, env, filters);
    attempts = raw.filter(a => channel === "house" ? false : ATTEMPT_PLATFORMS.includes(a.source_slug))
      .map(a => ({ ...a, value: a._bidUsd, auction_end_date: a.attempt_date, source: (({ bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", hagerty: "Hagerty", sothebysmotorsport: "Sotheby's Motorsport", mbmarket: "MB Market" })[a.source_slug] || a.source_slug), _attempt: true, raw_title: `${a.year || ""} ${a.make || ""} ${a.model || ""}`.trim() }));
  }
  if (outcomeIsNonSold) pool = attempts.filter(a => a.auction_status === dsl.outcome);

  const groupBy = (dsl.groupBy && dsl.groupBy.length) ? dsl.groupBy : [];
  const primary = groupBy[0] || null;
  const keyOf = (r) => groupBy.length ? groupBy.map(d => groupKey(d, r)).join(" · ") : "all";
  const buckets = new Map();
  for (const r of pool) { const k = keyOf(r); (buckets.get(k) || buckets.set(k, []).get(k)).push(r); }
  const attemptBuckets = new Map();
  if (rateMeasures.length) for (const a of attempts) { const k = keyOf(a); (attemptBuckets.get(k) || attemptBuckets.set(k, []).get(k)).push(a); }
  const total = pool.length;
  const allKeys = new Set([...buckets.keys(), ...(rateMeasures.length ? attemptBuckets.keys() : [])]);
  const rows = [];
  for (const key of allKeys) {
    const rs = buckets.get(key) || [], at = attemptBuckets.get(key) || [];
    const vals = sortedNums(rs.map(r => Number(r.value)));
    const dates = rs.map(r => r.auction_end_date || r.date).filter(Boolean).sort();
    const soldN = rs.length, notSoldN = at.length;
    const row = {
      group: key, count: soldN, share: total ? +(soldN / total).toFixed(3) : null,
      median: median(vals), p25: percentile(vals, 0.25), p75: percentile(vals, 0.75),
      min: vals[0] ?? null, max: vals[vals.length - 1] ?? null,
      freshness: dates.length ? dates[dates.length - 1] : null, thin: vals.length < THIN_MIN
    };
    if (measures.includes("sell_through_rate")) row.sell_through_rate = (soldN + notSoldN) ? +(soldN / (soldN + notSoldN)).toFixed(3) : null;
    if (measures.includes("reserve_not_met_rate")) row.reserve_not_met_rate = (soldN + notSoldN) ? +(at.filter(a => a.auction_status === "reserve_not_met").length / (soldN + notSoldN)).toFixed(3) : null;
    if (rateMeasures.length) { row.sold_n = soldN; row.not_sold_n = notSoldN; }
    rows.push(row);
  }
  if (["month", "year", "quarter", "day_of_week", "model_year", "price_band"].includes(primary)) rows.sort((a, b) => String(a.group).localeCompare(String(b.group)));
  else rows.sort((a, b) => b.count - a.count);

  const bySource = new Map();
  for (const r of pool) { const s = r.source || sourceSlugOf(r); const d = r.auction_end_date || r.date; if (!bySource.has(s) || (d && d < bySource.get(s))) bySource.set(s, d); }
  // A market query can hold thousands of sales; the answer is the aggregate. Cap receipts to a
  // recent sample so the payload stays light (the coverage line states the full pool size).
  const RECEIPT_CAP = 300;
  const sorted = pool.slice().sort((a, b) => String(b.auction_end_date || b.date).localeCompare(String(a.auction_end_date || a.date)));
  const receipts = sorted.slice(0, RECEIPT_CAP).map(r => toReceipt(r, null));
  const receiptsSampled = pool.length > RECEIPT_CAP ? { shown: RECEIPT_CAP, of: pool.length } : null;
  const venueLabel = filters.venue ? [].concat(filters.venue)[0] : null;
  const coverage = {
    sources: [...bySource.entries()].map(([source, earliest]) => ({ source, earliest })).sort((a, b) => (a.earliest || "").localeCompare(b.earliest || "")),
    rooms_inferred: false, sale_type_inferred: false, thin_threshold: THIN_MIN, excluded_total: 0, excluded_by_reason: {},
    window: win.label, window_from: win.fromIso, window_to: win.toIso,
    price_basis: outcomeIsNonSold ? "bid-to (high bid)" : dsl.price_basis, generations: []
  };
  if (outcomeIsNonSold || rateMeasures.length) { coverage.attempts_total = attempts.length; coverage.attempts_note = "non-sold outcomes cover the online platforms that report a result (Bring a Trailer, Cars & Bids, Hagerty, Sotheby's Motorsport, MB Market); auction houses do not report no-sales"; }
  if (receiptsSampled) coverage.receipts_sampled = receiptsSampled;

  return {
    ok: true, resolvedLabel: venueLabel ? platformDisplay(String(venueLabel).toLowerCase()) : (channel === "house" ? "the auction houses" : channel === "online" ? "the online platforms" : "the market"),
    vehicle: null, window: win, generations: [], total, primaryDimension: primary,
    saleTypeSplit: null, outcome: dsl.outcome, priceLabel: outcomeIsNonSold ? "bid-to (high bid, reserve not met)" : "hammer",
    velocity: null, answer: rows, receipts, coverage, thin: total < THIN_MIN
  };
}
