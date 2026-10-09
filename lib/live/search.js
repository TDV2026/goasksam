// /buy search core (Lane C, Oct 2026). ZERO OldCarsData: reads live_listings (filled by the cron) and
// the archive. /buy NEVER asks: a broad search shows every match, and the reader narrows with facet
// chips. The car is resolved with One Box's own resolver (resolveVehicle / archiveResolveToken) and
// generations; each card's market line is One Box's answer (runOneBox) for THAT listing's family, at
// the engine's tier rules. Engine files are imported read-only, never edited.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration, CURATED_GENERATIONS } from "../generations.js";
import { runOneBox, archiveResolveToken, buildSpec, qualifyReason } from "../onebox.js";
import { poolTrimFor } from "../modelFamilies.js";
import { restomodReason } from "../modelRules.js";
import { supabaseSelect, supabaseSelectAll } from "../_supabase.js";
import { projectFlagReason } from "../_classify.js";
import { liveTrust, specialAsked } from "./liveTrust.js";
import { classifyUnknown } from "../_unknownClassify.js";

const squash = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------- vocabularies
export const BODIES = ["coupe", "cabriolet", "convertible", "targa", "roadster", "spyder", "spider", "speedster", "sedan", "wagon", "hatchback", "shooting brake", "pickup", "suv"];
const BODY_RE = { coupe: /\bcoup[eé]s?\b/i, cabriolet: /\bcabriolets?\b|\bcabrio\b/i, convertible: /\bconvertibles?\b|\bdrop-?top\b/i, targa: /\btargas?\b/i, roadster: /\broadsters?\b/i, spyder: /\bspyders?\b/i, spider: /\bspiders?\b/i, speedster: /\bspeedsters?\b/i, sedan: /\bsedans?\b|\bsaloons?\b/i, wagon: /\bwagons?\b|\bestate\b|\bavant\b/i, hatchback: /\bhatchbacks?\b/i, "shooting brake": /\bshooting brake\b/i, pickup: /\bpickups?\b|\bpick-up\b/i, suv: /\bsuvs?\b/i };
// Open bodies are one family for a buyer typing "convertible": cabriolet/convertible/roadster/spyder/spider/speedster.
const OPEN = ["cabriolet", "convertible", "roadster", "spyder", "spider", "speedster"];
export const COLOURS = { black: ["black", "nero", "schwarz", "noir", "ebony", "obsidian", "jet black"], white: ["white", "bianco", "weiss", "blanc", "ivory", "pearl"], silver: ["silver", "argento", "rhodium"], grey: ["grey", "gray", "graphite", "gunmetal", "slate", "agate", "quartzite", "nardo"], red: ["red", "rosso", "carmine", "rot", "rouge", "burgundy", "maroon", "bordeaux"], blue: ["blue", "blu", "azzurro", "navy", "gentian", "sapphire", "cobalt", "azure"], green: ["green", "verde", "brg", "olive", "python"], yellow: ["yellow", "giallo"], orange: ["orange", "arancio", "papaya"], brown: ["brown", "bronze", "mocha", "chestnut", "cognac", "espresso"], beige: ["beige", "tan", "sand", "cream", "champagne"], gold: ["gold", "golden"], purple: ["purple", "viola", "amethyst", "violet", "plum"] };
const COLOUR_ALT = Object.keys(COLOURS).concat(["gray"]).join("|");
export function colourKey(w) { w = String(w || "").toLowerCase(); if (w === "gray") return "grey"; return COLOURS[w] ? w : null; }
const HOUSE_ALIASES = { bringatrailer: ["bring a trailer", "bat", "bringatrailer"], carsandbids: ["cars and bids", "cars & bids", "c&b", "carsandbids"], pcarmarket: ["pcarmarket", "pcar market"], hagerty: ["hagerty"], acc: ["all collector cars"], gooding: ["gooding"], rmsothebys: ["rm sotheby's", "rm sothebys"], hemmings: ["hemmings"], sothebysmotorsport: ["sotheby's motorsport", "sothebys motorsport"], mbmarket: ["mb market", "mbmarket"], barrettjackson: ["barrett-jackson", "barrett jackson"], mecum: ["mecum"], bonhams: ["bonhams"], broadarrow: ["broad arrow"], carandclassic: ["car & classic", "car and classic", "carandclassic"], collectingcars: ["collecting cars", "collectingcars"], themarket: ["the market"], pistonheads: ["pistonheads", "piston heads"] };
export const COUNTRIES = { US: ["us", "usa", "united states", "america", "the states"], GB: ["uk", "united kingdom", "britain", "great britain", "england"], DE: ["germany", "deutschland"], AU: ["australia"], CA: ["canada"], FR: ["france"], IT: ["italy"], NL: ["netherlands", "holland"], CH: ["switzerland"], BE: ["belgium"], AE: ["uae", "dubai"], JP: ["japan"], NZ: ["new zealand"], ES: ["spain"], SE: ["sweden"], MC: ["monaco"], IE: ["ireland"], AT: ["austria"] };
export const COUNTRY_NAME = { US: "United States", GB: "United Kingdom", DE: "Germany", AU: "Australia", CA: "Canada", FR: "France", IT: "Italy", NL: "Netherlands", CH: "Switzerland", BE: "Belgium", AE: "United Arab Emirates", JP: "Japan", NZ: "New Zealand", ES: "Spain", SE: "Sweden", MC: "Monaco", IE: "Ireland", AT: "Austria" };

