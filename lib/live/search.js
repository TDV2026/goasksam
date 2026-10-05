// /buy search core (Lane C, Oct 2026). ZERO OldCarsData: reads live_listings (filled by the cron) and
// the archive. The car is resolved EXACTLY as One Box resolves it (api/sellerDecision.js oneBox path):
// resolveVehicle -> (archiveResolveToken | year-agnostic make+model | model choice) -> poolTrimFor ->
// findGeneration -> runOneBox. Engine files are imported read-only, never edited.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration, CURATED_GENERATIONS } from "../generations.js";
import { runOneBox, runOneBoxModelChoice, archiveResolveToken } from "../onebox.js";
import { poolTrimFor } from "../modelFamilies.js";
import { supabaseSelect } from "../_supabase.js";

const squash = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const words = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- 1. Understood filters, pulled out of the words before the car is resolved ----
const COLOURS = ["black", "white", "silver", "grey", "gray", "red", "blue", "green", "yellow", "orange", "brown", "beige", "gold", "purple", "burgundy", "maroon", "tan"];
function money(s) {
  const m = /\$?\s*([\d][\d,.]*)\s*(k|m|thousand|million)?\b/i.exec(s); if (!m) return null;
  let n = Number(m[1].replace(/,/g, "")); if (!Number.isFinite(n)) return null;
  const u = (m[2] || "").toLowerCase(); if (u === "k" || u === "thousand") n *= 1000; if (u === "m" || u === "million") n *= 1e6;
  return n;
}
export function parseFilters(raw) {
  let t = " " + String(raw || "").replace(/\s+/g, " ") + " ";
  const f = { gearbox: null, mileageCap: null, priceCap: null, excludeColours: [] };
  // Mileage cap first ("under 30k miles", "less than 30,000 mi", "below 20000 miles").
  t = t.replace(/\b(?:under|below|less than|max|maximum|up to|<)\s*\$?([\d][\d,.]*\s*(?:k|thousand)?)\s*(?:miles?|mi|kms?|kilomet(?:er|re)s?)\b/ig, (m0, v) => { const n = money(v); if (n) f.mileageCap = /km|kilomet/i.test(m0) ? Math.round(n * 0.621371) : n; return " "; });
  t = t.replace(/\b(?:under|below|less than|max|maximum|up to|<)\s*(\$?\s*[\d][\d,.]*\s*(?:k|m|thousand|million)?)(?=\s|$)/ig, (m0, v) => {
    const n = money(v); if (!n) return m0;
    // A bare small number after "under" is a price only when it looks like money (>= $1,000 or a k/$ marker).
    if (n < 1000 && !/[$k]/i.test(v)) return m0;
    f.priceCap = n; return " ";
  });
  if (/\b(manual|stick|stickshift|6-speed manual|three pedal|3 pedal)\b/i.test(t)) { f.gearbox = "manual"; t = t.replace(/\b(manual|stick(?:shift)?|three pedal|3 pedal)\b/ig, " "); }
  else if (/\b(automatic|auto|pdk|tiptronic|dct|dsg|f1 gearbox|e-?gear|smg)\b/i.test(t)) { const m = /\b(automatic|auto|pdk|tiptronic|dct|dsg|e-?gear|smg)\b/i.exec(t); f.gearbox = "auto"; f.gearboxLabel = m ? m[1] : "automatic"; t = t.replace(/\b(automatic|auto|pdk|tiptronic|dct|dsg|e-?gear|smg)\b/ig, " "); }
  t = t.replace(/\b(?:not|no|except|anything but|but not)\s+(black|white|silver|grey|gray|red|blue|green|yellow|orange|brown|beige|gold|purple|burgundy|maroon|tan)\b/ig, (m0, c) => { f.excludeColours.push(c.toLowerCase()); return " "; });
  t = t.replace(/\b(for sale|live|auction|auctions|looking for|i want|find me|show me|a|an)\b/ig, " ");
  return { text: t.replace(/\s+/g, " ").trim(), filters: f };
}

