// VIN history data (Lane C, Oct 2026). READ ONLY, archive only, zero OldCarsData spend.
// ONE lookup function (vinAppearances) reads sales_archive by vin_norm and auction_attempts by
// chassis_vin_norm, with the SAME normalisation as findVinArchiveMatch (lib/_flags.js): strip every
// non-alphanumeric, upper-case. When Lane A's vin_index table lands, only vinAppearances changes.
import { resolveVehicle, sanitizeResolvedVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
import { runOneBox } from "../lib/onebox.js";
import { supabaseSelect } from "../lib/_supabase.js";
import { isPartsListing, isMemorabilia } from "../lib/_classify.js";

export function normVin(s) { return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
export function historyEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return supabaseUrl && supabaseKey ? { supabaseUrl, supabaseKey } : null;
}

const HOUSE = {
  bringatrailer: "Bring a Trailer", carsandbids: "Cars & Bids", pcarmarket: "PCarMarket", hagerty: "Hagerty",
  acc: "All Collector Cars", allcollectorcars: "All Collector Cars", gooding: "Gooding & Co", rmsothebys: "RM Sotheby's",
  hemmings: "Hemmings", sothebysmotorsport: "Sotheby's Motorsport", mbmarket: "MB Market", autohunter: "AutoHunter",
  barrettjackson: "Barrett-Jackson", mecum: "Mecum", bonhams: "Bonhams", broadarrow: "Broad Arrow",
  carandclassic: "Car & Classic", collectingcars: "Collecting Cars", themarket: "The Market", pistonheads: "PistonHeads"
};
export function houseName(s) { const k = String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return HOUSE[k] || (s ? String(s) : ""); }

function num(v) { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; }
function usdOf(native, usd, currency) {
  const u = num(usd); if (u) return { usd: u, native: null, currency: null };
  const n = num(native); if (!n) return { usd: null, native: null, currency: null };
  const c = String(currency || "USD").toUpperCase();
  return c === "USD" ? { usd: n, native: null, currency: null } : { usd: null, native: n, currency: c };
}

// Every appearance of one VIN, newest first, de-duplicated exactly as findVinArchiveMatch does
// (sale identity = date + rounded price; an attempt on a recorded sale day is dropped).
export async function vinAppearances(env, vin) {
  const want = normVin(vin);
  if (!env || !want) return { vinNorm: want, appearances: [], ok: false };
  // Lane A's vin_index (one row per appearance, already de-duplicated) when it exists; the direct
  // sales_archive + auction_attempts read below is the fallback until then.
  const vi = await supabaseSelect(env, `vin_index?vin_norm=eq.${encodeURIComponent(want)}&select=appearance_date,source,url,listing_title,make,model,model_family,vehicle_type,year,mileage,result,price_usd,currency,country,photo_url&order=appearance_date.desc.nullslast&limit=80`);
  if (Array.isArray(vi) && vi.length) {
    const summary = await supabaseSelect(env, `vin_summary?vin_norm=eq.${encodeURIComponent(want)}&select=*&limit=1`);
    const apps = vi.map(r => { const sold = /^sold|^ended_sold|^sale/i.test(String(r.result || "")); const p = num(r.price_usd); return {
      kind: sold ? "sale" : "attempt", date: String(r.appearance_date || "").slice(0, 10) || null,
      priceUsd: sold ? p : null, bidUsd: sold ? null : p, nativePrice: null, nativeBid: null, currency: null,
      house: houseName(r.source), url: r.url || null, mileage: num(r.mileage), title: r.listing_title || "", image: r.photo_url || null,
      year: Number(r.year) || null, make: r.make || null, model: r.model || null, body: null, color: null }; });
    return { vinNorm: want, appearances: apps, ok: true, source: "vin_index", summary: Array.isArray(summary) && summary[0] ? summary[0] : null };
  }
  const sSel = (usd) => "vin_norm,sale_date,sale_price," + (usd ? "sale_price_usd," : "") + "platform,listing_title,year,make,model,mileage," +
    "img:raw_record->>featured_image_url,url:raw_record->>url,url2:raw_record->>source_url,currency:raw_record->>currency," +
    "body:raw_record->>body_style,color:raw_record->>exterior_color,rtitle:raw_record->>title";
  let sales = await supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(want)}&select=${sSel(true)}&order=sale_date.desc.nullslast&limit=60`);
  if (sales == null) sales = await supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(want)}&select=${sSel(false)}&order=sale_date.desc.nullslast&limit=60`);
  const aSel = (usd) => "source_slug,attempt_date,high_bid," + (usd ? "high_bid_usd," : "") + "auction_status,make,model,year," +
    "title:raw_record->>title,img:raw_record->>featured_image_url,url:raw_record->>url,url2:raw_record->>source_url," +
    "mileage:raw_record->>mileage,currency:raw_record->>currency";
  let atts = await supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(want)}&select=${aSel(true)}&order=attempt_date.desc.nullslast&limit=60`);
  if (atts == null) atts = await supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(want)}&select=${aSel(false)}&order=attempt_date.desc.nullslast&limit=60`);
  if (sales == null && atts == null) return { vinNorm: want, appearances: [], ok: false };
  const out = [], seen = new Set(), saleDays = new Set();
  for (const r of sales || []) {
    const day = String(r.sale_date || "").slice(0, 10);
    const key = day + "|" + Math.round(Number(r.sale_price) || 0);
    if (seen.has(key)) continue; seen.add(key); if (day) saleDays.add(day);
    const p = usdOf(r.sale_price, r.sale_price_usd, r.currency);
    out.push({ kind: "sale", date: day || null, priceUsd: p.usd, nativePrice: p.native, currency: p.currency,
      house: houseName(r.platform), url: r.url || r.url2 || null, mileage: num(r.mileage),
      title: r.listing_title || r.rtitle || "", image: r.img || null, year: Number(r.year) || null,
      make: r.make || null, model: r.model || null, body: r.body || null, color: r.color || null });
  }
  const aSeen = new Set();
  for (const a of atts || []) {
    const day = String(a.attempt_date || "").slice(0, 10);
    if (day && saleDays.has(day)) continue;
    const key = day + "|" + Math.round(Number(a.high_bid) || 0);
    if (aSeen.has(key)) continue; aSeen.add(key);
    const p = usdOf(a.high_bid, a.high_bid_usd, a.currency);
    out.push({ kind: "attempt", date: day || null, bidUsd: p.usd, nativeBid: p.native, currency: p.currency,
      status: a.auction_status || null, house: houseName(a.source_slug), url: a.url || a.url2 || null,
      mileage: num(a.mileage), title: a.title || "", image: a.img || null, year: Number(a.year) || null,
      make: a.make || null, model: a.model || null, body: null, color: null });
  }
  out.sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  return { vinNorm: want, appearances: out, ok: true, source: "archive" };
}

