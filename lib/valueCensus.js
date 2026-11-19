// VALUE DRIVER CENSUS (Lane D, Nov 17 2026, to Lane F's spec "For Lane B", branch lane-f-value-census 7bce3437).
// A READ ONLY ops task body: zero OldCarsData spend, zero writes. The ops door (api/usageDashboard.js, task=valuecensus, probe key header) calls runValueCensus.
// Counts, lengths and shares only. The COUNTING mode returns numbers, flags and fixed words: never a seller name, never listing text (assertCountsOnly enforces it on every counts answer).
// The SAMPLE mode is for Lane F's hand check only: up to ten listings per call, description text to the probe caller, never logged, never stored, refused above ten.
// Every call is windowed by one source and a date window of at most 366 days, so no call scans a table. Rows are paged inside the window and aggregated in process (the poolrows pattern); no SQL function, so no DDL for Sam to run.
// Families are defined once, here, from the resolver's own keys: lib/generations.js (BMW M3 e46 2000 to 2006; Porsche 911 996 1999 to 2004) and lib/vehicleData.js PORSCHE_911_TRIMS.
import { PORSCHE_911_TRIMS } from "./vehicleData.js";
import { CURATED_GENERATIONS } from "./generations.js";
import { recordUrlNorm, normalizeListingUrl } from "./_urlNorm.js";

