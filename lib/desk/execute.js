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
import { buildSpec, fetchQualifying } from "../onebox.js";
import { isHouseSource, sourceSlugOf, hammerUsd, priceDisplay, nativePrices, dedupBySaleIdentity, mileageInfo } from "../_houseComps.js";
import { eventFromRecord, roomForHouseMonth, houseDisplay } from "../houseCalendar.js";
import { windowLabel } from "./query.js";
import { classifySaleType } from "./roomType.js";

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
  const rel = { "7d": 7, "30d": 30, "90d": 90, "6mo": 183, "12mo": 365, "24mo": 730, "36mo": 1095 }[w];
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
  if (vehicle.year && gens.length) { const g = findGenerationSync(gens, vehicle.year); if (g) return [g]; }
  return [];   // no generation scoping: whole nameplate (year filter applied separately)
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
    chassis: row.vin_norm || row.vin || null,
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
  // explicit DSL year range overrides the resolved single year for scoping
  if (filters.year_min != null) vehicle = { ...vehicle, year: Number(filters.year_min) };

  // 2. expand generations
  const gens = expandGenerations(vehicle, filters);
  const genList = gens.length ? gens : [null];

  // 3. per-generation pool via the shared engine, unioned by sale id. collectExcluded records
  // every row the shared qualifier rejected, WITH reason (no silent drops, change 3).
  const sinceIso = win.fromIso;
  const seen = new Set();
  let pool = [];
  const excluded = [];                 // { row, reason } — surfaced in receipts, never dropped silently
  const genLabels = [];
  const diag = { collectExcluded: true, excluded: [] };
  for (const gen of genList) {
    const spec = buildSpec(vehicle, gen, text);
    const rows = await fetchQualifying(spec, sinceIso, env, diag);
    for (const r of (rows || [])) {
      if (gen) r._gen = gen.code;
      if (!seen.has(r.id)) { seen.add(r.id); pool.push(r); }
    }
    if (gen) genLabels.push(`${gen.code} (${gen.yearStart}–${gen.yearEnd})`);
  }
  pool = dedupBySaleIdentity(pool);
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

  // 5. group + aggregate (medians/quartiles only)
  const groupBy = (dsl.groupBy && dsl.groupBy.length) ? dsl.groupBy : [];
  const primary = groupBy[0] || null;
  const buckets = new Map();
  for (const r of pool) {
    const key = primary ? groupKey(primary, r) : "all";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  const total = pool.length;
  const rows = [];
  for (const [key, rs] of buckets) {
    const vals = sortedNums(rs.map(r => Number(r.value)));
    const dates = rs.map(r => r.auction_end_date || r.date).filter(Boolean).sort();
    rows.push({
      group: key,
      count: rs.length,
      share: total ? +(rs.length / total).toFixed(3) : null,
      median: dsl.measures.includes("median") ? median(vals) : undefined,
      p25: dsl.measures.includes("p25") ? percentile(vals, 0.25) : undefined,
      p75: dsl.measures.includes("p75") ? percentile(vals, 0.75) : undefined,
      min: dsl.measures.includes("min") ? (vals[0] ?? null) : undefined,
      max: dsl.measures.includes("max") ? (vals[vals.length - 1] ?? null) : undefined,
      freshness: dates.length ? dates[dates.length - 1] : null,
      thin: vals.length < THIN_MIN
    });
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

  // 6. coverage line + receipts (kept + excluded, no silent drops)
  const bySource = new Map();
  for (const r of pool) { const s = r.source || sourceSlugOf(r); const d = r.auction_end_date || r.date; if (!bySource.has(s) || (d && d < bySource.get(s))) bySource.set(s, d); }
  const keptReceipts = pool.map(r => toReceipt(r, null));
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
    price_basis: dsl.price_basis,
    generations: genLabels
  };

  return {
    ok: true,
    resolvedLabel: vehicle.canonicalLabel || [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    vehicle, window: win, generations: genLabels,
    total, primaryDimension: primary,
    saleTypeSplit,
    answer: rows,
    receipts,
    coverage,
    thin: total < THIN_MIN
  };
}