// A listing title cleaned to the car's name: no BaT mileage hook, no chassis/VIN clause, no lot code.
export function cleanTitle(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/^\s*[\d,.]+\s*k?\s*-?\s*(mile|kilometer|km)s?\b'?s?\s*/i, "")
    .replace(/\s*\b(?:vin|chassis|engine|s\/n|serial)\b\.?\s*(?:no\.?|number|#)?\s*[:.]?\s*\*?[A-Za-z0-9][A-Za-z0-9*\/\-]{3,}\*?/ig, "")
    .replace(/\s*\([^)]*\)/g, "").replace(/\s+\d+[-\s]speed\b/ig, "")
    .replace(/\s{2,}/g, " ").replace(/[\s,;-]+$/, "").trim();
}
const squash = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function slugify(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
// Family = model plus the trim when the trim adds to it ("812" + "GTS" -> "812 GTS").
export function familyOf(v) {
  const model = String(v.model || "").trim(), trim = String(v.trim || "").trim();
  if (!trim || squash(model).includes(squash(trim))) return model;
  if (squash(trim).includes(squash(model))) return trim;
  return model + " " + trim;
}
export function carSlug(id) { return [id.year, slugify(id.make), slugify(id.family)].filter(Boolean).join("-"); }

async function resolveText(text) {
  try {
    const r = await resolveVehicle(text, {});
    const v = r && r.vehicle ? (sanitizeResolvedVehicle(r.vehicle) || r.vehicle) : null;
    return v && v.make && v.model ? v : null;
  } catch { return null; }
}

// Identity of the car behind a VIN, or null when it is NOT a car: every appearance's title must name
// the same make and model (a VIN shared by a Bonhams automobilia sale reads as several different
// things, so it is not a car), and no appearance may be a parts or memorabilia lot.
export async function carIdentity(apps, vin) {
  if (!apps.length) return null;
  const titled = apps.filter(a => a.title);
  if (!titled.length) return null;
  if (titled.some(a => isMemorabilia(a.title) || isPartsListing(a.title, a.mileage))) return null;
  const newest = titled[0];
  let v = await resolveText(cleanTitle(newest.title));
  if (!v && /^[A-Z0-9]{17}$/.test(normVin(vin))) {
    try { const r = await resolveVehicle(normVin(vin), { vinConfirm: true }); const dv = r && r.vehicle; if (dv && dv.make && dv.model) v = sanitizeResolvedVehicle(dv) || dv; } catch {}
  }
  if (!v) return null;
  const mk = squash(v.make), md = squash(v.model);
  const names = t => { const s = squash(t); return (s.includes(mk) || s.includes(squash(String(v.make).split(/[\s-]/)[0]))) && s.includes(md); };
  if (!titled.every(a => names(a.title))) return null;
  const year = Number(v.year) || newest.year || Number((cleanTitle(newest.title).match(/\b(18|19|20)\d{2}\b/) || [])[0]) || null;
  const family = familyOf(v);
  const id = { year, make: v.make, model: v.model, trim: v.trim || null, family, genCode: v.genCode || null,
    bodyStyle: v.bodyStyle || (apps.find(a => a.body) || {}).body || null, vehicle: { ...v, year } };
  id.slug = carSlug(id);
  return id;
}

// The One Box answer for the car's family, computed by the engine exactly as One Box does
// (resolved vehicle -> findGeneration -> runOneBox). A first call that comes back as a question
// is re-run at the engine's own two-question cap, which answers across the variants and says so.
export async function oneBoxFor(env, id, exactSale) {
  try {
    const vehicle = { ...id.vehicle };
    if (id.bodyStyle && !vehicle.bodyStyle) vehicle.bodyStyle = id.bodyStyle;
    const text = [id.year, id.make, id.family].filter(Boolean).join(" ");
    vehicle.raw = vehicle.raw || text;
    const generation = await findGeneration(vehicle, env);
    const run = (asked) => Promise.race([
      runOneBox(vehicle, generation, text, { ...env, exactSale: exactSale || null, asked }, null),
      new Promise((_, rej) => setTimeout(() => rej(new Error("deadline")), 15000))
    ]);
    let d = await run(0);
    if (d && /_choice$/.test(String(d.tier || ""))) d = await run(2);
    return d && d.tier ? d : null;
  } catch (e) { console.error("history oneBoxFor failed:", (e && e.message) || e); return null; }
}

// Multi-word makes, so a hub slug splits make from model correctly.
const MULTI_MAKES = ["mercedes-benz", "mercedes-amg", "aston-martin", "alfa-romeo", "land-rover", "rolls-royce", "de-tomaso", "austin-healey", "pierce-arrow", "iso-rivolta", "facel-vega", "hispano-suiza", "de-lorean", "am-general", "mclaren-automotive"];
export function parseHubSlug(slug) {
  const t = String(slug || "").toLowerCase();
  const m = /^((?:18|19|20)\d{2})-(.+)$/.exec(t) || [null, null, t];
  if (!m[2] || !/-/.test(m[2])) return null;
  const rest = m[2];
  const mm = MULTI_MAKES.find(x => rest === x || rest.startsWith(x + "-"));
  const makeSlug = mm || rest.split("-")[0];
  const modelSlug = rest.slice(makeSlug.length + 1);
  if (!modelSlug) return null;
  return { year: m[1] ? Number(m[1]) : null, makeSlug, modelSlug };
}

// Hub rows: every VIN of one year + make + model, from the archive titles. Parts/memorabilia lots
// and rows without a VIN are left out. Grouped per VIN, newest sale first.
export async function hubVins(env, hub) {
  const toks = [...hub.makeSlug.split("-"), ...hub.modelSlug.split("-")].filter(Boolean);
  const pat = encodeURIComponent("*" + toks.join("*") + "*");
  const sSel = "vin_norm,year,sale_date,sale_price,sale_price_usd,platform,listing_title,mileage,img:raw_record->>featured_image_url,url:raw_record->>url,url2:raw_record->>source_url,currency:raw_record->>currency";
  const aSel = "chassis_vin_norm,attempt_date,high_bid,high_bid_usd,source_slug,title:raw_record->>title,img:raw_record->>featured_image_url,url:raw_record->>url,url2:raw_record->>source_url,mileage:raw_record->>mileage,currency:raw_record->>currency";
  const [sales, atts] = await Promise.all([
    supabaseSelect(env, `sales_archive?${hub.year ? "year=eq." + hub.year + "&" : ""}listing_title=ilike.${pat}&vin_norm=not.is.null&select=${sSel}&order=sale_date.desc&limit=400`),
    supabaseSelect(env, `auction_attempts?${hub.year ? "year=eq." + hub.year + "&" : ""}raw_record->>title=ilike.${pat}&chassis_vin_norm=not.is.null&select=${aSel}&order=attempt_date.desc&limit=400`)
  ]);
  if (sales == null && atts == null) return null;
  const by = new Map();
  const get = v => { if (!by.has(v)) by.set(v, { vin: v, apps: [] }); return by.get(v); };
  const sk = new Set();
  for (const r of sales || []) {
    if (!r.vin_norm || r.vin_norm.length < 6 || isMemorabilia(r.listing_title) || isPartsListing(r.listing_title, r.mileage)) continue;
    const key = r.vin_norm + "|" + String(r.sale_date || "").slice(0, 10) + "|" + Math.round(Number(r.sale_price) || 0);
    if (sk.has(key)) continue; sk.add(key);
    const p = usdOf(r.sale_price, r.sale_price_usd, r.currency);
    get(r.vin_norm).apps.push({ kind: "sale", year: Number(r.year) || null, date: String(r.sale_date || "").slice(0, 10), priceUsd: p.usd, nativePrice: p.native, currency: p.currency, house: houseName(r.platform), url: r.url || r.url2 || null, mileage: num(r.mileage), image: r.img || null, title: r.listing_title });
  }
  for (const a of atts || []) {
    if (!a.chassis_vin_norm || a.chassis_vin_norm.length < 6 || isMemorabilia(a.title) || isPartsListing(a.title, a.mileage)) continue;
    const g = get(a.chassis_vin_norm), day = String(a.attempt_date || "").slice(0, 10);
    if (g.apps.some(x => x.date === day)) continue;
    const p = usdOf(a.high_bid, a.high_bid_usd, a.currency);
    g.apps.push({ kind: "attempt", date: day, bidUsd: p.usd, nativeBid: p.native, currency: p.currency, house: houseName(a.source_slug), url: a.url || a.url2 || null, mileage: num(a.mileage), image: a.img || null, title: a.title });
  }
  const list = [...by.values()].map(g => { g.apps.sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))); g.last = g.apps[0]; g.lastSale = g.apps.find(x => x.kind === "sale") || null; return g; });
  list.sort((x, y) => String((y.lastSale || y.last).date || "").localeCompare(String((x.lastSale || x.last).date || "")));
  return list;
}