export const MAX_WINDOW_DAYS = 366, SAMPLE_MAX = 10, PAGE = 100, MAX_ROWS = 6000, RELIST_DAYS = 90;
export const ATTEMPT_SOURCES = ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"];
const genOf = (make, model, code) => CURATED_GENERATIONS.find(g => g.make === make && g.model === model && g.code === code);
const E46 = genOf("BMW", "M3", "e46"), P996 = genOf("Porsche", "911", "996");
export const FAMILIES = {
  e46_m3: { make: "BMW", models: ["M3"], yearMin: E46.yearStart, yearMax: E46.yearEnd },
  p996_carrera: { make: "Porsche", models: ["911", "996"], yearMin: P996.yearStart, yearMax: P996.yearEnd },
  p996_mezger: { make: "Porsche", models: ["911", "996"], yearMin: P996.yearStart, yearMax: P996.yearEnd }
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TRIM_RES = PORSCHE_911_TRIMS.map(t => ({ t, re: new RegExp("(^|[^a-z0-9])" + esc(t).replace(/\s+/g, "[\\s-]*") + "($|[^a-z0-9])", "i") }));
export const trimFamilyOf = title => {   // "carrera" | "mezger" | "both" | null, from PORSCHE_911_TRIMS
  const hit = TRIM_RES.filter(x => x.re.test(String(title || ""))).map(x => x.t);
  const carrera = hit.some(t => /^(Carrera(?! RS)|Targa)/i.test(t)), mezger = hit.some(t => /^(Turbo|GT2|GT3)/i.test(t));
  return carrera && mezger ? "both" : mezger ? "mezger" : carrera ? "carrera" : null;
};
const SETASIDE = [["replica", /\b(replica|tribute|clone|recreation|homage)\b|-style\b/i], ["ruf", /\bRUF\b/], ["turbo_look", /turbo[\s-]*look/i]];

// ---- the window door -------------------------------------------------------------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/, days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
export const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const parseCall = q => {
  const get = k => String((q && q[k]) == null ? "" : q[k]).trim();
  const table = get("table") || "sold", source = get("source"), family = get("family"), from = get("from"), to = get("to"), mode = get("mode") || "counts";
  if (!["sold", "attempts"].includes(table)) return { ok: false, why: "table must be sold or attempts" };
  if (!["counts", "sample"].includes(mode)) return { ok: false, why: "mode must be counts or sample" };
  if (!/^[a-z0-9_]{2,40}$/.test(source)) return { ok: false, why: "source is required (one slug)" };
  if (table === "attempts" && !ATTEMPT_SOURCES.includes(source)) return { ok: false, why: "attempts are held for five sources only" };
  if (!FAMILIES[family]) return { ok: false, why: "family must be e46_m3, p996_carrera or p996_mezger" };
  if (!DATE.test(from) || !DATE.test(to)) return { ok: false, why: "from and to are required (YYYY-MM-DD): an unwindowed call is refused" };
  if (days(from, to) < 0) return { ok: false, why: "to is before from" };
  if (days(from, to) > MAX_WINDOW_DAYS) return { ok: false, why: "window is wider than " + MAX_WINDOW_DAYS + " days" };
  let limit = null, ids = null;
  if (mode === "sample") {
    if (q.ids != null && String(q.ids).trim()) { ids = String(q.ids).split(",").map(s => s.trim()).filter(Boolean); if (ids.length > SAMPLE_MAX) return { ok: false, why: "sample mode returns at most " + SAMPLE_MAX + " listings" }; }
    const n = q.limit == null || String(q.limit).trim() === "" ? SAMPLE_MAX : Number(q.limit);
    if (!Number.isFinite(n) || n < 1) return { ok: false, why: "limit must be 1 to " + SAMPLE_MAX };
    if (n > SAMPLE_MAX) return { ok: false, why: "sample mode returns at most " + SAMPLE_MAX + " listings" };
    limit = Math.floor(n);
  }
  return { ok: true, call: { table, source, family, from, to, mode, limit, ids } };
};

// ---- the read ---------------------------------------------------------------------------------------------------------------------
const SOLD_COLS = "source_id,listing_title,year,sale_date,vin_norm,url_norm,mileage,mileage_text,has_reserve,description,known_flaws,recent_service_history,modifications,exterior_color,interior_color,transmission,body_style,project_flag,raw_record";   // no seller column is ever selected
const ATT_COLS = "source_record_id,year,attempt_date,auction_status,high_bid,has_reserve,chassis_vin_norm,raw_record";
const famFilter = f => { const F = FAMILIES[f]; return `&make=ilike.${encodeURIComponent("*" + F.make + "*")}&year=gte.${F.yearMin}&year=lte.${F.yearMax}` + (F.models.length > 1 ? `&or=(${F.models.map(m => `model.ilike.*${m}*`).join(",")})` : `&model=ilike.${encodeURIComponent("*" + F.models[0] + "*")}`); };
const rowsOf = async (fetchPage, base) => {
  const all = [];
  for (let off = 0; off < MAX_ROWS; off += PAGE) {
    const page = await fetchPage(`${base}&limit=${PAGE}&offset=${off}`);
    if (!Array.isArray(page)) return { fail: true, rows: all };
    all.push(...page);
    if (page.length < PAGE) return { rows: all };
  }
  return { tooMany: true, rows: all };
};
export const readWindow = async (call, fetchPage, extraDays = 0) => {
  const { table, source, family, from, to } = call, end = extraDays ? addDays(to, extraDays) : to;
  const base = table === "sold"
    ? `sales_archive?select=${SOLD_COLS}&source_slug=eq.${source}&sale_date=gte.${from}&sale_date=lte.${end}${famFilter(family)}&order=sale_date.asc,source_id.asc`
    : `auction_attempts?select=${ATT_COLS}&source_slug=eq.${source}&attempt_date=gte.${from}&attempt_date=lte.${end}${famFilter(family)}&order=attempt_date.asc,source_record_id.asc`;
  return rowsOf(fetchPage, base);
};

// ---- the rows, normalised ---------------------------------------------------------------------------------------------------------
const present = v => Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : typeof v === "number" ? true : String(v == null ? "" : v).trim() !== "";
const raw = r => (r && r.raw_record && typeof r.raw_record === "object") ? r.raw_record : {};
const titleOf = (t, r) => String(t === "sold" ? r.listing_title : raw(r).title || "");
export const familyVerdict = (family, r, table) => {   // "in" or the name of the line it is counted on instead
  const title = titleOf(table, r), F = FAMILIES[family];
  if (r.project_flag) return "project";
  for (const [k, re] of SETASIDE) if (re.test(title)) return k;
  if (family === "e46_m3") { if (/\bsedan\b|\b4[\s-]*door\b/i.test(title)) return "sedan"; return "in"; }
  const tf = trimFamilyOf(title);
  if (tf === "both") return "two_families";
  return tf === (family === "p996_mezger" ? "mezger" : "carrera") ? "in" : "other_trim";
};
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10; };
const ENDS = /[.!?)"'”’]\s*$/, MARK = /\.\.\.|…|\bmore\b/i;
const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
const clip = s => String(s).slice(0, 40);
const SECTIONS = ["known_flaws", "recent_service_history", "modifications", "exterior_color", "interior_color", "transmission", "body_style"];
const descOf = (t, r) => { const d = t === "sold" ? (r.description != null ? r.description : raw(r).description) : raw(r).description; return d == null ? null : String(d); };