// ---- 2. Resolve the car exactly as One Box does ----
export async function resolveLikeOneBox(text, env) {
  const resolution = await resolveVehicle(text, {});
  let vehicle = null;
  if (resolution.status === "valid") vehicle = resolution.vehicle;
  else {
    if (!(resolution.vehicle && resolution.vehicle.model)) {
      const cleaned = text.replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
      const toks = cleaned.split(/\s+/).filter(t => t.length >= 2);
      const phrases = [cleaned, ...toks.filter(t => t.length >= 3)].filter((v, i, a) => v && a.indexOf(v) === i);
      try { const tok = await archiveResolveToken(phrases, env, toks); if (tok && tok.make && tok.model) vehicle = { make: tok.make, model: tok.model, year: (resolution.vehicle && resolution.vehicle.year) || null, raw: text }; } catch {}
    }
    if (!vehicle && resolution.vehicle && resolution.vehicle.make && resolution.vehicle.model) vehicle = sanitizeResolvedVehicle(resolution.vehicle) || resolution.vehicle;
    else if (!vehicle && resolution.vehicle && resolution.vehicle.make) {
      const mc = await runOneBoxModelChoice(resolution.vehicle, env);
      if (mc) return { choice: mc };
      return { clarification: resolution.clarification || { question: "What year, make and model are you looking for?" } };
    } else if (!vehicle) return { clarification: resolution.clarification || { question: "What year, make and model are you looking for?" } };
  }
  const poolAlias = poolTrimFor(vehicle);
  if (poolAlias) vehicle.fetchTrim = poolAlias;
  const generation = await findGeneration(vehicle, env);
  return { vehicle, generation };
}

// ---- 3. The One Box answer for a family, cached per family for an hour ----
const rangeCache = new Map();
export async function familyAnswer(vehicle, generation, text, env, refine, asked) {
  const key = JSON.stringify([vehicle.make, vehicle.model, vehicle.trim, vehicle.year, vehicle.bodyStyle, generation && generation.code, refine && refine.tx, refine && refine.variant, asked]);
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.d;
  const d = await Promise.race([
    runOneBox(vehicle, generation, text, { ...env, exactSale: null, asked: Math.max(0, Math.min(9, Number(asked) || 0)) }, refine || null),
    new Promise((_, rej) => setTimeout(() => rej(new Error("deadline")), 18000))
  ]).catch(e => { console.error("buy familyAnswer:", e && e.message); return null; });
  if (d) rangeCache.set(key, { at: Date.now(), d });
  if (rangeCache.size > 300) rangeCache.delete(rangeCache.keys().next().value);
  return d;
}
// What the /buy card may show for a family: the cluster only when One Box itself would headline it.
export function marketOf(d) {
  if (!d) return null;
  const win = /twelve|12 months/.test(d.windowLabel || "") ? "the past year" : d.tier === "thin" ? "the past three years" : "the past two years";
  if (d.tier === "result" && Array.isArray(d.cluster)) return { kind: "range", low: d.cluster[0], high: d.cluster[1], count: d.poolN || null, window: win };
  const n = d.tier === "thin" ? ((d.thin && d.thin.receipts) || []).length : (d.poolN || 0);
  if (n > 0) return { kind: "count", count: n, window: win };
  return null;
}