// LIVE NOW slot: only when a live_listings table exists and holds this vin_norm. Null otherwise.
export async function liveListing(env, vinNorm) {
  const rows = await supabaseSelect(env, `live_listings?vin_norm=eq.${encodeURIComponent(vinNorm)}&status=eq.live&select=source,url,listing_title,current_bid_usd,current_bid,currency,end_time&order=end_time.asc&limit=1`);
  return rows && rows.length ? rows[0] : null;
}

export async function addWatch(env, vinNorm, email) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/watch_requests?on_conflict=vin_norm,email`, {
      method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{ vin_norm: vinNorm, email }])
    });
    if (!r.ok) console.error("watch_requests insert failed", r.status, (await r.text().catch(() => "")).slice(0, 200));
    return r.ok;
  } catch (e) { console.error("watch_requests insert threw", e && e.message); return false; }
}

// ---------------------------------------------------------------- "What the listing said" (facts, never the text)
// From the newest sale's own record: the stored desc_facts markers plus a few structured listing facts
// (spec programme, history report, owners). Returned as facts; the page words them in Sam's voice.
const SPEC_PROGRAMMES = [[/tailor[\s-]?made/i, "Tailor Made"], [/\bpaint[\s-]?to[\s-]?sample\b|\bPTS\b/, "Paint to Sample"], [/\bspecial projects\b/i, "Special Projects"], [/\batelier\b/i, "Atelier"], [/\bQ by Aston Martin\b|\bQ division\b/i, "Q by Aston Martin"], [/\bad personam\b/i, "Ad Personam"], [/\bMSO\b|McLaren Special Operations/, "MSO"], [/\bbespoke\b/i, "Bespoke"], [/\bdesigno\b/i, "designo"], [/\bindividual\b(?= (?:paint|order|programme|program))/i, "Individual"]];
const MARKER_WORDS = { matching_numbers: "matching numbers", classiche: "Ferrari Classiche certification", massini: "a Marcel Massini report", documented_history: "documented history", restored: "a restoration", original_paint: "original paint", rhd: "right-hand drive", alloy_body: "an alloy body", long_nose: "the long nose" };
export async function listingSaid(env, vinNorm) {
  const rows = await supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(vinNorm)}&select=sale_date,mileage,stated_mileage,desc_facts,ld:raw_record->listing_details,own:raw_record->>ownership_history,desc:raw_record->>description&order=sale_date.desc.nullslast&limit=1`);
  const r = rows && rows[0]; if (!r) return null;
  const text = [r.desc || "", Array.isArray(r.ld) ? r.ld.join(". ") : (r.ld || ""), r.own || ""].join(" . ");
  const miles = num(r.mileage) || num(r.stated_mileage);
  const programme = (SPEC_PROGRAMMES.find(([re]) => re.test(text)) || [])[1] || null;
  const report = /\bcarfax\b/i.test(text) ? "Carfax" : /\bautocheck\b/i.test(text) ? "AutoCheck" : null;
  let owners = null;
  const om = /\b(one|single|two|three|four|five|1|2|3|4|5)[\s-]*(?:previous\s+)?owners?\b/i.exec(text) || /\b(one)[\s-]owner\b/i.exec(text);
  if (om) { const w = om[1].toLowerCase(); owners = { one: 1, single: 1, two: 2, three: 3, four: 4, five: 5 }[w] || Number(w) || null; }
  const markers = ((r.desc_facts && r.desc_facts.markers) || []).map(m => MARKER_WORDS[m]).filter(Boolean);
  if (!miles && !programme && !report && !owners && !markers.length) return null;
  return { date: String(r.sale_date || "").slice(0, 10), miles, programme, report, owners, markers };
}