export const aggregate = (call, rows, ctx = {}) => {
  const t = call.table, out = { table: t, source: call.source, family: call.family, from: call.from, to: call.to, total_read: rows.length };
  const excluded = { project: 0, replica: 0, ruf: 0, turbo_look: 0, sedan: 0, two_families: 0, other_trim: 0 }, inn = [];
  for (const r of rows) { const v = familyVerdict(call.family, r, t); if (v === "in") inn.push(r); else excluded[v]++; }
  out.total = inn.length; out.excluded_counts = excluded;
  const dates = inn.map(r => String(t === "sold" ? r.sale_date : r.attempt_date)).filter(Boolean).sort();
  out.first_date = dates[0] || null; out.last_date = dates[dates.length - 1] || null;
  // outcomes
  if (t === "sold") out.outcome = { sold: inn.length };
  else {
    const o = { reserve_not_met: 0, withdrawn: 0, unknown_status: 0 };
    for (const r of inn) { const s = String(r.auction_status || ""); if (s === "reserve_not_met") o.reserve_not_met++; else if (s === "withdrawn") o.withdrawn++; else o.unknown_status++; }
    out.outcome = o;
    out.rnm_with_high_bid = inn.filter(r => r.auction_status === "reserve_not_met" && Number(r.high_bid) > 0).length;
    out.high_bid_present = inn.filter(r => Number(r.high_bid) > 0).length;
  }
  const hr = { true: 0, false: 0, null: 0 };
  for (const r of inn) { const h = t === "sold" ? (r.has_reserve != null ? r.has_reserve : raw(r).has_reserve) : r.has_reserve; hr[h === true ? "true" : h === false ? "false" : "null"]++; }
  out.has_reserve = hr;
  // description
  const lens = [], lenCount = {}; let nul = 0, emp = 0, ends = 0, notEnds = 0, marker = 0, under200 = 0, equal = 0, differ = 0, rawNoDesc = 0;
  for (const r of inn) {
    const d = descOf(t, r);
    if (d == null) { nul++; continue; }
    if (d.trim() === "") { emp++; continue; }
    lens.push(d.length); lenCount[d.length] = (lenCount[d.length] || 0) + 1;
    if (ENDS.test(d)) ends++; else notEnds++;
    if (MARK.test(d.slice(-40))) marker++;
    if (d.length < 200) under200++;
    if (t === "sold") { const rd = raw(r).description; if (rd == null) rawNoDesc++; else if (String(rd) === String(r.description)) equal++; else differ++; }
  }
  out.description = { null_count: nul, empty_count: emp, with_text: lens.length, p10: pct(lens, 0.1), p50: pct(lens, 0.5), p90: pct(lens, 0.9), most_common_lengths: top(lenCount, 5).map(([len, n]) => ({ length: Number(len), rows: n })), ends_like_a_sentence: ends, not_ending_like_a_sentence: notEnds, cut_marker_in_last_40: marker, under_200: under200 };
  if (t === "sold") out.description.column_equals_raw_record = { equal, differ, raw_record_has_none: rawNoDesc };
  else out.description.read_from = "raw_record";
  // VIN, mileage
  const vinOf = r => String((t === "sold" ? r.vin_norm : r.chassis_vin_norm) || "").trim(), vc = {};
  for (const r of inn) { const v = vinOf(r); if (v) vc[v] = (vc[v] || 0) + 1; }
  out.vin = { present: Object.values(vc).reduce((a, b) => a + b, 0), distinct: Object.keys(vc).length, on_two_or_more_rows: Object.values(vc).filter(n => n > 1).length };
  out.mileage_present = inn.filter(r => t === "sold" ? (r.mileage != null || present(r.mileage_text)) : present(raw(r).mileage) || present(raw(r).mileage_text)).length;
  // sections and colours
  const sec = {}, rowsWithAll = {};
  for (const k of SECTIONS) { sec[k] = inn.filter(r => present(t === "sold" && r[k] != null ? r[k] : raw(r)[k])).length; }
  out.sections_present = sec;
  out.always_present = inn.length >= 10 ? SECTIONS.filter(k => sec[k] === inn.length) : [];
  const colours = k => { const m = {}; let long = 0; for (const r of inn) { const v = t === "sold" && r[k] != null ? r[k] : raw(r)[k]; if (!present(v) || typeof v !== "string") continue; if (v.length > 40) { long++; continue; } const c = v.trim().toLowerCase(); m[c] = (m[c] || 0) + 1; } return { distinct: Object.keys(m).length, longer_than_40: long, most_common: Object.fromEntries(top(m, 40)) }; };
  out.exterior_colour = colours("exterior_color"); out.interior_colour = colours("interior_color");
  // raw_record keys, and comments
  const keys = {}; let cPresent = 0, cRole = 0, cTime = 0, cCountOnly = 0;
  for (const r of inn) {
    const rr = raw(r); for (const k of Object.keys(rr)) keys[clip(k)] = (keys[clip(k)] || 0) + 1;
    const ck = Object.keys(rr).find(k => /^comments?$/i.test(k));
    if (ck) {
      const v = rr[ck];
      if (Array.isArray(v) && v.length) { cPresent++; const ks = Object.keys(v[0] || {}); if (ks.some(k => /role|author_type|is_seller|seller|staff|type/i.test(k))) cRole++; if (ks.some(k => /date|time|created|posted|at$/i.test(k))) cTime++; }
      else if (typeof v === "number" && v > 0) { cPresent++; cCountOnly++; }
    }
  }
  out.raw_record_keys = Object.fromEntries(top(keys, 80));
  out.comments = { present: cPresent, count_only: cCountOnly, with_author_role: cRole, with_timestamp: cTime };
  // duplicates
  const byVD = {}, byUrl = {};
  for (const r of inn) {
    const v = vinOf(r), d = String(t === "sold" ? r.sale_date : r.attempt_date);
    if (v) byVD[v + "|" + d] = (byVD[v + "|" + d] || 0) + 1;
    const u = t === "sold" ? (r.url_norm || recordUrlNorm({ raw_record: raw(r) }) || "") : (normalizeListingUrl(raw(r).url || raw(r).listing_url || "") || "");
    if (u) byUrl[u] = (byUrl[u] || 0) + 1;
  }
  out.duplicates = { rows_sharing_vin_and_date: Object.values(byVD).filter(n => n > 1).reduce((a, b) => a + b, 0), rows_sharing_url_norm: Object.values(byUrl).filter(n => n > 1).reduce((a, b) => a + b, 0) };
  // attempt chains (attempts only): a later attempt or a later sale of the same vehicle 1 to 90 days after an earlier attempt
  if (t === "attempts") {
    const chains = {}, keyOf = r => vinOf(r) || normalizeListingUrl(raw(r).url || raw(r).listing_url || "") || "";
    for (const r of ctx.attemptsWide || rows) { if (familyVerdict(call.family, r, t) !== "in") continue; const k = keyOf(r); if (!k) continue; (chains[k] = chains[k] || []).push(String(r.attempt_date)); }
    const sales = ctx.salesWide || {};
    let n = 0, relist = 0;
    const inWindow = new Set(inn.map(keyOf).filter(Boolean));
    for (const k of inWindow) {
      n++;
      const ds = (chains[k] || []).sort(), later = [...ds, ...(sales[k] || [])];
      let hit = false;
      for (let i = 0; i < ds.length && !hit; i++) for (const d of later) { const gap = days(ds[i], d); if (gap >= 1 && gap <= RELIST_DAYS) { hit = true; break; } }
      if (hit) relist++;
    }
    out.attempt_chains = n; out.chains_with_relist = relist; out.relist_rule = "a later attempt or sale of the same vehicle 1 to " + RELIST_DAYS + " days after an earlier attempt; the read ran " + RELIST_DAYS + " days past " + call.to;
    out.rows_with_no_chain_key = inn.filter(r => !keyOf(r)).length;
  }
  return out;
};