// ---------------------------------------------------------------- 1. understand everything typed
function amount(v, unit) {
  let n = Number(String(v).replace(/[,\s$]/g, "")); if (!Number.isFinite(n)) return null;
  const u = String(unit || "").toLowerCase();
  if (u === "k" || u === "thousand" || u === "grand") n *= 1000; else if (u === "m" || u === "million" || u === "mil") n *= 1e6;
  return n;
}
export function emptyFilters() { return { vehicle: null, kind: null, bodies: [], colours: [], notColours: [], gearbox: null, gearboxLabel: null, miMax: null, miMin: null, priceMax: null, priceMin: null, bidMin: null, bidMax: null, has: null, countries: [], houses: [], gens: [], yearMin: null, yearMax: null }; }
// CARS BY DEFAULT (Oct 2026, Sam): every live search (the Buy chat, Tasks, the Buy landing) returns cars
// only, and motorcycles only when the buyer says motorcycle, motorbike or bike, or names a bike model.
// A listing is a motorcycle by the shared classifier (lib/_unknownClassify.js: moto marques, a moto
// make with a moto signal, cc/cafe racer/scooter, known bike models) or by BMW's motorcycle naming on
// the MODEL (R/K/F/G/S/C/HP + number, R nineT), never on the whole title (engine codes like "S54").
// BMW Motorrad numbering only: R + 2-4 digits, K + 1-4, F/G/C + 3 (car chassis codes F10/F80/G82 have 2),
// S + 4 (S1000RR), HP + 1, R nineT. Checked on the model AND on the words right after "BMW" in the title
// (the feed's model for a bike can be a bare letter or a series name), never on the whole title.
const BMW_BIKE_MODEL = /^(?:r\s?\d{2,4}|k\s?\d{1,4}|[fgc]\s?\d{3}|s\s?\d{4}|hp\s?\d|r\s?nine\s?t)(?:[a-z\/\-]{0,4}\d{0,2}[a-z]{0,3})?\b/i;
function afterMake(r) {
  const t = String(r.listing_title || ""), m = /\bbmw\b/i.exec(t);
  return m ? t.slice(m.index + 3).trim().split(/\s+/).slice(0, 3).join(" ") : "";
}
export function isMotorcycle(r) {
  if (!r) return false;
  const bmw = /^bmw\b/i.test(String(r.make || "").trim()) || (!r.make && /\bbmw\b/i.test(String(r.listing_title || "")));
  if (bmw && (BMW_BIKE_MODEL.test(String(r.model || "").trim()) || BMW_BIKE_MODEL.test(afterMake(r)))) return true;
  try { return classifyUnknown({ listing_title: r.listing_title || "" }).vehicle_type === "motorcycle"; } catch { return false; }
}
// The buyer named a bike model ("BMW R90S", "Ducati 900SS"): the search is for motorcycles.
export function namesBike(text) {
  const t = String(text || "").trim(); if (!t) return false;
  const m = /\bbmw\s+(\S+(?:\s?nine\s?t)?)/i.exec(t);
  if (m && BMW_BIKE_MODEL.test(m[1])) return true;
  try { return classifyUnknown({ listing_title: t }).vehicle_type === "motorcycle"; } catch { return false; }
}
// Returns { text: words left for the car resolver, filters: every understood constraint }.
export function parseQuery(raw) {
  let t = " " + String(raw || "").replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  const f = emptyFilters();
  const take = (re, fn) => { t = t.replace(re, (...a) => { fn(...a); return " "; }); };
  if (namesBike(raw)) f.vehicle = "motorcycle";
  take(/\b(?:motorcycles?|motorbikes?|bikes?)\b/ig, () => { f.vehicle = "motorcycle"; });
  const CMP_MAX = "(?:under|below|less than|max(?:imum)?|up to|no more than|<|sub)";
  const CMP_MIN = "(?:over|above|more than|at least|min(?:imum)?|>)";
  const UNIT = "(miles?|mi|kms?|kilomet(?:er|re)s?)";
  // Mileage (a distance word required): "under 50k miles", "over 20,000 mi", "less than 30k km".
  take(new RegExp("\\b" + CMP_MAX + "\\s*([\\d][\\d,.]*)\\s*(k|thousand)?\\s*" + UNIT + "\\b", "ig"), (m, v, u, unit) => { const n = amount(v, u); if (n) f.miMax = /km|kilomet/i.test(unit) ? Math.round(n * 0.621371) : n; });
  take(new RegExp("\\b" + CMP_MIN + "\\s*([\\d][\\d,.]*)\\s*(k|thousand)?\\s*" + UNIT + "\\b", "ig"), (m, v, u, unit) => { const n = amount(v, u); if (n) f.miMin = /km|kilomet/i.test(unit) ? Math.round(n * 0.621371) : n; });
  // Price: "under 70" and "under 70k" both mean $70,000; "under $70,000"; "over 1.2m"; "between 50 and 80k".
  const price = (v, u) => { let n = amount(v, u); if (n == null) return null; if (!u && n < 1000) n *= 1000; return n; };
  take(/\bbetween\s*\$?([\d][\d,.]*)\s*(k|m)?\s*(?:and|to|-)\s*\$?([\d][\d,.]*)\s*(k|m)?\b/ig, (m, a, ua, b, ub) => { f.priceMin = price(a, ua || ub); f.priceMax = price(b, ub || ua); });
  take(new RegExp("\\b" + CMP_MAX + "\\s*\\$?\\s*([\\d][\\d,.]*)\\s*(k|m|thousand|grand|million|mil)?\\b", "ig"), (m, v, u) => { const n = price(v, u); if (n) f.priceMax = n; });
  take(new RegExp("\\b" + CMP_MIN + "\\s*\\$?\\s*([\\d][\\d,.]*)\\s*(k|m|thousand|grand|million|mil)?\\b", "ig"), (m, v, u) => { const n = price(v, u); if (n) f.priceMin = n; });
  // Years: "2005 to 2008", "2005-2008", "2005+", "after 2005", "before 1973".
  take(/\b((?:18|19|20)\d{2})\s*(?:to|-|through|thru)\s*((?:18|19|20)\d{2})\b/ig, (m, a, b) => { f.yearMin = Math.min(+a, +b); f.yearMax = Math.max(+a, +b); });
  take(/\b((?:18|19|20)\d{2})\s*\+/ig, (m, a) => { f.yearMin = +a; });
  take(/\b(?:after|newer than|since)\s*((?:18|19|20)\d{2})\b/ig, (m, a) => { f.yearMin = +a; });
  take(/\b(?:before|older than|pre)\s*((?:18|19|20)\d{2})\b/ig, (m, a) => { f.yearMax = +a; });
  // A stated year filters, in every phrasing (Oct 2026): a decade ("60s", "the 1960s", "'60s",
  // "sixties"), "'66", a leading "66 Mustang", or a single "1966" anywhere. Only those years match;
  // the single year also stays in the text so the resolver still names the car.
  const DEC = { twenties: 20, thirties: 30, forties: 40, fifties: 50, sixties: 60, seventies: 70, eighties: 80, nineties: 90 };
  if (f.yearMin == null && f.yearMax == null) {
    take(/\b(?:the\s+)?(?:19|')?([2-9]0)'?s\b/ig, (m, d) => { f.yearMin = 1900 + Number(d); f.yearMax = f.yearMin + 9; });
    take(/\b(?:the\s+)?(twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/ig, (m, w) => { f.yearMin = 1900 + DEC[w.toLowerCase()]; f.yearMax = f.yearMin + 9; });
  }
  if (f.yearMin == null && f.yearMax == null) {
    const two = n => (Number(n) < 30 ? 2000 : 1900) + Number(n);
    t = t.replace(/(\s)['\u2019](\d{2})\b/, (m, sp, d) => { f.yearMin = f.yearMax = two(d); return sp + two(d) + " "; });
    if (f.yearMin == null) t = t.replace(/^\s*(\d{2})\s+(?=[a-z])/i, (m, d) => { f.yearMin = f.yearMax = two(d); return " " + two(d) + " "; });
    if (f.yearMin == null) { const y = /\b(19\d{2}|20[0-3]\d)\b/.exec(t); if (y) f.yearMin = f.yearMax = Number(y[1]); }
  }
  // Gearbox.
  take(/\b(manual|stick ?shift|stick|three[- ]pedals?|3[- ]pedals?)\b/ig, () => { f.gearbox = "manual"; f.gearboxLabel = "manual"; });
  take(/\b(automatic|auto|pdk|tiptronic|dct|dsg|smg|e-?gear|paddle ?shift)\b/ig, (m, w) => { if (!f.gearbox) { f.gearbox = "auto"; f.gearboxLabel = /pdk/i.test(w) ? "PDK" : /tiptronic/i.test(w) ? "Tiptronic" : "automatic"; } });
  // Colours: "not silver", "no black", then plain "black".
  take(new RegExp("\\b(?:not|no|except|anything but|but not|non-)\\s*(" + COLOUR_ALT + ")\\b", "ig"), (m, c) => { const k = colourKey(c); if (k && !f.notColours.includes(k)) f.notColours.push(k); });
  take(new RegExp("\\b(" + COLOUR_ALT + ")\\b", "ig"), (m, c) => { const k = colourKey(c); if (k && !f.colours.includes(k)) f.colours.push(k); });
  // Bodies (one, several, or "any body").
  take(/\b(any|all) bod(?:y|ies)( styles?)?\b/ig, () => {});
  for (const b of BODIES) take(new RegExp(BODY_RE[b].source, "ig"), () => { if (!f.bodies.includes(b)) f.bodies.push(b); });
  // Country: "in the UK", "in germany", "us only", "uk-based".
  for (const [code, names] of Object.entries(COUNTRIES)) {
    const alt = names.map(esc).join("|");
    take(new RegExp("\\b(?:in|from|located in)\\s+(?:the\\s+)?(?:" + alt + ")\\b|\\b(?:" + alt + ")\\s+only\\b|\\b(?:" + alt + ")[- ]based\\b", "ig"), () => { if (!f.countries.includes(code)) f.countries.push(code); });
  }
  // House: "on bat", "at mecum", "bring a trailer".
  for (const [slug, names] of Object.entries(HOUSE_ALIASES)) {
    const alt = names.map(esc).sort((a, b) => b.length - a.length).join("|");
    const re = slug === "bringatrailer" ? new RegExp("\\b(?:on|at|from)\\s+bat\\b|\\b(?:on\\s+|at\\s+|from\\s+)?(?:bring a trailer|bringatrailer)\\b", "ig") : new RegExp("\\b(?:on\\s+|at\\s+|from\\s+)?(?:" + alt + ")\\b", "ig");
    take(re, () => { if (!f.houses.includes(slug)) f.houses.push(slug); });
  }
  t = t.replace(/\b(or|and|for sale|live|auctions?|looking for|i want|i'?m after|find me|show me|any|a|an|the|with|from|cars?|please|one)\b/ig, " ");
  return { text: t.replace(/\s+/g, " ").trim(), filters: f };
}

// Generation is decided by year AND trim. The 911's halo trims changed over later than the base car:
// the 997 Turbo started in 2007 and the 997 GT2/GT3 in 2007-08, so a 2005-2006 Turbo, Turbo S, GT2 or
// GT3 is still a 996 even though the year-only table says 997 (a 2005 Turbo S Cabriolet is a 996).
const LATE_996_RE = /\b(turbo|gt2|gt3)\b/i;
function trimGenCode(make, model, year, title) {
  const y = Number(year);
  if (squash(make) === "porsche" && /^(911|997)$/.test(squash(model)) && (y === 2005 || y === 2006) && LATE_996_RE.test(String(title || ""))) return "996";
  return null;
}
export function genFor(make, model, year, title) {
  const mk = squash(make), md = squash(model), y = Number(year);
  if (!y) return null;
  const forced = trimGenCode(make, model, year, title);
  if (forced) return CURATED_GENERATIONS.find(g => squash(g.make) === mk && squash(g.model) === "911" && g.code === forced) || null;
  return CURATED_GENERATIONS.find(g => squash(g.make) === mk && squash(g.model) === md && y >= g.yearStart && y <= g.yearEnd) || null;
}
// findGeneration (engine) is year-only; /buy corrects the trim-year handover on top of it for a listing.
async function listingGeneration(v, title, env) {
  if (trimGenCode(v.make, v.parentModel || v.model, v.year, title + " " + (v.trim || ""))) {
    const g = genFor(v.make, "911", v.year, "turbo");
    // the late-996 halo cars run to 2005-06, past the base 996's 2004 end, so the span reaches them
    if (g) { if (v.genCode) v.genCode = g.code; return { ...g, yearEnd: Math.max(g.yearEnd, 2006) }; }
  }
  return findGeneration(v, env);
}
function chassisGens(make, model) { const mk = squash(make), md = String(model || "").toLowerCase().trim(); return CURATED_GENERATIONS.filter(g => squash(g.make) === mk && (String(g.code).toLowerCase() === md || String(g.code).toLowerCase().split(".")[0] === md)); }
function chassisGen(make, model) { return chassisGens(make, model)[0] || null; }
// Every generation code the words name for this make ("coupe or cabriolet 991", "997 or 991").
export function gensNamed(text, make) {
  const mk = squash(make), toks = String(text || "").toLowerCase().split(/[\s,/]+/).map(squash).filter(Boolean);
  const out = [];
  for (const g of CURATED_GENERATIONS) if (squash(g.make) === mk && (toks.includes(squash(g.code)) || toks.includes(String(g.code).toLowerCase().split(".")[0])) && !out.includes(g.code)) out.push(g.code);
  return out;
}

// ---------------------------------------------------------------- 2. resolve the car (never ask)
// One Box's resolver path (api/sellerDecision.js oneBox branch) minus every question: a make with no
// model searches the whole make; nothing recognisable returns null.
export async function resolveForBuy(text, env) {
  if (!text) return null;
  let res; try { res = await resolveVehicle(text, {}); } catch { res = null; }
  let v = res && res.status === "valid" ? res.vehicle : null;
  if (!v && res && res.vehicle && res.vehicle.make && res.vehicle.model) v = sanitizeResolvedVehicle(res.vehicle) || res.vehicle;
  if (!v && !(res && res.vehicle && res.vehicle.model)) {
    const cleaned = text.replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
    const toks = cleaned.split(/\s+/).filter(x => x.length >= 2);
    const phrases = [cleaned, ...toks.filter(x => x.length >= 3)].filter((p, i, a) => p && a.indexOf(p) === i);
    try { const tok = await archiveResolveToken(phrases, env, toks); if (tok && tok.make && tok.model) v = { make: tok.make, model: tok.model, year: (res && res.vehicle && res.vehicle.year) || null, raw: text }; } catch {}
  }
  if (!v && res && res.vehicle && res.vehicle.make) v = { make: res.vehicle.make, model: null, year: res.vehicle.year || null, raw: text };
  if (!v || !v.make) return null;
  v = { ...v };
  // A bare make ("porsche", "yellow porsche") is every model of that make on /buy. The shared resolver
  // may default a bare make to its best-known model; drop a model the words never named.
  const left = String(text).toLowerCase().replace(/\b(19|20)\d\d\b/g, " ").split(/[^a-z0-9-]+/).filter(Boolean).filter(w => { const mk = String(v.make).toLowerCase().split(/[\s-]+/); return !mk.includes(w) && !mk.includes(w.replace(/'?s$/, "")) && !/^(cars?|s)$/.test(w); });
  if (v.model && !left.length) { v.model = null; v.trim = null; v.generation = null; v.genCode = null; }
  // A body word the resolver filed as the trim ("Cabriolet") is a body, not a trim: never
  // "Cabriolet Cabriolets". EXCLUDED from this correction (Oct 2026, curated-trim-list audit, the
  // "one resolver" item): words that resolveVehicle's curated data (lib/vehicleData.js) resolves as
  // a genuine, distinct, often price-differentiating factory TRIM on specific models, not just a
  // body descriptor - rewriting them into v.bodyStyle here threw away real trim scoping and made
  // this file disagree with resolveVehicle/Market Check/Sell on the same car. Confirmed live
  // (trimresolvediff) on every one of these:
  //   speedster - 911/356 Speedster (a rare, much pricier edition, not just an open 911)
  //   targa     - 911 Targa/Targa 4/Targa 4S/Targa 4 GTS (PORSCHE_911_TRIMS keeps "Targa" as part of
  //               the full trim string, e.g. "Targa 4 GTS" - splitting it here left Buy/Tasks keyed
  //               on "4 GTS" alone, which also matches the non-Targa Carrera 4 GTS)
  //   roadster  - Corvette/Cobra/E-Type/300SL/Miata Roadster (on the 300SL specifically this is the
  //               open car, a different market from the Gullwing coupe - losing it pools both)
  //   spider / spyder - Ferrari 308 GTS Spider and similar; resolveVehicle keeps the compound trim
  //               ("GTS Spider"), this correction was leaving only "GTS"
  // Cabriolet/Convertible/Sedan/Wagon/Coupe/Hatchback/Shooting Brake/Pickup/SUV are unchanged - pure
  // body descriptors with no curated trim of the same name found in this audit.
  const TRIM_NOT_BODY = new Set(["speedster", "targa", "roadster", "spider", "spyder"]);
  if (v.trim) for (const b of BODIES) if (!TRIM_NOT_BODY.has(b) && BODY_RE[b].test(v.trim)) { v.trim = v.trim.replace(new RegExp(BODY_RE[b].source, "ig"), " ").replace(/\s+/g, " ").trim() || null; if (!v.bodyStyle) v.bodyStyle = b; }
  // Generation nicknames are year spans, never a trim ("G-body" = 1974 to 1989).
  const NICK = [[/\bg[- ]?body\b|\bimpact[- ]bumper\b/i, 1974, 1989], [/\blong[- ]?hood\b/i, 1964, 1973], [/\bair[- ]?cooled\b/i, 1964, 1998], [/\bwater[- ]?cooled\b/i, 1999, 2100]];
  for (const [re, a, b] of NICK) if (re.test(String(v.trim || "")) || re.test(text)) { v.trim = v.trim && re.test(v.trim) ? (v.trim.replace(re, " ").replace(/\s+/g, " ").trim() || null) : v.trim; v.yearSpan = [a, b]; }
  // A chassis-code model ("997") is a generation of its parent nameplate ("911").
  const cg = v.model ? chassisGen(v.make, v.model) : null;
  if (cg) { const all = chassisGens(v.make, v.model); v.genCode = cg.code; v.genCodes = all.map(g => g.code); v.parentModel = cg.model; }
  if (v.model) { const pa = poolTrimFor(v); if (pa) v.fetchTrim = pa; }
  return v;
}

// ---------------------------------------------------------------- 3. listing facts (never a guess)
const OTHER_TRIMS_RE = /\b(gt2|gt3|gt4|turbo|gts|rs|sport classic|speedster|carrera 4s|carrera s|carrera t|carrera 4|targa 4s|targa 4)\b/i;
const colourIn = s => { const low = " " + String(s || "").toLowerCase() + " "; for (const [k, words] of Object.entries(COLOURS)) if (words.some(w => new RegExp("\\b" + esc(w) + "\\b").test(low))) return k; return null; };
export function listingFacts(r) {
  const title = r.listing_title || "", desc = r.description || "";
  // Colour: the colour field, then the standard colour, then the title (the paint before "over"/"on"),
  // then the description ("finished in ..."). Interior/top/wheel colours are never read as paint.
  let colour = colourIn(r.exterior_color), colourSrc = colour ? "field" : null;
  if (!colour && r.std_color && !/^other$/i.test(r.std_color)) { colour = colourIn(r.std_color); if (colour) colourSrc = "field"; }
  if (!colour) {
    const over = /\b([a-z]+(?: [a-z]+){0,2})[- ](?:over|on)[- ][a-z]+/i.exec(title);
    const stripped = title.replace(/\b(black|white|tan|red|brown|beige|grey|gray|blue|green|cream)\s+(leather|interior|top|soft ?top|hardtop|wheels?|seats?|cloth)\b/ig, " ");
    colour = colourIn(over ? over[1] : "") || colourIn(stripped); if (colour) colourSrc = "title";
  }
  if (!colour && desc) { const m = /\b(?:finished|painted|refinished|presented|is shown)\s+in\s+([a-z ]{3,40}?)(?:\s+(?:over|with|and|paint)\b|[.,;])/i.exec(desc); colour = m ? colourIn(m[1]) : null; if (colour) colourSrc = "description"; }
  // Miles and price through liveTrust (shared with Tasks): miles only when the listing states miles, a
  // US lot with no stated unit (marked assumed), or kilometres converted from the stated km; a price only
  // when it is dollars (never a "USD" figure on a lot priced abroad, never a $0 bid).
  const t = liveTrust(r);
  const miles = t.miles || null, milesSrc = miles ? (t.milesAssumed ? "assumed" : t.unit === "km" ? "km" : "stated") : null;
  // Body: the title first (BaT files a Targa as a coupe or convertible in its field), then the field.
  let body = null;
  for (const b of BODIES) if (BODY_RE[b].test(title)) { body = b; break; }
  if (!body) for (const b of BODIES) if (BODY_RE[b].test(r.body || "")) { body = b; break; }
  const gtxt = (r.transmission || "") + " " + title;
  const gearbox = /\b(pdk|automatic|tiptronic|dct|dsg|smg|e-?gear|f1)\b/i.test(gtxt) ? "auto" : (/\b(manual|\d-speed|stick)\b/i.test(gtxt) ? "manual" : null);
  const gearboxLabel = gearbox === "auto" ? (/\bpdk\b/i.test(gtxt) ? "PDK" : /tiptronic/i.test(gtxt) ? "Tiptronic" : "Automatic") : gearbox === "manual" ? "Manual" : null;
  return { colour, colourSrc, miles, milesSrc, milesAssumed: t.milesAssumed, km: t.km, milesUnitUnknown: t.unit === "unknown" && Number(r.mileage) > 0, priceUsd: t.priceUsd, priceState: t.priceState, special: t.special, body, gearbox, gearboxLabel };
}

// ---------------------------------------------------------------- 4. search
export function hasWord(title, token) { return new RegExp("(^|[^a-z0-9])" + String(token).toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]?") + "([^a-z0-9]|$)", "i").test(String(title || "")); }
function bodyMatches(want, have) {
  if (!want.length) return true;
  if (!have) return null;
  if (want.includes(have)) return true;
  if (OPEN.includes(have) && want.some(w => OPEN.includes(w))) return true;
  return false;
}
const LIVE_SEL = "id,source,source_listing_id,url,listing_title,make,model,year,vin_norm,mileage,body,transmission,location,country,currency,current_bid,current_bid_usd,end_time,photo_url,last_seen,first_seen,status";
const LIVE_SEL_EXTRA = ",exterior_color,std_color,description,bid_at";
export async function liveRows(env, filterQs) {
  // has_reserve (v3) first; without that column, the v2 extras; without those, the base columns.
  // Paged (Range): PostgREST caps a response at 1000 rows whatever the limit says, and more than 1000
  // cars are live, so an unpaged read silently dropped every later-ending car from a broad search.
  const q = sel => `live_listings?status=eq.live&${filterQs}&select=${sel}&order=end_time.asc.nullslast,id.asc`;
  // The pull's v4 columns (mileage_unit, special_flag, bid_count) when they exist; else as before.
  let rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${LIVE_SEL_EXTRA},has_reserve,mileage_unit,special_flag,bid_count`));
  if (rows == null) rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${LIVE_SEL_EXTRA},has_reserve`));
  if (rows == null) rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${LIVE_SEL_EXTRA}`));
  if (rows == null) rows = (await supabaseSelectAll(env, q(LIVE_SEL))) || [];
  return rows;
}
// Every live match for the car + filters. "sure" = every stated filter confirmed; "maybe" = a stated
// filter the listing doesn't state (shown after, labelled). Facets are counted over the matches.
// opts.rows: listing rows to search instead of the live table (Tasks tests seed listings this way, so
// no test row ever enters live_listings). Same logic either way.
export async function searchLive(env, v, f0, text, opts = {}) {
  let f = f0;
  if (!v || !v.make) return { rows: [], facets: {} };
  const rows = opts.rows ? opts.rows.filter(r => squash(String(r.make || r.listing_title || "")).includes(squash(String(v.make).split(/[\s-]/)[0]))) : await liveRows(env, `make=ilike.${encodeURIComponent(String(v.make).split(/[\s-]/)[0] + "*")}`);
  const now = Date.now();
  const parent = v.parentModel || v.model || null;
  const modelTok = squash(parent), trimTok = squash(v.fetchTrim || v.trim || "");
  if (v.yearSpan && !f.yearMin && !f.yearMax) { f = { ...f, yearMin: v.yearSpan[0], yearMax: v.yearSpan[1] }; }
  let gens = f.gens.length ? f.gens : (v.genCodes && v.genCodes.length ? v.genCodes : (v.genCode ? [v.genCode] : []));
  // A single stated year keeps its own generation and ranks neighbours by distance (never only that year).
  if (!gens.length && v.year && parent && !f.yearMin && !f.yearMax) { const yg = genFor(v.make, parent, v.year); if (yg) gens = [yg.code]; }
  const tokSet = t => new Set(String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9.]+/).filter(Boolean).concat(String(t || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));
  // The engine's hard exclusions (replicas, kit cars, projects, parts) when a model is named; year,
  // body, trim and gearbox are the reader's own filters here, so those reasons are not applied.
  let spec = null;
  if (v.model) { try { spec = buildSpec({ ...v }, await findGeneration(v, env), text || [v.make, v.model, v.trim].filter(Boolean).join(" ")); } catch { spec = null; } }
  const out = [];
  // opts.trace (probe only): why each row the make read returned was left out, stage by stage.
  const skip = (r, why) => { if (opts.trace) opts.trace.push({ id: r.id, title: r.listing_title, why }); };
  // Cars by default; motorcycles only when asked (the word, or a named bike model).
  const wantBike = f.vehicle === "motorcycle" || namesBike(text || [v.make, v.model].filter(Boolean).join(" "));
  for (const r of rows) {
    if (r.end_time && Date.parse(r.end_time) < now - 3600e3) { skip(r, "ended"); continue; }
    if (isMotorcycle(r) !== wantBike) { skip(r, "motorcycle or car mismatch"); continue; }
    const title = r.listing_title || "", st = squash(title + " " + (r.model || ""));
    const toks = tokSet(title + " " + (r.model || ""));
    const hasTok = w => toks.has(String(w).toLowerCase()) || [...toks].some(t => t.replace(/[^a-z0-9]/g, "") === squash(w));
    if (modelTok && !hasTok(parent) && !(gens.length && gens.some(g => hasTok(g) || hasTok(String(g).split(".")[0])))) { skip(r, "model word not in title"); continue; }
    if (spec) {
      const why = qualifyReason({ price: Math.max(2600, Number(r.current_bid_usd) || 0), currency: "USD", image: r.photo_url || "live", raw_title: title, rtitle: title, year: r.year, mileage: r.mileage, body: r.body, transmission: r.transmission, mods: null, source: r.source }, spec);
      if (why && /replica|kit car|tribute|memorabilia|part|restomod|race|other cobra|different cobra/i.test(why)) { skip(r, "engine exclusion"); continue; }   // a project car shows, flagged on its card
    }
    // ENGINE-SWAPPED cars (Oct 2026, Sam): never a match by default (Tasks never notifies on one, the landing
    // never shows one); Buy lists them LAST with an "Engine swapped" tag (opts.allowSwaps), and anyone who
    // asks for swaps (the words) gets them as matches. Other restomods stay out as before.
    const swap = ENGINE_SWAP_RE.test(title);
    if (swap && !(opts.allowSwaps || /\bswap(?:s|ped)?\b/i.test(text || ""))) { skip(r, "engine swap"); continue; }
    if (!swap && restomodReason(title, v.make, parent)) { skip(r, "restomod"); continue; }   // Singer / reimagined / restomod: never a comp, never this car
    const gen = parent ? genFor(v.make, parent, r.year, title) : null;
    const facts = listingFacts(r);
    // Specials (Singer, RUF, RWB, Cup and race cars, replicas, tributes) only when the words ask for them.
    if (!specialAsked(facts.special, { words: text })) { skip(r, "special not asked"); continue; }
    // A stated filter the listing CONTRADICTS removes it.
    if (gens.length && !(gen && gens.includes(gen.code))) { skip(r, "generation"); continue; }
    // A stated year is strict: a listing with no year on record reads it from its own title, or is out.
    const ry = r.year || Number((/\b(19\d{2}|20[0-3]\d)\b/.exec(title) || [])[1]) || null;
    if ((f.yearMin || f.yearMax) && !ry) { skip(r, "no year"); continue; }
    if (f.yearMin && ry < f.yearMin) { skip(r, "year"); continue; }
    if (f.yearMax && ry > f.yearMax) { skip(r, "year"); continue; }
    if (v.year && !gens.length && !f.yearMin && !f.yearMax && r.year && Math.abs(r.year - Number(v.year)) > 2) { skip(r, "year distance"); continue; }
    if (bodyMatches(f.bodies, facts.body) === false) { skip(r, "body"); continue; }
    if (f.gearbox && facts.gearbox && facts.gearbox !== f.gearbox) { skip(r, "gearbox"); continue; }
    if (trimTok && !st.includes(trimTok)) { skip(r, "trim"); continue; }
    // A price that may not be dollars never meets a price limit; a $0 or missing bid is no price at all.
    if ((f.priceMax || f.priceMin) && (facts.priceState === "suspect" || facts.priceState === "unconverted")) { skip(r, "price unknown"); continue; }
    if (f.priceMax && facts.priceUsd && facts.priceUsd > f.priceMax) { skip(r, "price"); continue; }
    if (f.priceMin && facts.priceUsd && facts.priceUsd < f.priceMin) { skip(r, "price"); continue; }
    // A mileage whose unit is unknown (outside the US, nothing stated) never meets a miles limit.
    if ((f.miMax || f.miMin) && facts.milesUnitUnknown) { skip(r, "miles unit"); continue; }
    if (f.miMax && facts.miles && facts.miles > f.miMax) { skip(r, "miles"); continue; }
    if (f.miMin && facts.miles && facts.miles < f.miMin) { skip(r, "miles"); continue; }
    // The current bid (Buy's budget question, from the live bids): a bid that may not be dollars, or no
    // bid, doesn't say; a stated bid outside the band is out.
    const bidKnown = facts.priceUsd && facts.priceState !== "suspect" && facts.priceState !== "unconverted";
    if (bidKnown && f.bidMax && facts.priceUsd > f.bidMax) { skip(r, "bid"); continue; }
    if (bidKnown && f.bidMin && facts.priceUsd < f.bidMin) { skip(r, "bid"); continue; }
    // A word in the listing's own title (Buy's "which kind of fast?": GT3, Turbo, Z06), whole word only.
    if (f.has && !hasWord(title, f.has)) { skip(r, "title word"); continue; }
    if (f.colours.length && facts.colour && !f.colours.includes(facts.colour)) { skip(r, "colour"); continue; }
    if (f.notColours.length && facts.colour && f.notColours.includes(facts.colour)) { skip(r, "colour"); continue; }
    if (f.countries.length && !f.countries.includes(String(r.country || "").toUpperCase())) { skip(r, "country"); continue; }
    if (f.houses.length && !f.houses.includes(r.source)) { skip(r, "venue"); continue; }
    const unknown = [];
    if ((f.colours.length || f.notColours.length) && !facts.colour) unknown.push("colour");
    if ((f.miMax || f.miMin) && !facts.miles) unknown.push("miles");
    if (f.bodies.length && !facts.body) unknown.push("body");
    if (f.gearbox && !facts.gearbox) unknown.push("gearbox");
    if ((f.bidMin || f.bidMax) && !bidKnown) unknown.push("bid");
    // Closeness: exact trim (or, with none asked, the base car), then year distance, then ending soonest.
    const exactTrim = trimTok ? 1 : (OTHER_TRIMS_RE.test(title) ? 0 : 1);
    const targetYear = v.year ? Number(v.year) : (f.yearMin && f.yearMax ? (f.yearMin + f.yearMax) / 2 : null);
    const yearDist = targetYear && r.year ? Math.abs(r.year - targetYear) : 0;
    out.push({ r, facts, gen, unknown, exactTrim, yearDist, swap });
  }
  out.sort((a, b) => (a.swap ? 1 : 0) - (b.swap ? 1 : 0) || (a.unknown.length ? 1 : 0) - (b.unknown.length ? 1 : 0) || b.exactTrim - a.exactTrim || a.yearDist - b.yearDist || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  // read: the live rows this search started from (its make), so a widening can reuse them with no new read.
  return { rows: out, facets: facetsOf(out), read: rows };
}
function facetsOf(list) {
  const count = fn => { const m = new Map(); for (const x of list) { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })); };
  return { generation: count(x => x.gen && x.gen.code), body: count(x => x.facts.body), colour: count(x => x.facts.colour), gearbox: count(x => x.facts.gearbox), house: count(x => x.r.source), country: count(x => String(x.r.country || "").toUpperCase() || null) };
}

// ---------------------------------------------------------------- 5. each listing's OWN family + market line
const rangeCache = new Map();
// Engine reads are throttled (at most ENGINE_SLOTS at once per instance) and de-duplicated in flight:
// a page that fills many cards at once must not push each read past its deadline. A read that failed
// or timed out is NEVER cached, so one slow moment can't blank a family's line for an hour.
const ENGINE_SLOTS = 8;
let engineBusy = 0; const engineQueue = [], inflight = new Map();
const engineSlot = () => new Promise(res => { if (engineBusy < ENGINE_SLOTS) { engineBusy++; res(); } else engineQueue.push(res); });
const engineFree = () => { const next = engineQueue.shift(); if (next) next(); else engineBusy--; };
async function engineAnswer(vehicle, generation, text, env, refine) {
  const key = JSON.stringify([vehicle.make, vehicle.model, vehicle.trim, (generation && generation.code) || (vehicle.year ? "y" + vehicle.year : null), vehicle.bodyStyle, refine && refine.tx]);
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.d;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    await engineSlot();
    try {
      const run = asked => Promise.race([runOneBox(vehicle, generation, text, { ...env, exactSale: null, asked }, refine || null), new Promise((_, rej) => setTimeout(() => rej(new Error("deadline")), 25000))]);
      // A cold read can miss the deadline: try once more before giving up. A read that still fails
      // returns UNDEFINED (not null), so the caller can tell "the read didn't come back" from "the
      // engine answered and there is nothing to say", and never draws the first as the second.
      let d = null, ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try { d = await run(0); if (d && /_choice$/.test(String(d.tier || ""))) d = await run(2); ok = true; } catch { d = null; }
      }
      if (!ok) return undefined;
      if (d && /_choice$/.test(String(d.tier || ""))) d = null;
      rangeCache.set(key, { at: Date.now(), d }); if (rangeCache.size > 400) rangeCache.delete(rangeCache.keys().next().value);
      return d;
    } finally { engineFree(); inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
const marketWin = d => /twelve|12 months/.test((d && d.windowLabel) || "") ? "the past year" : (d && d.tier === "thin") ? "the past three years" : "the past two years";
export function marketOf(d) {
  if (!d) return null;
  // The engine's refusal still carries the real sales it read (thin: too few for a range; varied: too
  // spread out). Count THOSE cards, the same pool the miles note is built from, never a silent nothing.
  if (d.tier === "refusal" && (d.cards || []).length) return { kind: "count", count: d.cards.length, window: marketWin(d), spread: !!(d.refusal && d.refusal.kind === "varied") };
  if (d.tier === "result" && Array.isArray(d.cluster)) return { kind: "range", low: d.cluster[0], high: d.cluster[1], count: d.poolN || null, window: marketWin(d) };
  const n = d.tier === "thin" ? ((d.cards || []).length || ((d.thin && d.thin.receipts) || []).length) : (d.poolN || 0);
  // "Too spread out" only when the engine had enough sales for a range (its band or cluster tier) and
  // still marked none; a thin pool (3-7, or fewer) is a count, never a spread (rule 24).
  return n > 0 ? { kind: "count", count: n, window: marketWin(d), spread: d.tier === "result" && (d.rangeTier === "band" || d.rangeTier === "cluster") } : null;
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders", speedster: "Speedsters", wagon: "wagons" };
// The listing resolved to its own family (generation, trim, body, gearbox); One Box's answer for it.
// ---------------------------------------------------------------- the spec's market, cached
// What each exact spec sells for is precomputed (spec_market_cache, refreshed nightly by
// scripts/buildSpecMarketCache.js) so a search never runs the engine live. Layers: this instance's
// memory, then the table, then (blocking callers only) the engine, which also writes the cache.
// A no-block caller (the budget rule, the chat's first reply) gets "pending" on a miss and the fill
// runs in the background. The spec key is the engine-answer key: [make, model, trim, generation, body, gearbox].
const specMem = new Map(), specOfMem = new Map(), specMiss = new Map();   // specMiss: key -> when the table last had nothing
// FRESHNESS RULE (Oct 2026 follow-up, two independent conditions - either one makes a row a miss):
//  1. INGEST-TIED: scripts/ingest.js deletes every spec_market_cache row for a make/model the
//     moment it upserts a new row for that make/model (see that script's own comment). A row that
//     still exists here has, by construction, not been touched by ingest since it was computed - no
//     extra per-read query against sales_archive is added here on top of that (a MAX(created_at)
//     check on every cache read would undo the batch read this file's functions exist for).
//  2. TIME: DAY_TTL (24h) is a hard, explicit ceiling independent of SPEC_TTL (the real, tighter,
//     day-to-day operative value below, currently 6h) - stated as its own constant so loosening
//     SPEC_TTL later can never silently let week-old data pass as "cached, not stale". Every
//     freshness check below reads Math.min(SPEC_TTL, DAY_TTL), so today's behavior is unchanged
//     (6h < 24h) while the 1-day contract is enforced in code, not just true by coincidence of the
//     current SPEC_TTL tuning.
const SPEC_TTL = 6 * 3600e3, DAY_TTL = 24 * 3600e3, SPEC_V = 6;   // SPEC_V: the ladder-era cache shape
const EFFECTIVE_TTL = Math.min(SPEC_TTL, DAY_TTL);
// ONE key builder (Oct 2026 follow-up, item 1): specOf (below) and api/sellerDecision.js's
// opportunistic refresh (via coreOf/persistCore above) both call this, so a card-side key and a
// Market-Check/drawer-side key for the SAME car are constructed identically, never two slightly
// different formats that silently miss each other. Safe to share now that resolveVehicle and
// resolveForBuy agree on trim/bodyStyle for every curated case (the Oct 2026 trim-list audit) - a
// key built from either resolver's output names the same spec.
export function specKeyFor(v, generation, refine) {
  return JSON.stringify([v.make, v.model, v.trim, (generation && generation.code) || (v.year ? "y" + v.year : null), v.bodyStyle, refine && refine.tx]);
}
export async function specOf(env, row, facts) {
  const title = String(row.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
  const mk = title + "|" + (row.year || "") + "|" + (facts.body || "") + "|" + (facts.gearbox || "");
  if (specOfMem.has(mk)) return specOfMem.get(mk);
  const v = await resolveForBuy(title, env);
  let spec = null;
  if (v && v.model) {
    if (row.year) v.year = row.year;
    if (facts.body && !v.bodyStyle) v.bodyStyle = facts.body;
    const generation = await listingGeneration(v, title, env);
    const refine = facts.gearbox ? { tx: facts.gearbox, label: facts.gearboxLabel || facts.gearbox } : null;
    // With no generation the key carries the model year, or a 2017 and a 2019 Cayenne Turbo would share
    // one cache entry (and one generation's sales).
    spec = { title, v, generation, refine, key: specKeyFor(v, generation, refine) };
  }
  specOfMem.set(mk, spec); if (specOfMem.size > 5000) specOfMem.delete(specOfMem.keys().next().value);
  return spec;
}
// The engine's answer reduced to what /buy needs (serialisable; one per spec).
// Exported (Oct 2026 follow-up, item 1): api/sellerDecision.js's oneBox branch (Market Check and
// the Buy drawer both call it) uses this plus persistCore below to opportunistically refresh THIS
// spec's card cache after every live engine call that lands on a clean result - not a second
// implementation, the SAME reduction every card already reads. Closes the "stale between ingests"
// gap items 1/2 left open: on top of the ingest-tied invalidation and the 1-day ceiling, popular
// specs now self-refresh on ordinary traffic, often well inside either window.
export function coreOf(d, spec) {
  const m = marketOf(d); if (!m) return null;
  const { v, generation, refine } = spec;
  const rc = (d && d.resolvedCar) || v;
  // Prefer the One Box-CORRECTED generation code (rc.genCode): it carries the trim-year re-bind (a
  // 1987 Turbo is 930, not 3.2 Carrera) and the body code (M3 sedan E90), so the family noun matches
  // the engine. Fall back to the listing generation only when the engine did not resolve one.
  let gc = (rc && rc.genCode) || (generation && generation.code) || null;
  if (gc && /^(first|second|third|fourth|fifth|sixth|seventh|eighth)$/i.test(gc)) gc = String(gc).toLowerCase() + "-generation";   // "fifth Camaro ZL1s" -> "fifth-generation Camaro ZL1s"
  const mdl = String(rc.model || ""), trm = rc.trim ? String(rc.trim) : "";
  const showModel = !(gc && squash(mdl) === "911") && !squash(trm).includes(squash(mdl));
  // Drop the trim token when the generation code already carries it ("3.2 Carrera" + trim "Carrera"
  // must not read "3.2 Carrera Carrera"); keep it otherwise ("997" + "Carrera S" -> "997 Carrera S").
  const trimInGc = !!(gc && trm && squash(gc).includes(squash(trm)));
  const head = [gc && !squash(mdl).includes(squash(gc)) ? (/^[a-z]\d/i.test(gc) ? String(gc).toUpperCase() : gc) : null, showModel ? mdl : null, trm && !trimInGc ? trm.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, (m0, a, b) => a + b.toLowerCase()) : null].filter(Boolean).join(" ") || mdl;
  const bw = rc.bodyStyle ? BODY_PLURAL[String(rc.bodyStyle).toLowerCase()] : "";
  const fam = bw && !new RegExp(bw.replace(/s$/, ""), "i").test(head) ? head + " " + bw : (/[a-z]s$/.test(head) ? head : (/\d$/.test(head) ? head + "s" : (/(^|\s)[A-Z]{1,4}$|\d[A-Z]{1,3}$/.test(head) ? head + " cars" : head + "s")));
  const gl = refine ? (refine.tx === "manual" ? "manual" : (/^(PDK|DCT|SMG|DSG)$/.test(String(refine.label)) ? String(refine.label) : String(refine.label).toLowerCase())) : "";
  m.family = (refine && d && d.refined ? gl + " " : "") + fam;
  // Range-label parity (Lane B spec, Oct 2026): whenever the engine actually narrowed this read to the
  // buyer's gearbox, say so in plain words, even where walkLadder later drops the gearbox word from the
  // family noun (a rare-gearbox variant is exactly when the narrowed range differs most from Market Check's).
  m.refinedNote = refine && d && d.refined ? gl + " cars" : null;
  m.familyBare = fam;
  // The short group name for the Sam line: "958 GTS", "957 Turbo S", "9Y0 Cayenne coupes", "958 Cayennes".
  if (gc && !(squash(mdl) === "911" && !trm)) {
    const core0 = [/^[a-z]\d/i.test(gc) ? String(gc).toUpperCase() : gc, trm && !trimInGc ? trm : (squash(mdl) === "911" ? "" : mdl)].filter(Boolean).join(" ");
    const pl = /(^|\s)(?:[A-Z]{1,4}|\d[A-Z]{0,3}|[A-Z]\d?)$/.test(core0) || /[a-z]s$/.test(core0) ? core0 : core0 + "s";
    m.short = bw ? core0 + " " + bw : pl;
  } else m.short = fam;
  // the sold cards' miles (for where a car's miles sit), the last three sales, where it mostly sells,
  // and what separated the stronger sales (the engine's pattern sentence, never a cause)
  m.soldMi = ((d && d.cards) || []).map(c => Number(c.mi)).filter(x => x > 0);
  m.recent = lastThree(((d && d.cards) || []).filter(c => c && c.price).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))))
    .map(c => ({ date: String(c.date || "").slice(0, 10), miles: Number(c.mi) || null, price: Number(c.price) || null, house: c.platform || null, url: c.url || null, title: c.title || null, photo: c.image || null, ...(c._again ? { again: true } : {}) }));
  m.top = (d && d.topPlatform) || null;
  // The rail's ends: the engine's own low and high of the same pool (only drawn with a range).
  m.span = m.kind === "range" && Array.isArray(d && d.span) && d.span.length === 2 ? [Number(d.span[0]), Number(d.span[1])] : null;
  m.take = d && d.samsTake && d.samsTake.sentence ? String(d.samsTake.sentence) : null;
  return m;
}
// Exported alongside coreOf (see its comment) - the SAME write refreshSpec already uses, so an
// opportunistic refresh from api/sellerDecision.js and a background fill from a Buy cache miss
// write the identical row shape.
export async function persistCore(env, key, core) {
  try {
    await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST",
      headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ spec_key: key, market: core, low_usd: core && core.kind === "range" ? core.low : null, high_usd: core && core.kind === "range" ? core.high : null, sale_count: core ? core.count || null : null, computed_at: new Date().toISOString() }]) });
  } catch { /* the cache is best-effort; the table may not exist yet */ }
}
// Load many keys from the table into memory at once (one query per 60 keys).
export async function prefetchSpecs(env, keys) {
  const want = [...new Set(keys)].filter(k => k && !(specMem.has(k) && Date.now() - specMem.get(k).at < EFFECTIVE_TTL) && !(specMiss.has(k) && Date.now() - specMiss.get(k) < 120e3));
  for (let i = 0; i < want.length; i += 60) {
    const part = want.slice(i, i + 60);
    const list = part.map(k => '"' + String(k).replace(/"/g, '\\"') + '"').join(",");
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=in.(${encodeURIComponent(list)})&select=spec_key,market,computed_at`).catch(() => null);
    const got = new Set();
    // Only ladder-era rows count (market.v === SPEC_V) AND only a row actually computed within
    // SPEC_TTL (Oct 2026 fix, item 1: Buy vs Market Check divergence). Before this, a row's OWN
    // computed_at was selected but never checked - any row, however old (a nightly build that never
    // ran for this spec, or ran days ago), was accepted and re-stamped `at: Date.now()`, so the
    // staleness clock restarted on every read and a figure could lag the live engine (which Market
    // Check always calls fresh) indefinitely while still reading as "cached, not stale" here. A row
    // past SPEC_TTL now falls through exactly like no row at all, to specMiss and a live refreshSpec
    // rebuild - the SAME engine call Market Check makes, writing the SAME table row back fresh, so a
    // seller comparing the two pages during that one rebuild sees the same figures from one row.
    for (const r of rows || []) {
      if (!r.market || r.market.v !== SPEC_V) continue;
      const computedAt = Date.parse(r.computed_at);
      if (!Number.isFinite(computedAt) || Date.now() - computedAt >= EFFECTIVE_TTL) continue;
      specMem.set(r.spec_key, { core: r.market.kind === "none" ? null : r.market, at: computedAt });
      got.add(r.spec_key);
    }
    // A key the table doesn't hold is not asked for again for two minutes (no per-card re-query).
    for (const k of part) if (!got.has(k)) specMiss.set(k, Date.now());
  }
}
// Compute (engine), persist, remember. undefined = the read did not come back.
// The range ladder (Oct 2026): the exact spec first; when it has no range, the next cohort up, named
// for what it is. 1 exact (with the gearbox), 2 any gearbox (the archive often records no transmission,
// so a manual filter can empty a pool whose titles all say 5-Speed), 3 any body. Never past the trim:
// a Carrera 2 is not a Carrera 4. The first rung with a range wins; with none, the most specific rung
// that has any sales (a count, no rail). The chosen cohort is cached under the EXACT spec's key.
const BODY_WORDS = /\b(coupe|coupé|cabriolet|convertible|targa|roadster|sedan|saloon|spider|spyder|speedster|wagon|estate|hatchback|suv)\b/ig;
export function ladderSteps(spec) {
  const steps = [{ step: "exact", v: spec.v, title: spec.title, refine: spec.refine }];
  if (spec.refine) steps.push({ step: "any_gearbox", v: spec.v, title: spec.title, refine: null });
  // The body can sit in the resolved car or only in the listing's title ("... Carrera 4 Coupe 5-Speed").
  if (spec.v.bodyStyle || new RegExp(BODY_WORDS.source, "i").test(spec.title)) {
    // Every text the engine reads loses the body word (raw and canonicalLabel carry it too).
    const strip = t => (t == null ? t : String(t).replace(BODY_WORDS, "").replace(/\s{2,}/g, " ").trim());
    steps.push({ step: "any_body", v: { ...spec.v, bodyStyle: null, raw: strip(spec.v.raw), canonicalLabel: strip(spec.v.canonicalLabel) }, title: strip(spec.title), refine: null });
  }
  return steps;
}
export async function walkLadder(env, spec, trace) {
  let firstCount = null;
  for (const st of ladderSteps(spec)) {
    const d = await engineAnswer(st.v, spec.generation, st.title, env, st.refine);
    if (d === undefined) return undefined;   // a read that didn't come back: never cached as "nothing"
    // Only the engine's own read of THIS cohort counts; a class/era band is other cars, never the cohort.
    const core = d && /^(result|thin|refusal)$/.test(String(d.tier)) ? coreOf(d, { ...spec, v: st.v, refine: st.refine }) : null;
    if (trace) trace.push({ step: st.step, title: st.title, tier: d && d.tier, family: core && core.family, kind: core && core.kind, count: core && core.count, low: core && core.low, high: core && core.high, span: core && core.span });
    if (core) { core.step = st.step; core.v = SPEC_V; }
    // A gearbox-refined group keeps "manual"/"automatic" in its name only when the spec really sells in
    // both (5+ of each among its sales with no gearbox filter): a 997 Carrera S yes, a Cayenne never.
    if (core && st.refine) {
      const all = await engineAnswer(st.v, spec.generation, st.title, env, null).catch(() => undefined);
      const titles = ((all && all.cards) || []).map(c => String(c.title || c.t || ""));
      const man = titles.filter(t => /\b(?:manual|stick|\d-speed)\b/i.test(t) && !/\b(?:automatic|tiptronic|pdk|dct|smg|dsg|dual-clutch|sportomatic)\b/i.test(t)).length;
      const aut = titles.filter(t => /\b(?:automatic|tiptronic|pdk|dct|smg|dsg|dual-clutch|sportomatic)\b/i.test(t)).length;
      if (!(man >= 5 && aut >= 5)) { core.family = core.familyBare || core.family; }
    }
    if (core && core.kind === "range") return core;
    if (core && core.count && !firstCount) firstCount = core;
  }
  return firstCount;
}
export async function refreshSpec(env, spec) {
  const core = await walkLadder(env, spec);
  if (core === undefined) return undefined;
  specMem.set(spec.key, { core, at: Date.now() });
  await persistCore(env, spec.key, core || { v: SPEC_V, kind: "none" });
  return core;
}
const filling = new Set();
async function specCore(env, spec, noBlock) {
  const hit = specMem.get(spec.key);
  if (hit && Date.now() - hit.at < EFFECTIVE_TTL) return hit.core;
  await prefetchSpecs(env, [spec.key]);
  const h2 = specMem.get(spec.key); if (h2) return h2.core;
  if (noBlock) { if (!filling.has(spec.key)) { filling.add(spec.key); refreshSpec(env, spec).catch(() => {}).finally(() => filling.delete(spec.key)); } return undefined; }
  return refreshSpec(env, spec);
}
// The listing resolved to its own family (generation, trim, body, gearbox); One Box's answer for it.
// opts.noBlock: never wait for the engine (a cache miss returns {kind:"pending"} and fills later).
// The last three sales, three DISTINCT cars when the pool has them (Oct 2026). The engine's cards carry no
// VIN, so the same car is the same title with the same stated miles (a car resold shows the same odometer
// or near it). Newest first; when fewer than three distinct cars sold, a resale fills the slot, marked.
export function sameCarKey(c) { const mi = Number(c.mi != null ? c.mi : c.miles) || 0; return mi > 0 ? String(c.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "|" + Math.round(mi / 500) : null; }
function lastThree(sorted) {
  const seen = new Set(), pick = [], again = [];
  for (const c of sorted) { const k = sameCarKey(c); if (k && seen.has(k)) { again.push(c); continue; } if (k) seen.add(k); if (pick.length < 3) pick.push(c); }
  for (const c of again) { if (pick.length >= 3) break; pick.push(c); }
  // The LATER sale of a car is the one "sold again" (oldest first).
  const out = pick.map(c => ({ ...c })).sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))), had = new Set();
  for (const c of out) { const k = sameCarKey(c); if (k && had.has(k)) c._again = true; if (k) had.add(k); }
  return out.reverse();
}
// THE sold-prices sentence (Oct 2026, Sam): one wording for every place a Buy page states what similar cars
// sold for (card panel, Sam's notes, lists), so two cards never word it differently and a card never says
// both "there is a range" and "there is no range". A range is the middle half of the group's sales, so it
// reads where MOST landed; never a median, never a count of sources. No range: one neutral line, no number.
export function soldLine(m) {
  if (!m) return null;
  const usdW = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
  if (m.kind === "range" && m.low > 0 && m.high > 0) return `Most ${m.family || "cars like it"} sold for ${usdW(m.low)} to ${usdW(m.high)} in ${m.window || "the past year"}.`;
  if (m.spread) return "Sales of cars like it vary too widely to show one range.";
  return "Not enough recent sales to show a range.";
}
export async function listingMarket(env, row, facts, opts = {}) {
  try {
    const spec = await specOf(env, row, facts);
    if (!spec) return null;
    const core = await specCore(env, spec, !!opts.noBlock);
    if (core === undefined) return { kind: "pending" };   // not cached / didn't come back: never drawn as "no line"
    if (!core) return null;
    const m = { kind: core.kind, low: core.low, high: core.high, count: core.count, window: core.window, spread: core.spread, family: core.family, refinedNote: core.refinedNote || null, short: core.short || core.familyBare || core.family, recent: core.recent, top: core.top, take: core.take, span: core.span || null, step: core.step || "exact" };
    // A motorcycle's group is named as motorcycles, never "R90S cars" (the engine's noun is for cars).
    if (isMotorcycle(row)) for (const k of ["family", "short"]) if (m[k]) m[k] = String(m[k]).replace(/\bcars$/i, "motorcycles");
    m.soldLine = soldLine(m);
    // Where this car's miles sit among the SAME sold cards the line counts (only when that is the pool).
    const soldMi = core.soldMi || [];
    if (facts.miles && soldMi.length >= 8 && soldMi.length === m.count) m.miles = { miles: facts.miles, soldN: soldMi.length, fewer: soldMi.filter(x => x < facts.miles).length };
    // The middle half of the sold cars' miles (the Sam line's miles fact), only when the cohort passed
    // the thin rule (it has a range) and enough of its sold cars carry miles.
    if (core.kind === "range" && soldMi.length >= 8) {
      const a = soldMi.slice().sort((x, y) => x - y), q = f => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
      const r1 = x => Math.round(x / 1000) * 1000;
      if (r1(q(0.75)) > r1(q(0.25))) m.milesBand = [r1(q(0.25)), r1(q(0.75))];
    }
    // Market Check: the One Box question for this exact spec, prefilled.
    m.query = [spec.title, facts.gearbox === "manual" && !/manual|\d-speed/i.test(spec.title) ? "manual" : ""].filter(Boolean).join(" ").trim();
    return m;
  } catch (e) { console.error("listingMarket:", e && e.message); return { kind: "pending" }; }
}

// ---------------------------------------------------------------- 6. has this exact car been to auction? (finished facts only)
// A house label or slug as one slug ("Cars & Bids" / "carsandbids" -> "carsandbids").
export function houseSlug(v) { const k = String(v || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, ""); if (!k) return null; return /^gooding/.test(k) ? "gooding" : /^mecum/.test(k) ? "mecum" : k; }
export async function seenBefore(env, vinNorm) {
  if (!vinNorm || vinNorm.length < 6) return null;
  // Lane A's vin_index (de-duplicated, polluted VINs removed) when it exists; else the archive match.
  const vi = await supabaseSelect(env, `vin_index?vin_norm=eq.${encodeURIComponent(vinNorm)}&select=appearance_date,source,result,price_usd,mileage&order=appearance_date.desc.nullslast&limit=1`);
  if (Array.isArray(vi) && vi[0]) {
    const x = vi[0];
    const n = v => { const y = Number(v); return Number.isFinite(y) && y > 0 ? Math.round(y) : null; };
    return { result: x.result === "sold" ? "sold" : "unsold", date: String(x.appearance_date || "").slice(0, 10), priceUsd: n(x.price_usd), miles: n(x.mileage), source: houseSlug(x.source), historyUrl: `/vin/${vinNorm}`, via: "vin_index" };
  }
  const [s, a] = await Promise.all([
    supabaseSelect(env, `sales_archive?vin_norm=eq.${encodeURIComponent(vinNorm)}&select=sale_date,sale_price,sale_price_usd,mileage,platform&order=sale_date.desc&limit=1`),
    supabaseSelect(env, `auction_attempts?chassis_vin_norm=eq.${encodeURIComponent(vinNorm)}&select=attempt_date,high_bid,high_bid_usd,source_slug,mileage:raw_record->>mileage&order=attempt_date.desc&limit=1`)
  ]);
  const sale = s && s[0], att = a && a[0];
  const sd = sale ? String(sale.sale_date || "").slice(0, 10) : "", ad = att ? String(att.attempt_date || "").slice(0, 10) : "";
  const n = x => { const y = Number(String(x == null ? "" : x).replace(/[^\d.]/g, "")); return Number.isFinite(y) && y > 0 ? Math.round(y) : null; };
  if (sale && (!att || sd >= ad)) return { result: "sold", date: sd, priceUsd: n(sale.sale_price_usd) || n(sale.sale_price), miles: n(sale.mileage), source: houseSlug(sale.platform), historyUrl: `/vin/${vinNorm}`, via: "archive" };
  if (att) return { result: "unsold", date: ad, priceUsd: n(att.high_bid_usd) || n(att.high_bid), miles: n(att.mileage), source: houseSlug(att.source_slug), historyUrl: `/vin/${vinNorm}`, via: "archive" };
  return null;
}

// ---------------------------------------------------------------- label ("black 911s", "997 Carrera S coupes")
const genLabel = g => /^[a-z]\d/i.test(String(g)) ? String(g).toUpperCase() : String(g);
export { genLabel };
export function nounFor(v, f) {
  if (!v) return "cars";
  const model = v.parentModel || v.model;
  if (!model) return v.make + "s";
  const trim = v.trim && !squash(model).includes(squash(v.trim)) ? v.trim : "";
  let gens = f.gens.length ? f.gens : (v.genCode ? [v.genCode] : []);
  const roots = [...new Set(gens.map(g => String(g).split(".")[0]))];
  if (gens.length > 1 && roots.length === 1) gens = roots;   // "991.1 and 991.2" reads as the 991 that was typed
  let head = gens.length ? gens.map(genLabel).join(" and ") + " " + (trim || (squash(model) === "911" ? "" : model)) : [model, trim].filter(Boolean).join(" ");
  head = head.trim() || model;
  const bodies = f.bodies;
  let noun;
  if (bodies.length === 1 && BODY_PLURAL[bodies[0]]) noun = head + " " + BODY_PLURAL[bodies[0]];
  else if (bodies.length > 1) noun = head + " " + bodies.map(b => BODY_PLURAL[b] || b + "s").join(" and ");
  else noun = /[a-z]s$/.test(head) ? head : (/\d$/.test(head) ? head + "s" : (/(^|\s)[A-Z]{1,4}$|\d[A-Z]{1,3}$/.test(head) ? head + " cars" : head + "s"));
  if (!/^\d/.test(noun) && v.make && !/^(911|cobra)$/i.test(model)) noun = noun;
  return noun;
}

// ---------------------------------------------------------------- One Box live panel (same contract as before)
// A listing abroad (a country on record that is not the US): hidden from every live count unless the visitor
// names a country or asks for anywhere. ONE definition, used by Buy and Tasks (lib/live/samChat.js runSearch)
// and Market Check's live panel (liveForFamily), so the three always count the same cars.
export function isAbroadRow(r) { const cc = String((r && r.country) || "").toUpperCase(); return !!cc && cc !== "US"; }
export async function liveForFamily(env, vehicle, generation, filters, limit = 3) {
  const v = (await resolveForBuy([vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "), env).catch(() => null)) || { ...vehicle };
  const f = emptyFilters();
  if (vehicle.bodyStyle) f.bodies = [String(vehicle.bodyStyle).toLowerCase()];
  if (generation && generation.code) f.gens = [generation.code];
  // Year-drop guard (Oct 2026, 964 Turbo 3.3 vs 3.6 case): dropping the year filter whenever a
  // generation code resolves assumed the code alone was always specific enough to scope the live
  // panel - false when a generation spans more than one materially different car and the trim text
  // does not distinguish them ("964" covers both the 1991-92 Turbo 3.3 and the 1993-94 Turbo 3.6;
  // "Turbo" alone matches both). Only drop the year when the generation itself spans 2 years or
  // less (genuinely one car regardless of trim) or no trim was given at all (a deliberately broad
  // "any {generation} live right now" search, same as today). Otherwise keep a hard +/-1 year
  // window around the seller's own year via f.yearMin/yearMax, which searchLive enforces ahead of
  // and independent of any generation match (lib/live/search.js ~line 257-259) - a materially
  // different car under the same generation code can never pass as "live right now".
  // The effective generation driving this decision: the passed-in `generation` (findGeneration,
  // year-based) OR resolveForBuy's own chassis-code match (v.genCode, set when the model TEXT ITSELF
  // is a chassis code like "964"/"997" - this is the path the 1994 Turbo 3.6 leak actually took,
  // since "964" matches chassisGen() directly regardless of what `generation` resolved to). Both
  // carry the same { code, yearStart, yearEnd } shape.
  const effGen = generation || (v.genCode ? chassisGen(v.make, v.model) : null);
  const genSpan = effGen ? (Number(effGen.yearEnd) - Number(effGen.yearStart)) : null;
  const oneCarGen = !!effGen && (!vehicle.trim || (Number.isFinite(genSpan) && genSpan <= 2));
  const dropYear = oneCarGen;
  const yearless = { ...v, year: dropYear ? null : v.year };
  if (!dropYear && v.year) { f.yearMin = Number(v.year) - 1; f.yearMax = Number(v.year) + 1; }
  const { rows } = await searchLive(env, yearless, f, "");
  // The same cars Buy counts: confirmed matches, abroad left out (isAbroadRow), never a cap on the total.
  const sure = rows.filter(x => !x.unknown.length && !isAbroadRow(x.r));
  return { rows: sure.slice(0, limit).map(x => x.r), total: sure.length };
}

// Empty state: the searched family's own market line (same engine path as a card's).
export async function familyMarket(env, v, f) {
  if (!v || !v.model) return null;
  const row = { listing_title: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "), year: v.year || (v.yearSpan ? v.yearSpan[0] : null) };
  return listingMarket(env, row, { body: f.bodies.length === 1 ? f.bodies[0] : null, gearbox: f.gearbox, gearboxLabel: f.gearboxLabel });
}

// Detail view facts for one live listing: its own family's sold range and count, where its miles sit
// against the sold cars like it, what separated the stronger sales (the engine's Sam's Take pattern,
// never a cause), all from finished sales. Never a verdict on the bid, a repair cost or a condition claim.
export async function listingDetail(env, row) {
  const facts = listingFacts(row);
  const title = String(row.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
  const v = await resolveForBuy(title, env);
  let market = null, miles = null, moved = null, d = null;
  if (v && v.model) {
    if (row.year) v.year = row.year;
    if (facts.body && !v.bodyStyle) v.bodyStyle = facts.body;
    const generation = await listingGeneration(v, title, env);
    const refine = facts.gearbox ? { tx: facts.gearbox, label: facts.gearboxLabel || facts.gearbox } : null;
    d = await engineAnswer(v, generation, title, env, refine);
    market = await listingMarket(env, row, facts);
    if (market && market.kind === "pending") market = null;
    if (d && facts.miles) {
      const sold = (d.cards || []).map(c => Number(c.mi)).filter(m => m > 0);
      if (sold.length >= 5) miles = { miles: facts.miles, soldN: sold.length, fewer: sold.filter(m => m < facts.miles).length, more: sold.filter(m => m > facts.miles).length };
    }
    if (d && d.samsTake && d.samsTake.sentence) moved = String(d.samsTake.sentence);
  }
  // ONE POOL for every note: the miles line is built from the engine's cards, so it only stays when
  // the market line counts that same set of sales. Otherwise it is dropped, never left to contradict.
  if (miles && !(market && market.count === miles.soldN)) miles = null;
  // The engine answered and found nothing to count: the agreed no-range line with a count of zero.
  if (!market && d) market = { kind: "count", count: 0, window: marketWin(d) };
  const noRange = market ? null : (v && v.model ? "unavailable" : "unresolved");
  return { facts, market, miles, moved, noRange };
}
export { facetsOf };

// ---------------------------------------------------------------- 7. the card's flag (title/description, no engine call)
// One plain fact Sam sets the car aside for, in priority order. Never a verdict on the bid.
const ENGINE_SWAP_RE = /\bengine[-\s]?swap(?:ped)?\b|\bswapped\b|\b(?:v6|v8|v10|v12|ls\d|lsx)[-\s]+swap\b|\bre-?powered\b|\b(?:ls[0-9]?x?|lsx|coyote|[12]jz|k-?series|hemi)[-\s]?(?:swap(?:ped)?|powered|conversion)\b/i;
const EX_WORKS_RE = /\bex[-\s]?works\b|\bworks (?:team |rally |race )?car\b|\bex[-\s]?factory team\b/i;
const MODIFIED_RE = /\bmodified\b|\bmodded\b|\bwide-?body\b|\bbody ?kit\b|\bbagged\b|\bair ride\b|\blift(?:ed| kit)\b|\bstroker\b|\bbackdate[ds]?\b|\boutlaw\b|\bresto-?mod\b|\bbuilt engine\b|\btwin-?turbo conversion\b/i;
export function cardFlag(r) {
  const title = String(r.listing_title || ""), desc = String(r.description || "");
  if (ENGINE_SWAP_RE.test(title)) return { kind: "engine_swap", line: "Engine swapped, so Sam sets it aside." };
  if (EX_WORKS_RE.test(title)) return { kind: "ex_works", line: "Ex-works car, trades on its history." };
  // A description that only mentions a "bodyshell" ("based on the convertible bodyshell") is not a
  // project car; the shared check matches it, so a description-only bodyshell hit is ignored here.
  const pf = projectFlagReason(title, desc || null);
  if (pf && !(pf === "bodyshell" && !projectFlagReason(title, null))) return { kind: "project", line: "Project car." };
  if (MODIFIED_RE.test(title) || restomodReason(title, r.make, r.model)) return { kind: "modified", line: "Modified. Sam sets these aside." };
  return null;
}
// How many of these VINs have an auction history (vin_index when present, else the archive + attempts).
export async function seenCount(env, vins) {
  const list = [...new Set((vins || []).filter(v => v && v.length >= 6))];
  if (!list.length) return 0;
  const seen = new Set();
  for (let i = 0; i < list.length; i += 80) {
    const q = encodeURIComponent(list.slice(i, i + 80).map(v => `"${v}"`).join(","));
    // vin_index when present, unioned with the archive match until the nightly rebuild has caught up.
    const vi = await supabaseSelect(env, `vin_index?vin_norm=in.(${q})&select=vin_norm&limit=2000`);
    if (Array.isArray(vi)) vi.forEach(x => seen.add(x.vin_norm));
    const [s, a] = await Promise.all([
      supabaseSelect(env, `sales_archive?vin_norm=in.(${q})&select=vin_norm&limit=2000`),
      supabaseSelect(env, `auction_attempts?chassis_vin_norm=in.(${q})&select=chassis_vin_norm&limit=2000`)
    ]);
    (s || []).forEach(x => seen.add(x.vin_norm)); (a || []).forEach(x => seen.add(x.chassis_vin_norm));
  }
  return seen.size;
}

// ---------------------------------------------------------------- what THIS live listing says
// A few facts from the live listing's own text, in Sam's words (never quoted): owners, records, a key
// service (IMS on a 996/986), a repaint, no reported accidents, original paint, a history report.
// The listing's own facts about THIS car, as ready Sam-line sentences in priority order: owner count,
// options that set it apart (named, never praised), then repaint / accident / title issues as plain
// facts. The page drops a sentence only when the identical sentence would sit on 3+ cards of a reply.
const OPTIONS = [
  [/\b(?:PCCB|carbon[- ]ceramic|ceramic(?:[- ]composite)? brakes)\b/i, "ceramic brakes"],
  [/\bSport Chrono\b/i, "Sport Chrono"],
  [/\bBurmester\b/i, "Burmester audio"],
  [/\bBang\s*&\s*Olufsen\b|\bB&O\b/i, "Bang & Olufsen audio"],
  [/\bair suspension\b|\bairmatic\b/i, "air suspension"],
  [/\bpaint[- ]to[- ]sample\b|\bPTS\b/, "paint-to-sample paint"],
  [/\b(?:full[- ]bucket|adaptive sport seats|sport seats plus|factory sport seats|18[- ]way)\b/i, "factory sport seats"],
  [/\bsport exhaust\b|\bPSE\b/, "the sport exhaust"],
  [/\brear[- ]axle steering\b/i, "rear-axle steering"],
  [/\bcarbon[- ]fiber roof\b|\bcarbon roof\b/i, "a carbon roof"]
];
export function listingSamFacts(r, facts) {
  const t = String(r.description || "") + " . " + String(r.listing_title || "");
  const out = [];
  const own = /\b(one|single|two|1|2)[- ]owners?\b|\boriginal[- ]owner\b|\b(one|two|1|2) (?:previous )?owners\b|\b(?:single|one)[- ]family[- ]owned\b/i.exec(t);
  if (own) {
    const w = String(own[1] || own[2] || "one").toLowerCase();
    out.push(/family/i.test(own[0]) ? "One family since new." : (/^(one|single|1)$/.test(w) || /original/i.test(own[0])) ? "One owner since new." : "Two owners from new.");
  }
  const opts = OPTIONS.filter(([re]) => re.test(t)).map(([, name]) => name);
  if (facts && facts.gearbox === "manual" && /\b(?:Cayenne|Macan|Panamera|Range Rover|G-?Class|G ?\d{3}|SL\d{2,3}|E\d{3}|S\d{3})\b/i.test(t)) opts.unshift("a manual gearbox");
  if (opts.length) out.push("Has " + (opts.length === 1 ? opts[0] : opts.slice(0, 3).slice(0, -1).join(", ") + " and " + opts.slice(0, 3).slice(-1)[0]) + ", per the listing.");
  if (/\b(?:salvage|rebuilt|branded|reconstructed) title\b/i.test(t)) out.push("Its title is branded, per the listing.");
  else if (/\b(?:accident|collision)(?:[- ]damage| repair| history)\b/i.test(t) && !/\b(?:no|free of|without)\b[^.]{0,30}\b(?:accident|collision)/i.test(t) && !/\baccident[- ]free\b/i.test(t)) out.push("An accident is reported, per the listing.");
  if (/\brepaint(?:ed)?\b|\bresprayed\b|\brefinished in\b/i.test(t)) out.push("Repainted, per the listing.");
  return out;
}
export function listingSays(r) {
  const t = String(r.description || "") + " . " + String(r.listing_title || "");
  if (t.length < 20) return null;
  const parts = [];
  const own = /\b(one|single|two|three)[- ]owner\b|\boriginal[- ]owner\b|\b(one|two|three|1|2|3) (?:previous )?owners\b/i.exec(t);
  if (own) { const w = (own[1] || own[2] || "one").toLowerCase(); parts.push(/^(one|single|1)$/.test(w) || /original/i.test(own[0]) ? "one owner" : (w === "2" ? "two" : w === "3" ? "three" : w) + " owners"); }
  if (/(?:replaced|upgraded|retrofit\w*|installed|updated|addressed)[^.]{0,50}\bIMS\b|\bIMS\b[^.]{0,50}(?:replaced|upgraded|retrofit\w*|installed|updated|addressed)/i.test(t)) parts.push("an IMS bearing update");
  if (/\b(?:service|maintenance) records\b|\brecords (?:dating|from|going)\b|\bservice history\b/i.test(t)) parts.push("service records");
  const repaint = /\brepaint(?:ed)?\b|\brefinished in\b|\bresprayed\b/i.test(t);
  if (repaint) parts.push("a repaint");
  else if (/\boriginal paint\b/i.test(t)) parts.push("original paint");
  if (/\baccident[- ]free\b|\bno (?:reported )?accidents\b/i.test(t)) parts.push("no reported accidents");
  // A history report on its own says little about THIS car: it only rides along with a real fact.
  if (!parts.length) return null;
  const report = /\bcarfax\b/i.test(t) ? "a Carfax report" : /\bautocheck\b/i.test(t) ? "an AutoCheck report" : null;
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  return "Its listing reports " + list + (report ? ", with " + report : "") + ".";
}