// ---------------------------------------------------------------- other cars of the same family that sold
// Same make + family tokens in the title (any year), one row per VIN, newest first. Rows link to that
// car's own VIN page; the slug uses this family, the same as carIdentity would give it.
export async function familySales(env, id, excludeVin, limit = 25) {
  const toks = [...slugify(id.make).split("-"), ...slugify(id.family).split("-")].filter(Boolean);
  const pat = encodeURIComponent("*" + toks.join("*") + "*");
  const rows = await supabaseSelect(env, `sales_archive?listing_title=ilike.${pat}&vin_norm=not.is.null&select=vin_norm,year,sale_date,sale_price,sale_price_usd,platform,listing_title,mileage,currency:raw_record->>currency&order=sale_date.desc&limit=200`);
  if (!rows) return null;
  const out = [], seen = new Set([excludeVin]);
  for (const r of rows) {
    if (!r.vin_norm || r.vin_norm.length < 11 || seen.has(r.vin_norm)) continue;
    if (isMemorabilia(r.listing_title) || isPartsListing(r.listing_title, r.mileage)) continue;
    // A modern 17-character VIN on a pre-1981 car is an archive data error (another car's VIN).
    if (Number(r.year) && Number(r.year) < 1981 && /^[A-Z0-9]{17}$/.test(r.vin_norm)) continue;
    seen.add(r.vin_norm);
    const p = usdOf(r.sale_price, r.sale_price_usd, r.currency);
    const year = Number(r.year) || null;
    out.push({ vin: r.vin_norm, year, miles: num(r.mileage), priceUsd: p.usd, nativePrice: p.native, currency: p.currency, date: String(r.sale_date || "").slice(0, 10), house: houseName(r.platform),
      href: `/history/${[year, slugify(id.make), slugify(id.family)].filter(Boolean).join("-")}/${r.vin_norm}` });
  }
  return { rows: out.slice(0, limit), more: out.length > limit, allHref: `/history/${slugify(id.make)}-${slugify(id.family)}` };
}

// ---------------------------------------------------------------- sitemap rows: VINs with a sale that has a photo
export const SITEMAP_PAGE = 1000;
export async function sitemapRows(env, page) {
  return supabaseSelect(env, `sales_archive?vin_norm=not.is.null&raw_record->>featured_image_url=not.is.null&select=vin_norm,year,listing_title,sale_date&order=id.asc&limit=${SITEMAP_PAGE}&offset=${page * SITEMAP_PAGE}`);
}
export async function sitemapCount(env) {
  try {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/sales_archive?vin_norm=not.is.null&raw_record->>featured_image_url=not.is.null&select=id&limit=1`, { headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=estimated" } });
    const cr = r.headers.get("content-range") || ""; const n = Number(cr.split("/")[1]);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
export { resolveText };