// every counts answer is checked: numbers, booleans, null and a short fixed set of words only
const ALLOWED_WORDS = new Set(["sold", "attempts"]);
export const assertCountsOnly = out => {
  const bad = [];
  const walk = (v, path, isKey) => {
    if (v == null || typeof v === "number" || typeof v === "boolean") return;
    if (typeof v === "string") { if (path === "relist_rule" || path === "description.read_from" || path === "mode" || ALLOWED_WORDS.has(v) || /^(e46_m3|p996_carrera|p996_mezger|\d{4}-\d{2}-\d{2}|[a-z0-9_]{2,40})$/.test(v)) return; bad.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + "[" + i + "]")); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k.length > 40 || /seller|email|phone|username|description_text/i.test(k) && typeof x === "string") bad.push(path + "." + k); walk(x, path ? path + "." + k : k); }
  };
  walk(out, "");
  if (bad.length) throw new Error("value census counts answer carries text: " + bad.slice(0, 3).join(", "));
  return out;
};

// ---- the sample, for Lane F's hand check only --------------------------------------------------------------------------------------
const sampleOf = (call, r) => {
  const t = call.table, o = { id: t === "sold" ? r.source_id : r.source_record_id, year: r.year, date: t === "sold" ? r.sale_date : r.attempt_date, description: descOf(t, r), sections: {} };
  if (t === "sold") o.title = r.listing_title;
  for (const k of SECTIONS) { const v = t === "sold" && r[k] != null ? r[k] : raw(r)[k]; if (present(v)) o.sections[k] = v; }
  return o;
};