// ---- 4. Live listings for the family, ranked by closeness ----
const OTHER_BODIES = { coupe: /\b(cabriolet|convertible|targa|spyder|spider|roadster|speedster)\b/i, cabriolet: /\b(coupe|targa)\b/i, convertible: /\b(coupe|targa)\b/i, targa: /\b(coupe|cabriolet|convertible)\b/i };
const isManualText = s => /\b(manual|\d-speed(?! (?:pdk|automatic|auto|tiptronic|dct))|stick)\b/i.test(s) && !/\b(pdk|automatic|tiptronic|dct|dsg|smg|e-?gear)\b/i.test(s);
const isAutoText = s => /\b(pdk|automatic|tiptronic|dct|dsg|smg|e-?gear|f1)\b/i.test(s);
// A chassis-code model ("997", "E46") names a generation of a parent nameplate: titles say "911".
export function chassisGen(vehicle) {
  const mk = squash(vehicle && vehicle.make), md = squash(vehicle && vehicle.model);
  return CURATED_GENERATIONS.find(g => squash(g.make) === mk && squash(g.code) === md) || null;
}
export function yearWindow(vehicle, generation) {
  if (generation && Number(generation.yearStart)) return [Number(generation.yearStart), Number(generation.yearEnd) || 2100];
  const cg = chassisGen(vehicle); if (cg) return [cg.yearStart, cg.yearEnd];
  if (vehicle.year) return [Number(vehicle.year) - 2, Number(vehicle.year) + 2];
  return null;
}
export async function liveForFamily(env, vehicle, generation, filters, limit = 5) {
  if (!vehicle || !vehicle.make) return { rows: [], total: 0 };
  const make = String(vehicle.make).split(/[\s-]/)[0];
  const sel = "id,source,source_listing_id,url,listing_title,make,model,year,vin_norm,mileage,body,transmission,location,country,currency,current_bid,current_bid_usd,end_time,photo_url";
  const rows = (await supabaseSelect(env, `live_listings?status=eq.live&make=ilike.${encodeURIComponent(make + "*")}&select=${sel}&order=end_time.asc.nullslast&limit=1000`)) || [];
  const now = Date.now();
  const cg = chassisGen(vehicle);
  const model = squash(cg ? cg.model : vehicle.model), trim = squash(vehicle.fetchTrim || vehicle.trim || "");
  const genCode = generation && generation.code ? squash(generation.code) : (cg ? squash(cg.code) : "");
  const yw = yearWindow(vehicle, generation);
  const f = filters || {};
  const out = [];
  for (const r of rows) {
    if (r.end_time && Date.parse(r.end_time) < now - 3600e3) continue;
    const t = r.listing_title || "", st = squash(t + " " + (r.model || ""));
    if (!(st.includes(model) || (genCode && st.includes(genCode)))) continue;
    if (yw && r.year && (r.year < yw[0] || r.year > yw[1])) continue;
    const body = String(vehicle.bodyStyle || "").toLowerCase();
    if (body && OTHER_BODIES[body] && OTHER_BODIES[body].test(t + " " + (r.body || ""))) continue;
    if (f.excludeColours && f.excludeColours.some(c => new RegExp("\\b" + c + "\\b", "i").test(t))) continue;
    const gb = (r.transmission || "") + " " + t;
    if (f.gearbox === "manual" && isAutoText(gb) && !isManualText(gb)) continue;
    if (f.gearbox === "auto" && isManualText(gb) && !isAutoText(gb)) continue;
    if (f.priceCap && r.current_bid_usd && r.current_bid_usd > f.priceCap) continue;
    if (f.mileageCap && r.mileage && r.mileage > f.mileageCap) continue;
    // Closeness: same family (trim named in the title) first, then how many stated filters are
    // CONFIRMED (not just not-contradicted), then ending soonest.
    const family = trim ? (st.includes(trim) ? 2 : 0) : 2;
    if (trim && !family) continue;
    let confirmed = 0;
    if (f.gearbox === "manual" && isManualText(gb)) confirmed++;
    if (f.gearbox === "auto" && isAutoText(gb)) confirmed++;
    if (f.priceCap && r.current_bid_usd) confirmed++;
    if (f.mileageCap && r.mileage) confirmed++;
    out.push({ r, family, confirmed });
  }
  out.sort((a, b) => b.family - a.family || b.confirmed - a.confirmed || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  return { rows: out.slice(0, limit).map(x => x.r), total: out.length };
}

// ---- 5. Has this exact car been to auction before? (by vin_norm) ----
export async function seenBefore(env, vinNorm) {
  if (!vinNorm || vinNorm.length < 6) return null;
  const [s, a] = await Promise.all([
    supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(vinNorm)}&select=sale_date,sale_price,sale_price_usd,mileage,platform&order=sale_date.desc&limit=1`),
    supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(vinNorm)}&select=attempt_date,high_bid,high_bid_usd,source_slug,mileage:raw_record->>mileage&order=attempt_date.desc&limit=1`)
  ]);
  const sale = s && s[0], att = a && a[0];
  const sd = sale ? String(sale.sale_date || "").slice(0, 10) : "", ad = att ? String(att.attempt_date || "").slice(0, 10) : "";
  const n = v => { const x = Number(String(v == null ? "" : v).replace(/[^\d.]/g, "")); return Number.isFinite(x) && x > 0 ? Math.round(x) : null; };
  if (sale && (!att || sd >= ad)) return { result: "sold", date: sd, priceUsd: n(sale.sale_price_usd) || n(sale.sale_price), miles: n(sale.mileage), historyUrl: `/vin/${vinNorm}` };
  if (att) return { result: "unsold", date: ad, priceUsd: n(att.high_bid_usd) || n(att.high_bid), miles: n(att.mileage), historyUrl: `/vin/${vinNorm}` };
  return null;
}

// Family label for the resolved line ("997 Carrera S coupes").
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders", wagon: "wagons" };
export function familyLabel(vehicle, generation) {
  const model = String(vehicle.model || ""), trim = String(vehicle.trim || "");
  let head = trim && !squash(model).includes(squash(trim)) && !squash(trim).includes(squash(model)) ? model + " " + trim : (trim || model);
  const g = generation && generation.code ? String(generation.code) : (vehicle.genCode || "");
  if (g && /^[a-z]?\d{2,3}(\.\d)?$/i.test(g) && !squash(head).includes(squash(g)) && !/mercedes|benz/i.test(vehicle.make || "")) head = g.toUpperCase() + " " + head.replace(/^911\s+/, "");
  const bw = vehicle.bodyStyle ? BODY_PLURAL[String(vehicle.bodyStyle).toLowerCase()] : "";
  return bw ? head + " " + bw : head + "s";
}
export { words };