export const runValueCensus = async (query, { fetchPage }) => {
  const p = parseCall(query || {});
  if (!p.ok) return { ok: false, status: 400, why: p.why };
  const call = p.call;
  const got = await readWindow(call, fetchPage);
  if (got.fail) return { ok: false, status: 502, why: "the read failed; nothing counted" };
  if (got.tooMany) return { ok: false, status: 413, why: "more than " + MAX_ROWS + " rows in the window; narrow it" };
  if (call.mode === "sample") {
    let rows = got.rows.filter(r => familyVerdict(call.family, r, call.table) === "in");
    if (call.ids) { const want = new Set(call.ids); rows = rows.filter(r => want.has(String(call.table === "sold" ? r.source_id : r.source_record_id))); }
    rows = rows.slice(0, call.limit || SAMPLE_MAX);
    return { ok: true, status: 200, body: { task: "valuecensus", mode: "sample", table: call.table, source: call.source, family: call.family, from: call.from, to: call.to, count: rows.length, ocdSpend: 0, listings: rows.map(r => sampleOf(call, r)) } };
  }
  const ctx = {};
  if (call.table === "attempts") {
    const wide = await readWindow(call, fetchPage, RELIST_DAYS);
    if (wide.fail) return { ok: false, status: 502, why: "the read failed; nothing counted" };
    ctx.attemptsWide = wide.rows;
    const sc = { ...call, table: "sold" }, sw = await readWindow(sc, fetchPage, RELIST_DAYS);
    if (!sw.fail) { ctx.salesWide = {}; for (const r of sw.rows) { const k = String(r.vin_norm || "") || r.url_norm || ""; if (k) (ctx.salesWide[k] = ctx.salesWide[k] || []).push(String(r.sale_date)); } }
  }
  const out = assertCountsOnly(aggregate(call, got.rows, ctx));
  return { ok: true, status: 200, body: { task: "valuecensus", mode: "counts", ocdSpend: 0, ...out } };
};
