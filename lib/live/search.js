// /buy search core (Lane C, Oct 2026). ZERO OldCarsData: reads live_listings (filled by the cron) and
// the archive. /buy NEVER asks: a broad search shows every match, and the reader narrows with facet
// chips. The car is resolved with One Box's own resolver (resolveVehicle / archiveResolveToken) and
// generations; each card's market line is One Box's answer (runOneBox) for THAT listing's family, at
// the engine's tier rules. Engine files are imported read-only, never edited.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";
import { findGeneration, CURATED_GENERATIONS, halfGenerationFor, halfForYear } from "../generations.js";
import { archiveResolveToken, buildSpec, qualifyReason, titleFenceReason, placingFor, ENGINE_VERSION, mapEngineAnswer, oneEngineAnswer } from "../onebox.js";
import { poolTrimFor } from "../modelFamilies.js";
import { restomodReason } from "../modelRules.js";
import { supabaseSelect, supabaseSelectAll } from "../_supabase.js";
import { projectFlagReason } from "../_classify.js";
import { liveTrust, specialAsked } from "./liveTrust.js";
import { classifyUnknown } from "../_unknownClassify.js";
import { currentEpoch } from "../_epoch.js";
import { RUNGS } from "./rung.js";

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
const EMPTY_PROTECTED = new Set();

// ---------------------------------------------------------------- 1. understand everything typed
function amount(v, unit) {
  let n = Number(String(v).replace(/[,\s$]/g, "")); if (!Number.isFinite(n)) return null;
  const u = String(unit || "").toLowerCase();
  if (u === "k" || u === "thousand" || u === "grand") n *= 1000; else if (u === "m" || u === "million" || u === "mil") n *= 1e6;
  return n;
}
export function emptyFilters() { return { vehicle: null, kind: null, bodies: [], colours: [], notColours: [], gearbox: null, gearboxLabel: null, miMax: null, miMin: null, endsWithin: null, priceMax: null, priceMin: null, bidMin: null, bidMax: null, has: null, countries: [], houses: [], gens: [], yearMin: null, yearMax: null }; }
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
// protectedWords (Lane B job, Oct 2026, Part 2 general fix): a Set of lowercase words the resolver
// ALREADY consumed (as model/trim/edition/variant/series/wheelbase) that must never ALSO be stripped
// as a colour/body filter or a filler word - lib/resolver-audit.md found this stripping-before-
// resolving order dropped or misread 1,034 flags' worth of typed words before this fix: Roadster/
// Speedster/Targa/Spyder/Spider read as body words even where the resolver keeps them as the car's
// own trim or edition (828 flags), "Black" in "Black Series" read as a paint colour (370), the
// article "A" stripped from "A-Class"/"A 4"/"A 45" (115), "Wagon" stripped from the model name
// "Power Wagon" (48). Defaults to empty (every existing caller that passes only `raw` is completely
// unaffected - identical behavior, identical signature). parseQueryResolved below is the new, async
// entry point that actually computes this set by resolving first.
export function parseQuery(raw, protectedWords = EMPTY_PROTECTED) {
  let t = " " + String(raw || "").replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  const f = emptyFilters();
  // A protected word is never stripped and never registered as a filter - the match is put back
  // VERBATIM (original casing), so the resolver still sees it exactly as typed.
  const take = (re, fn) => { t = t.replace(re, (...a) => { const w = String(a[0]).toLowerCase().replace(/[^a-z0-9]/g, ""); if (w && protectedWords.has(w)) return a[0]; fn(...a); return " "; }); };
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
  // EDITION WORDS THAT DOUBLE AS A FILTER WORD (Lane B job, Oct 2026, Part 2): run BEFORE colour/body
  // stripping below, so a word that is part of the car's NAME is never read as a filter instead -
  // "Black" in "Black Series" became a paint colour (live cars filtered to black paint) and
  // "Speedster" on a 911/356 became a body filter with the word removed from the text, so Buy/Tasks
  // searched a different car than Market Check for the identical typed words (the resolver carries
  // both as `edition`, lib/vehicle.js SPECIAL_EDITIONS/editionIn). Protected with a reversible
  // placeholder swap, restored with the exact original casing right after body-stripping below - every
  // other caller of parseQuery (price/mileage/year/gearbox/country/house parsing, all unchanged) sees
  // the identical text shape it always has. "Speedster" is left alone except next to 911/356 (a real
  // generic "any speedster" body search, with no Porsche named, still strips to a body filter as before).
  const protectedPhrases = [];
  const protect = re => { t = t.replace(re, m => { const i = protectedPhrases.length; protectedPhrases.push(m); return ` ZZPROTECTZZ${i}ZZ `; }); };
  protect(/\bblack\s+series\b/ig);
  if (/\b(?:911|356)\b/i.test(t)) protect(/\bspeedsters?\b/ig);
  // Colours: "not silver", "no black", then plain "black".
  take(new RegExp("\\b(?:not|no|except|anything but|but not|non-)\\s*(" + COLOUR_ALT + ")\\b", "ig"), (m, c) => { const k = colourKey(c); if (k && !f.notColours.includes(k)) f.notColours.push(k); });
  take(new RegExp("\\b(" + COLOUR_ALT + ")\\b", "ig"), (m, c) => { const k = colourKey(c); if (k && !f.colours.includes(k)) f.colours.push(k); });
  // Bodies (one, several, or "any body").
  take(/\b(any|all) bod(?:y|ies)( styles?)?\b/ig, () => {});
  for (const b of BODIES) take(new RegExp(BODY_RE[b].source, "ig"), () => { if (!f.bodies.includes(b)) f.bodies.push(b); });
  for (let i = 0; i < protectedPhrases.length; i++) t = t.replace(`ZZPROTECTZZ${i}ZZ`, protectedPhrases[i]);
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
  // Filler words - same protectedWords guard as take() above: the article "A" must survive when the
  // resolver already reads it as part of the model ("A-Class", "A 4", "A 45"), never stripped as the
  // indefinite article.
  t = t.replace(/\b(or|and|for sale|live|auctions?|looking for|i want|i'?m after|find me|show me|any|a|an|the|with|from|cars?|please|one)\b/ig, m => protectedWords.has(m.toLowerCase()) ? m : " ");
  return { text: t.replace(/\s+/g, " ").trim(), filters: f };
}
// RUN THE RESOLVER FIRST (Lane B job, Oct 2026, Part 2 general fix). The real fix for the whole class
// of flags resolver-audit.md found: resolve the car on the UNTOUCHED raw text FIRST (resolveVehicle,
// the same shared resolver Market Check and Sell call directly), collect every word that resolution
// actually consumed (make/model/trim/edition/variant/series/wheelbase), and only THEN run parseQuery
// with those words protected from the colour/body/filler strip. Returns the SAME {text, filters}
// shape as parseQuery, plus `vehicle` - the already-resolved car, so a caller can skip a second,
// redundant resolveForBuy call on the stripped text (enrichForBuy is idempotent re-enrichment, never
// a second resolveVehicle). Falls back to the exact OLD behavior (plain parseQuery, then
// resolveForBuy on the stripped text, with its own archiveResolveToken fallback) when resolveVehicle
// itself finds nothing - there is nothing yet to protect, and a genuinely unresolvable query must
// keep its existing fallback path intact.
export async function parseQueryResolved(raw, env) {
  let v = null;
  try { const rv = await resolveVehicle(raw, {}); v = rv && rv.vehicle; } catch {}
  if (!v || !v.make) {
    const pq = parseQuery(raw);
    return { ...pq, vehicle: await resolveForBuy(pq.text || raw, env) };
  }
  const protectedWords = new Set();
  for (const field of [v.make, v.model, v.trim, v.edition, v.variant, v.series, v.wheelbase]) {
    for (const w of String(field || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) protectedWords.add(w);
  }
  const pq = parseQuery(raw, protectedWords);
  return { ...pq, vehicle: enrichForBuy({ ...v }, raw) };
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
// ENRICHMENT (one-resolver fix, Oct 2026): everything resolveForBuy does to an ALREADY-RESOLVED
// vehicle object - never calls resolveVehicle itself, so it is safe to re-run on a vehicle that was
// resolved once already (idempotent: a vehicle already free of a bare-make default, already split of
// a body-worn-as-trim, already carrying its chassis-code generation, re-run through this again comes
// out the same). `text` is used only for two narrow checks that read the ORIGINAL words (did the
// user's own text name a model, does it contain a generation nickname like "G-body") - a caller that
// no longer has the user's raw text (specOf's familyMarket path) passes its best stand-in (the
// listing/family title) and both checks degrade safely: the bare-make check only ever CLEARS a model
// the words never named, so a title built FROM v's own model/trim can never trigger it; the NICK check
// only matches literal nickname phrases, absent from a resolved vehicle's own flattened title unless
// the original text had one too (in which case v.trim already carries it from the first resolve).
export function enrichForBuy(v, text) {
  if (!v || !v.make) return v;
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
  for (const [re, a, b] of NICK) if (re.test(String(v.trim || "")) || re.test(String(text || ""))) { v.trim = v.trim && re.test(v.trim) ? (v.trim.replace(re, " ").replace(/\s+/g, " ").trim() || null) : v.trim; v.yearSpan = [a, b]; }
  // A chassis-code model ("997") is a generation of its parent nameplate ("911").
  const cg = v.model ? chassisGen(v.make, v.model) : null;
  if (cg) { const all = chassisGens(v.make, v.model); v.genCode = cg.code; v.genCodes = all.map(g => g.code); v.parentModel = cg.model; }
  if (v.model) { const pa = poolTrimFor(v); if (pa) v.fetchTrim = pa; }
  return v;
}
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
  return enrichForBuy(v, text);
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
export async function liveRows(env, filterQs, opts = {}) {
  // has_reserve (v3) first; without that column, the v2 extras; without those, the base columns.
  // Paged (Range): PostgREST caps a response at 1000 rows whatever the limit says, and more than 1000
  // cars are live, so an unpaged read silently dropped every later-ending car from a broad search.
  const q = sel => `live_listings?status=eq.live&${filterQs}&select=${sel}&order=end_time.asc.nullslast,id.asc`;
  // e59 (Sam's egress job, item 3): opts.noDescription reads every column but description (about 10 KB of an 11 KB
  // row); a caller that needs the text for the rows it keeps asks liveDescriptions(env, ids) for those ids only.
  const extra = opts.noDescription ? LIVE_SEL_EXTRA.replace(",description", "") : LIVE_SEL_EXTRA;
  // The pull's v4 columns (mileage_unit, special_flag, bid_count) when they exist; else as before.
  let rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${extra},has_reserve,mileage_unit,special_flag,bid_count`));
  if (rows == null) rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${extra},has_reserve`));
  if (rows == null) rows = await supabaseSelectAll(env, q(`${LIVE_SEL}${extra}`));
  if (rows == null) rows = (await supabaseSelectAll(env, q(LIVE_SEL))) || [];
  return rows;
}
// e59: the description text for named live listings only (one read per 100 ids), as { id: description }. The hunt
// read (liveRows with noDescription) and this pair replace one read that pulled every candidate's description.
export async function liveDescriptions(env, ids) {
  const out = {};
  const list = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  for (let i = 0; i < list.length; i += 100) {
    const rows = await supabaseSelect(env, `live_listings?id=in.(${list.slice(i, i + 100).join(",")})&select=id,description`).catch(() => null);
    for (const r of rows || []) out[r.id] = r.description == null ? "" : String(r.description);
  }
  return out;
}
// Every live match for the car + filters. "sure" = every stated filter confirmed; "maybe" = a stated
// filter the listing doesn't state (shown after, labelled). Facets are counted over the matches.
// opts.rows: listing rows to search instead of the live table (Tasks tests seed listings this way, so
// no test row ever enters live_listings). Same logic either way.
// THE NEAREST-YEARS RULE (Oct 2026, Sam): one rule for every Buy search path (the chat's search tool and the
// no-model search), never the model's choice. When a stated year (or range) gives no live cars, the SAME search
// (same car, same filters) runs one year each side and keeps only the neighbouring years, and the result says
// so (nearLine). Tasks never use it: a task matches the years it was given.
//   run(widen) -> a search result with .matches (widen 0 = as asked, 1 = one year each side)
//   asked      -> [yearMin, yearMax] as stated, or null when no year was stated
//   genBound   -> {yearStart, yearEnd} for the asked year's own curated generation/half-generation
//     (job 6, Oct 2026, generation-boundaries addendum), or null when none is curated for this
//     make+model (never invented - lib/generations.js halfGenerationFor/CURATED_GENERATIONS is the
//     one curated source, reused here rather than a second table). The +/-1 year widen must never
//     cross a generation line: confirmed live, a 2008 997 Carrera S Buy search's live panel showed
//     2009 and 2010 cars (997.2, a different generation and market from the searched 997.1) and a
//     2006 car (two years out, past even the stated +/-1 rule). This is the SAME shared nearestYears
//     every Buy search path already calls (job 2 of this round's own rule: do not write a second
//     widening rule) - the clamp lives here, once, not duplicated into each caller.
export const yearOfRow = x => Number(x.r.year) || Number((/\b(19\d{2}|20[0-3]\d)\b/.exec(String(x.r.listing_title || x.r.title || "")) || [])[1]) || null;
export async function nearestYears(run, asked, genBound) {
  const sr = await run(0);
  if (!asked || !asked[0] || (sr.matches || []).length) return { sr, near: null };
  const w = await run(1);
  const nm = (w.matches || []).filter(x => {
    const y = yearOfRow(x);
    if (!y || !(y < asked[0] || y > asked[1])) return false;
    if (genBound && (y < genBound.yearStart || y > genBound.yearEnd)) return false;
    return true;
  });
  const near = { asked, years: [...new Set(nm.map(yearOfRow))].sort((a, b) => a - b) };
  // abroadHidden always reports the EXACT asked year's own abroad count (sr, from run(0)), never the
  // widened run's (w, from run(1)) - the sentence this feeds (nearLine) is about the asked year having
  // no US matches, so what's abroad at the WIDENED neighbour years is a different fact, not this one.
  return { sr: nm.length ? { ...w, matches: nm, abroadHidden: sr.abroadHidden } : { ...sr, matches: [] }, near };
}
// GENERATION BOUND for the year-widening clamp (job 6, Oct 2026): the asked year's own curated
// generation window, half-generation first (997.1/997.2, 987.1/987.2, E46 M3 pre/post facelift -
// lib/generations.js HALF_GENERATIONS, the finer split), else the full curated generation
// (CURATED_GENERATIONS via genFor, already used elsewhere in this file) - never a guess: a make+model
// with neither curated returns null, and nearestYears then widens unclamped exactly as before (an
// "unknown" family, reported as such rather than invented).
export function genBoundFor(make, model, year) {
  if (!year) return null;
  const hg = halfGenerationFor(make, model);
  const half = hg ? halfForYear(hg, year) : null;
  if (half) return { yearStart: half.yearStart, yearEnd: half.yearEnd };
  const g = genFor(make, model, year);
  return g ? { yearStart: g.yearStart, yearEnd: g.yearEnd } : null;
}
// "No 1988 911 Carreras are live right now. These are the nearest, 1987." (noun: the car as searched, plural)
// abroadHidden (Oct 2026, "false none live" job): a car abroad stays out of the US-first match count by
// default (the "Cars abroad stay out" rule in both searchLive callers, converse.js and samChat.js) - a
// real live match can exist and this sentence still said "none are live" with no way to tell. abroadHidden
// is the asked-year count of cars that were found and excluded for being abroad, nothing more (never the
// widened-year count): when it is more than zero, the sentence names the US scope it is actually reporting
// on and says the real cars exist, so "none live" never reads as "the car does not exist anywhere."
export function nearLine(near, noun, abroadHidden) {
  const a = near.asked, askedTxt = a[0] === a[1] ? `${a[0]} ` : "", rangeTxt = a[0] === a[1] ? "" : ` from ${a[0]} to ${a[1]}`;
  const scope = abroadHidden ? " in the US" : "";
  const abroadTxt = abroadHidden ? ` ${abroadHidden} ${abroadHidden === 1 ? "is" : "are"} live abroad.` : "";
  const none = `No ${askedTxt}${noun}${rangeTxt} are live right now${scope}`;
  return (near.years.length ? `${none}. These are the nearest, ${near.years.join(" and ")}.` : `${none}, and none from ${a[0] - 1} or ${a[1] + 1} either.`) + abroadTxt;
}
// ONE YEAR WINDOW FOR EVERY LIVE COUNT (e45, Sam's item 7): when a year is typed, the live cars Buy counts, the Task
// email previews and Market Check's "Live right now" panel shows are the cars of the YEARS THE SALES READ LANDED ON
// (the engine's poolYears for the same resolved car, read from the shared spec market cache, which the Market Check
// page itself fills), never a generation bound (the panel read 1964 to 1973 Mustangs for "1965 Ford Mustang", 12 cars,
// while Buy read 4) and never a second rule. With no sales read to lean on (thin or none), two years each side.
export async function liveYearWindow(env, v) {
  if (!v || !Number(v.year)) return null;
  let m = null;
  try { m = await familyMarket(env, v, emptyFilters()); } catch (e) { m = null; }
  const py = m && Array.isArray(m.poolYears) && m.poolYears.length === 2 && Number.isFinite(Number(m.poolYears[0])) ? m.poolYears.map(Number) : null;
  // No sales read to lean on: the typed year itself (what Buy's own parse always did), never two years each side.
  return py ? { yearMin: py[0], yearMax: py[1], basis: "sales read" } : { yearMin: Number(v.year), yearMax: Number(v.year), basis: "typed year" };
}
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
  // The typed year's window, the same one the sales read landed on (liveYearWindow), unless the reader set years.
  // The parse writes a single typed year as yearMin = yearMax = year; that is "a stated year", not a reader's own range,
  // so the shared window still applies to it (a typed range or a decade stays the reader's filter).
  const parsedSingleYear = !!(Number(v.year) && f.yearMin != null && f.yearMax != null && Number(f.yearMin) === Number(f.yearMax) && Number(f.yearMin) === Number(v.year));
  const yw = (Number(v.year) && ((!f.yearMin && !f.yearMax) || parsedSingleYear)) ? await liveYearWindow(env, v) : null;
  if (yw && parsedSingleYear) f = { ...f, yearMin: yw.yearMin, yearMax: yw.yearMax };
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
    // A hyphenated model ("MX-5", "XJ-S", "F-150") splits into words in the title; read it squashed too.
    // The model word must be in the listing (e41, Sam's Job 3a): a generation code never widens the model - "E46 M3"
    // read every E46 3 Series (a 325ci convertible, a 330i sedan) because the E46 token stood in for "M3". Only a
    // pure chassis code the archive files cars under as a MODEL (997, 991, 992: three digits) may stand in for the
    // nameplate word, and only for that nameplate's own parent model.
    const codeStandsIn = g => /^\d{3}(\.\d)?$/.test(String(g)) && (hasTok(g) || hasTok(String(g).split(".")[0]));
    if (modelTok && !hasTok(parent) && !(/[^a-z0-9]/i.test(String(parent)) && squash(parent).length >= 3 && st.includes(squash(parent))) && !(gens.length && gens.some(codeStandsIn))) { skip(r, "model word not in title"); continue; }
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
    if (yw && ry && (ry < yw.yearMin || ry > yw.yearMax)) { skip(r, "year window"); continue; }
    if (yw && !ry) { skip(r, "no year"); continue; }
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
    // "Ending this week": the auction ends within the stated days (a listing with no end time cannot say).
    if (f.endsWithin && (!r.end_time || Date.parse(r.end_time) > now + f.endsWithin * 864e5)) { skip(r, "ends later"); continue; }
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
// ENGINE_SLOTS (buybound, Sam's Buy no-answer fix, Oct 18 2026): computes running at once in this instance. Eight let one
// Buy search for a broad family fire ten cold computes together and saturate the archive's two vCPUs (every other read
// then queued behind them, the demo included); three keeps a search from doing that. Env-overridable.
const ENGINE_SLOTS = Math.max(1, Number(process.env.ENGINE_SLOTS) || 3);
let engineBusy = 0; const engineQueue = [], inflight = new Map();
const engineSlot = () => new Promise(res => { if (engineBusy < ENGINE_SLOTS) { engineBusy++; res(); } else engineQueue.push(res); });
const engineFree = () => { const next = engineQueue.shift(); if (next) next(); else engineBusy--; };
// STORE GUARD (Lane B job, Oct 2026, Part 1): an answer carrying a real pool (result/thin/refusal) is
// cached ONLY when it is internally consistent - a known fallbackRung, a real rungLabel, and its own
// poolSize equal to the receipts it actually holds. A malformed or partial read must never latch into
// a warm instance's cache and get served for up to CACHE_OUTER_TTL regardless of how many times
// ENGINE_VERSION/epoch bump afterward - confirmed live, "2009 Porsche 997 Carrera S Coupe" got stuck
// on a one-off bad read (54 sales) that disagreed with every fresh call made before and after it,
// surviving four ENGINE_VERSION bumps because nothing about THIS axis actually changed. Returning
// false here never blocks the caller from getting today's answer - it only stops that answer from
// being the one served again for the next hour; the next call recomputes fresh.
export function answerCacheable(d) {
  if (d === null) return true;   // a deliberate "nothing to say" (not_tracked, etc) - no pool, nothing to check
  if (!d || typeof d !== "object") return false;
  if (String(d.tier || "") === "read_failed") return false;   // a read that did not finish is never stored (e41)
  if (String(d.tier || "") === "unavailable" || d.stillReading || d.readFailed) return false;   // e64: a still-reading answer is never stored
  if (String(d.tier || "") === "not_tracked" && d.dedup && d.dedup.queryError) return false;   // e64: not_tracked after a failed read is never stored
  if (!/^(result|thin|refusal)$/.test(String(d.tier || ""))) return true;   // no pool concept at this tier
  if (!RUNGS.has(d.fallbackRung)) return false;
  if (typeof d.rungLabel !== "string" || !d.rungLabel.trim()) return false;
  const receipts = Array.isArray(d.rawPool) ? d.rawPool.length : (Array.isArray(d.cards) ? d.cards.length : null);
  const poolSize = Number.isFinite(d.poolN) ? d.poolN : (d.thin && Number.isFinite(d.thin.totalN) ? d.thin.totalN : receipts);
  if (receipts != null && poolSize != null && receipts !== poolSize) return false;
  return true;
}
// OBSERVE ONLY (Part 1): names WHICH condition inside answerCacheable rejected, for the rangeCache
// write-site log below. Mirrors answerCacheable's own checks exactly - not a second implementation,
// a diagnostic narration of the same one. Returns null when it would accept (nothing to report).
function storeGuardRejectReason(d) {
  if (d === null) return null;
  if (!d || typeof d !== "object") return "not_an_object";
  if (!/^(result|thin|refusal)$/.test(String(d.tier || ""))) return null;
  if (!RUNGS.has(d.fallbackRung)) return `fallback_rung_not_recognized:${d.fallbackRung}`;
  if (typeof d.rungLabel !== "string" || !d.rungLabel.trim()) return "rung_label_blank";
  const receipts = Array.isArray(d.rawPool) ? d.rawPool.length : (Array.isArray(d.cards) ? d.cards.length : null);
  const poolSize = Number.isFinite(d.poolN) ? d.poolN : (d.thin && Number.isFinite(d.thin.totalN) ? d.thin.totalN : receipts);
  if (receipts != null && poolSize != null && receipts !== poolSize) return `poolsize_ne_receipts:${poolSize}!=${receipts}`;
  return null;
}
// CACHE DECISION LOGGING (Lane B job, Oct 2026, Part 1): one structured line per cache read, so a
// live hit/miss can be proven from Vercel function logs instead of inferred from page-load timing.
// Never logs the ops/API keys or any other secret - only the cache name, the (non-secret) specKeyFor
// string, hit/miss, a plain-English miss reason, and the milliseconds spent on that read.
function logCacheDecision({ cache, key, hit, reason, ms }) {
  try { console.log(JSON.stringify({ tag: "cache_decision", cache, key, hit: !!hit, reason: hit ? null : (reason || "unknown"), ms })); } catch {}
}
// Exported for watches (lib/live/watches.js): a spec's next sale is read from this same answer.
export async function engineAnswer(vehicle, generation, text, env, refine) {
  // The SAME key as the stored cache (specKeyFor): a half-generation model ("987") keys by its half, so a
  // 2006 and a 2010 Boxster never share one in-memory answer (the 2010 was being served the 2006 read).
  const key = specKeyFor(vehicle, generation, refine);
  const hit = rangeCache.get(key);
  const cacheT0 = Date.now();
  // ENGINE VERSION + SPEC_V + EPOCH GATE, ALL THREE TOGETHER (Lane B job, Oct 2026, Part 1): this
  // in-memory cache had no engine-version check at all, unlike spec_market_cache's own gate
  // (prefetchSpecs, below) - a warm instance that had already answered this exact key before an
  // engine fix shipped kept serving the pre-fix answer for up to an hour regardless of any
  // ENGINE_VERSION bump, confirmed live (a stale "first-generation Mustang Shelby GT500 Supercharged
  // Fastbacks" answer over a plain-Mustang pool outlived the fix that scoped it). SPEC_V is now
  // checked here too, the same cache-shape version spec_market_cache already gates on, so a shape
  // change on that axis can never be read as still-fresh just because ENGINE_VERSION itself did not
  // move. A hit missing ANY of the three is a miss, exactly like an expired TTL.
  // SALES-EPOCH GATE (Round 5 Job 1, Oct 2026): a hit whose stamped epoch no longer matches the
  // CURRENT sales epoch (bumped by scripts/ingest.js whenever a run actually inserted new rows) is
  // a miss, exactly like a version mismatch or an expired TTL - the real fix for the "warm instance
  // keeps serving a pre-ingest answer" gap CACHE_OUTER_TTL's own comment below documents. currentEpoch
  // is itself cheaply polled (lib/_epoch.js), not a DB round trip on every hit.
  const epoch = await currentEpoch(env);
  // OBSERVE ONLY (Part 1): this mirrors the EXACT existing decision below (hit.epoch === epoch,
  // unchanged) - logging must report what the current code actually does, not a fixed version of
  // it. The epoch-null-safety fix (if the live numbers show it's needed here) is Part 3, separate.
  let missReason = null;
  if (!hit) missReason = "no_row";
  else if (hit.ev !== ENGINE_VERSION) missReason = `engine_version_mismatch:${hit.ev}!=${ENGINE_VERSION}`;
  else if (hit.v !== SPEC_V) missReason = `spec_v_mismatch:${hit.v}!=${SPEC_V}`;
  else if (hit.epoch !== epoch) missReason = `epoch_mismatch:${hit.epoch}!=${epoch}`;
  else if (!(Date.now() - hit.at < CACHE_OUTER_TTL)) missReason = `ttl_expired:${Date.now() - hit.at}ms`;
  const rangeHit = hit && !missReason;
  logCacheDecision({ cache: "rangeCache", key, hit: rangeHit, reason: missReason, ms: Date.now() - cacheT0 });
  if (rangeHit) return hit.d;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    await engineSlot();
    try {
      // oneEngineAnswer (Oct 2026, caller-migration job): same call, .raw unwrapped - every
      // downstream read of `d` (tier/_choice check, rangeCache.set) is the identical object
      // runOneBox itself returned, so the retry/deadline/choice-discard logic below is unchanged.
      const run = asked => Promise.race([oneEngineAnswer(vehicle, generation, text, { ...env, exactSale: null, asked }, refine || null).then(r => r.raw), new Promise((_, rej) => setTimeout(() => rej(new Error("deadline")), 25000))]);
      // A cold read can miss the deadline: try once more before giving up. A read that still fails
      // returns UNDEFINED (not null), so the caller can tell "the read didn't come back" from "the
      // engine answered and there is nothing to say", and never draws the first as the second.
      let d = null, ok = false, escalated = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try { d = await run(0); if (d && /_choice$/.test(String(d.tier || ""))) { d = await run(2); escalated = true; } ok = true; } catch { d = null; }
      }
      if (!ok) return undefined;
      // ONE STORED ROW PER MARKET (stage 4): the asked-0 answer, when it needed no question and is cacheable, is also
      // written as the market's stored Market Check answer (the MCWARM row under the same key), so a Buy card's read
      // and a Market Check visit share one compute. An escalated answer is never stored as the asked-0 one.
      if (!escalated && d && !/_choice$/.test(String(d.tier || "")) && answerCacheable(d)) writeWarmAnswer(env, warmAnswerKeyFor(vehicle, generation, refine), d).catch(() => {});
      if (d && /_choice$/.test(String(d.tier || ""))) d = null;
      if (answerCacheable(d)) { rangeCache.set(key, { at: Date.now(), ev: ENGINE_VERSION, v: SPEC_V, epoch, d }); if (rangeCache.size > 400) rangeCache.delete(rangeCache.keys().next().value); }
      else logCacheDecision({ cache: "rangeCache", key, hit: false, reason: `store_guard_rejected:${storeGuardRejectReason(d)}`, ms: 0 });
      return d;
    } finally { engineFree(); inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
// marketWin (Sam, Oct 14 2026, no fallback wording): the window clause is the engine's own windowWords,
// built on every tier from the receipts behind poolSize ("in the last twelve months", "since November
// 2023"; lib/onebox.js windowFactsFor). No caption table, no default - a read with no words prints no
// window clause (windowClause below), never "the past two years" against a pool that starts elsewhere.
const marketWin = d => (d && d.windowWords) || null;
// windowClause: the words as a clause with their preposition. Engine words already carry it ("in the
// last twelve months", "since November 2023"); a bare legacy value ("the past year", fixtures) gets "in".
export const windowClause = w => { const t = String(w || "").trim(); return t ? (/^(in|since|over|during)\b/i.test(t) ? t : "in " + t) : ""; };
export function marketOf(d) {
  if (!d) return null;
  // The engine's refusal still carries the real sales it read (thin: too few for a range; varied: too
  // spread out). Count THOSE cards, the same pool the miles note is built from, never a silent nothing.
  if (d.tier === "refusal" && (d.cards || []).length) return { kind: "count", count: d.cards.length, window: marketWin(d), spread: !!(d.refusal && d.refusal.kind === "varied") };
  if (d.tier === "result" && Array.isArray(d.cluster)) return { kind: "range", low: d.cluster[0], high: d.cluster[1], count: d.poolN || null, window: marketWin(d) };
  // body_unavailable (Oct 2026, one-engine-entry-point job; class_era removed Round 5 Lane B job -
  // the tier no longer exists): carries real cards (the named-body-never-sold line) but never sets
  // d.poolN, so it fell through to the generic `d.poolN || 0` line below and always read as 0 -
  // Buy/Tasks rendered "no market read" for a car Market Check answers with real evidence.
  // Delegates to the shared mapEngineAnswer/factsBlockFrom (this file's single engine entry point)
  // so a tier's cards become a count in exactly ONE place, never a second hand-rolled rule that can
  // drift from the first.
  if (d.tier === "body_unavailable") {
    const fb = mapEngineAnswer(d, null).factsBlock;
    return fb && fb.count > 0 ? { kind: "count", count: fb.count, window: fb.window || marketWin(d), spread: false } : null;
  }
  const n = d.tier === "thin" ? ((d.cards || []).length || ((d.thin && d.thin.receipts) || []).length) : (d.poolN || 0);
  // "Too spread out" only when the engine had enough sales for a range (its band or cluster tier) and
  // still marked none; a thin pool (3-7, or fewer) is a count, never a spread (rule 24).
  return n > 0 ? { kind: "count", count: n, window: marketWin(d), spread: d.tier === "result" && (d.rangeTier === "band" || d.rangeTier === "cluster") } : null;
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders", speedster: "Speedsters", wagon: "wagons" };
// The listing resolved to its own family (generation, trim, body, gearbox); One Box's answer for it.
// ---------------------------------------------------------------- the spec's market, cached
// What each exact spec sells for is precomputed (spec_market_cache, invalidated rows deferred-
// recomputed nightly by scripts/recomputeSpecCache.js via lib/_specRecompute.js) so a search never
// runs the engine live. Layers: this instance's
// memory, then the table, then (blocking callers only) the engine, which also writes the cache.
// A no-block caller (the budget rule, the chat's first reply) gets "pending" on a miss and the fill
// runs in the background. The spec key is the engine-answer key: [make, model, trim, generation, body, gearbox].
const specMem = new Map(), specOfMem = new Map(), specMiss = new Map();   // specMiss: key -> when the table last had nothing
// FRESHNESS RULE (Round 5 Job 1, Oct 2026 - supersedes the old TTL-only rule below): THREE
// independent conditions, any one of which makes a row a miss:
//  1. INGEST-TIED (table level): scripts/ingest.js deletes every spec_market_cache row for a
//     make/model the moment it upserts a new row for that make/model (see that script's own
//     comment). A row that still exists in the table has, by construction, not been touched by
//     ingest since it was computed.
//  2. SALES-EPOCH-TIED (in-process level, the gap rule 1 did not cover): lib/_epoch.js's
//     currentEpoch() is the cheap, globally-readable signal scripts/ingest.js bumps at the end of
//     every run that actually inserted rows. Every specMem/rangeCache entry is stamped with the
//     epoch current when it was computed; a read whose stamped epoch no longer matches is a miss,
//     exactly like an expired TTL - this is what makes a warm instance's in-process Maps agree with
//     a fresh Market Check read the MINUTE after new sales land, not up to CACHE_OUTER_TTL later.
//     (Confirmed live mechanism this closes: the 2017 Porsche 911 Carrera S Coupe mismatch, FOR LANE
//     B note - Market Check calls runOneBox fresh on every request with no cache at that layer,
//     while Buy/Sell/Tasks read these in-process Maps; a warm instance holding a pre-ingest answer
//     used to keep serving it for up to the old TTL after a fresh sale had already changed the
//     engine's own decision, e.g. buildPool's `useRecent` 12-month test flipping false to true.)
//  3. TIME: CACHE_OUTER_TTL is a GENEROUS, explicit backstop - not the real freshness mechanism
//     anymore (rule 2 is), but kept as defense in depth against a write path that lands real sales
//     without going through scripts/ingest.js's epoch bump (a manual backfill, a one-off SQL
//     correction, an epoch-bump code path failing silently). Raised from the old 1h (when TTL alone
//     was the only guarantee and had to be tight) to 24h now that rule 2 does the minute-to-minute
//     work; a missed epoch bump is bounded at one day, never indefinite.
const CACHE_OUTER_TTL = 24 * 3600e3, SPEC_V = 10;
// WINDOW DAY (Oct 15 2026, the 1987 911 Carrera Cabriolet sweep mismatch): every pool is read over a window that ends
// NOW ("the last twelve months"), so at 00:00 UTC the oldest day's sales age out even when no ingest moved the epoch. A
// row computed on an earlier UTC day can therefore count one sale more than a fresh read (Buy 10 against Market Check
// 9 on the same rung, 17:30 PDT). A stored answer from an earlier UTC day is stale: Buy's core row is a miss, the
// Market Check row is served stale with the dated line and recomputed.
const utcDay = t => { const d = new Date(t); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null; };
const sameUtcDay = t => utcDay(t) === utcDay(Date.now());
// SPEC_V 8 (Oct 2026): ladderSteps dropped the any_body widening step - a row cached under the OLD
// ladder can hold a wider, wrong-body pool (the 911 Turbo Targa case: cached at count 41, the whole
// 930 Turbo family, when the correct answer is 6 Targa-only sales). The computation changed, not
// just the shape, but the version check is the only mechanism that forces a recompute rather than
// serving a stale value, so it bumps here too.
// SPEC_V 9 (Oct 2026, one-engine-entry-point job): class_era/body_unavailable used to compute
// (and persist) `{v: SPEC_V, kind: "none"}` for every such spec, indistinguishable from a
// genuine empty pool - classEraCoreOf now computes a real count for them, but the OLD "none" rows
// this engine already wrote for these specs (CLK DTM, Targa 4, etc.) carry the OLD SPEC_V and
// would otherwise keep serving "none" indefinitely after this fix deployed, confirmed live
// via task=buypathdiag (generations matched, Market Check's own class_era tier had 13 real
// cards, yet familyMarket still returned null - a stale cached row, not a code gap). Bumping
// forces every spec to recompute once under the new logic, exactly SPEC_V's documented purpose.
// SPEC_V 10 (Round 5 Lane B job, Oct 2026): coreOf/countOnlyCoreOf now carry fallbackRung/
// rungLabel/siblingName (the new model-first-ladder contract, Part 2) and class_era itself is
// deleted - a row cached under the OLD shape has neither field and may be a now-impossible
// class_era core; bumping forces every spec to recompute under the new ladder and the new fields.

const EFFECTIVE_TTL = CACHE_OUTER_TTL;
// ONE key builder (Oct 2026 follow-up, item 1): specOf (below) and api/sellerDecision.js's
// opportunistic refresh (via coreOf/persistCore above) both call this, so a card-side key and a
// Market-Check/drawer-side key for the SAME car are constructed identically, never two slightly
// different formats that silently miss each other. Safe to share now that resolveVehicle and
// resolveForBuy agree on trim/bodyStyle for every curated case (the Oct 2026 trim-list audit) - a
// key built from either resolver's output names the same spec.
export function specKeyFor(v, generation, refine) {
  // Half-generation job (Oct 2026): a half-generation model's merged generation.code ("987", "997",
  // "e46") does not distinguish 987.1 from 987.2, or a 997.1-era search from a 997.2-era one - two
  // different real answers (a narrower window for a SPLIT model, different same-half context cards
  // for a MERGED one) would share one cache key and whichever cached first would silently serve the
  // other's answer. Mirrors lib/onebox.js buildSpec's own half-generation step exactly (same table,
  // same halfForYear match) so the cache key always names what the engine actually computed.
  const hg = halfGenerationFor(v.make, v.model);
  const half = hg ? halfForYear(hg, v.year) : null;
  // YEAR COLLISION FIX (Lane B job, Oct 2026, URGENT): half.code alone does not distinguish one YEAR
  // inside the half from another - "2009 Porsche 997 Carrera S Coupe" and "2010 Porsche 997 Carrera S
  // Coupe" both map to half.code "997.2" and produced the IDENTICAL cache key, so whichever year's
  // EXACT-rung answer was cached first (a single model year, not the half-wide pool) got silently
  // served to every other year in the same half. Confirmed live: "2010 Porsche 997 Carrera S Coupe"
  // read back a cached "2009" exact answer (same make/model/trim/bodyStyle, same half.code, different
  // year).
  // GENERALISED TO EVERY MODEL (Lane B Part 1/Part 2 job, Oct 2026): the fix above only reached
  // models with a HALF_GENERATIONS row (997/987/e46). A plain curated generation (911's 992, no
  // half-generation entry) still keyed on generation.code ALONE with no year at all - "2025 Porsche
  // 911" and any other year inside 2019-2026 shared ONE cache row, so whichever year's ladder
  // computed first (exact or year_widened, both narrower than the whole generation) silently
  // answered for every other year too. Confirmed live via obdiag+cachecheck: the stored
  // spec_market_cache row for key ["Porsche","911",null,"992",null,null,null,null,null,undefined]
  // carries whatever year last computed it, with nothing in the key to say which. This was the
  // real cause of the 42-vs-30-sales Market-Check/Sell-vs-Buy/Tasks drift (docs/golden-rules.md,
  // docs/lane-notes.md Part 2 job). The literal year is now ALWAYS part of the key, half-generation
  // or not - a small, deliberate loss of sharing for a "generation" rung answer that happens to be
  // identical across years in exchange for an exact/year_widened answer never crossing years again.
  // edition/variant/wheelbase (Part 1 job): real resolver fields that scope the pool exactly like
  // trim/body do (a Series 1 240Z, an LWB Defender) and must scope the cache identically, or two
  // differently-worded cars silently share one answer the same way the year bug did.
  const genCode = half ? half.code : ((generation && generation.code) || null);
  // APPLIED REFINE IN THE KEY (e49, Sam's item 13, Lane C's line): engineAnswer passes the whole refine to the engine
  // (body, trim and variant all scope the pool there) but the key carried only refine.tx, so engineAnswer(v, g, text,
  // env, { body: "coupe" }) and the bare call shared one rangeCache entry and one spec_market_cache row, and whichever
  // ran first answered both. The three identity refines are now in the key; every cache of an answer (rangeCache,
  // the stored row, the Market Check warm row, the Sell facts row) keys through this one function.
  return JSON.stringify([v.make, v.model, v.trim, v.year || null, genCode, v.bodyStyle, v.edition || null, v.variant || null, v.wheelbase || null, refine && refine.tx, (refine && refine.body) || null, (refine && refine.trim) || null, (refine && refine.variant) || null]);
}
export async function specOf(env, row, facts, resolvedVehicle) {
  const title = String(row.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
  // ENGINE_VERSION in the key (job 8, cache/version mismatch job, Oct 2026): this in-memory, per-
  // instance cache held a listing's RESOLVED SPEC (make/model/trim/generation/key) with no version
  // component and no expiry at all - a resolver fix (a trim/badge/generation change, exactly the
  // shape of fix this round's M3 pattern-match work makes) could leave a warm instance serving a
  // stale pre-fix resolution for a title it had already seen, indefinitely, even after the version
  // that stamps every OTHER cache layer (spec_market_cache, market_fetch_cache) had moved on. This is
  // the one cache layer that had no ENGINE_VERSION tie at all - a version bump now naturally
  // invalidates every entry (the key changes, so a stale one is simply unreachable and ages out via
  // the existing 5000-entry eviction, never read again).
  const mk = ENGINE_VERSION + "|" + title + "|" + (row.year || "") + "|" + (facts.body || "") + "|" + (facts.gearbox || "");
  if (specOfMem.has(mk)) return specOfMem.get(mk);
  // resolvedVehicle (one-resolver fix, Oct 2026): familyMarket already HAS a vehicle resolveForBuy
  // itself produced (or the caller's own resolveVehicle output) - it used to flatten that back into
  // "[year, make, model, trim].join(' ')" and hand the STRING here, which re-entered resolveVehicle a
  // second time on lossy, re-serialized text (every compound/structured trim - "CLK DTM", "Targa 4",
  // "356 Speedster", "308 GTS Spider", "Carrera RS", chassis-form "240Z", any "X Roadster" - loses
  // information resolveVehicle's FIRST pass already had correctly; confirmed as the root cause of
  // ~11 of 63 crossProductCheck specs showing Buy/Tasks failing to resolve what Market Check/Sell
  // resolve fine from the same raw text). A caller that already resolved the vehicle passes it here
  // directly: specOf runs it through enrichForBuy (genCode/fetchTrim/trim-body-split, all of which
  // operate on the vehicle object and are safe to re-run) but never re-enters resolveVehicle itself.
  // The real-listing-row path (every OTHER caller of listingMarket, which passes a genuine listing's
  // own raw title and no resolvedVehicle) is unchanged and still resolves via resolveForBuy as before.
  const v = resolvedVehicle ? enrichForBuy({ ...resolvedVehicle }, title) : await resolveForBuy(title, env);
  let spec = null;
  if (v && v.model) {
    if (row.year) v.year = row.year;
    // ONE ENGINE ANSWER PER CAR (Oct 2026, Lane C): a live listing's card reads what Market Check answers for that
    // listing's own car, its title as typed, so its body and gearbox come only from what the resolver reads in the
    // title. The listing's feed body and stated gearbox used to narrow the card further than Market Check ever does
    // (a 4-speed 1969 Camaro coupe read 13 manual sales at $56,500 to $85,000 while Market Check read 18 at $48,000
    // to $79,500). A body or gearbox the buyer ASKED for (familyMarket, which passes resolvedVehicle) still scopes, the
    // same as typing it into Market Check.
    if (resolvedVehicle && facts.body && !v.bodyStyle) v.bodyStyle = facts.body;
    const generation = await listingGeneration(v, title, env);
    const refine = resolvedVehicle && facts.gearbox ? { tx: facts.gearbox, label: facts.gearboxLabel || facts.gearbox } : null;
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
  // The same group in its one-car form, for "The middle half of 3.2 Carrera Cabriolet sales" (soldLine).
  m.familyOneBare = bw && !new RegExp(bw.replace(/s$/, ""), "i").test(head) ? head + " " + bw.replace(/s$/, "") : head;
  m.familyOne = (refine && d && d.refined ? gl + " " : "") + m.familyOneBare;
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
  // e61: the exact lowest and highest included sale and the wide-spread flag, passed through from the engine's own answer.
  m.lowestSaleN = d && Number.isFinite(Number(d.lowestSaleN)) && d.lowestSaleN !== null ? Number(d.lowestSaleN) : null;
  m.highestSaleN = d && Number.isFinite(Number(d.highestSaleN)) && d.highestSaleN !== null ? Number(d.highestSaleN) : null;
  m.wideSpread = d && d.wideSpread === true;
  m.take = d && d.samsTake && d.samsTake.sentence ? String(d.samsTake.sentence) : null;
  // Business tooling only (Oct 2026) - passed through unchanged from the engine's own computation
  // (lib/onebox.js runOneBox), never recomputed here, so Buy/Tasks' own read of this reduction
  // carries the identical figure Market Check/Sell see. Not rendered by any page this file feeds.
  m.referenceFigure = (d && d.referenceFigure) || null;
  // Lane B's bodyScoped (documented Oct 2026, docs/lane-notes.md): does this range fit the car's body style?
  // Passed through unchanged; null until the engine sets it. Task emails gate their placing line on it.
  m.bodyScoped = d && typeof d.bodyScoped === "boolean" ? d.bodyScoped : null;
  m.referenceFigureReason = (d && d.referenceFigureReason) || null;
  // Reconciliation counts (Oct 2026, count reconciliation job) - passed through unchanged from the
  // engine's own computation, same discipline as referenceFigure above, so Buy/Tasks' card ever
  // states the identical qualifying/used/setAside figures Market Check/Sell compute.
  m.counts = (d && d.counts) || null;
  // windowLabel/poolYears (Oct 2026, one-pool-for-widened-years job): the engine's OWN, raw window
  // label and year span, passed through unchanged - same discipline as referenceFigure/counts
  // above. m.window (marketOf, this file) is a CAPTION derived from this; this is the literal value
  // so a caller (or crossProductCheck) can compare what the engine actually decided, not a
  // re-derived guess. Null until the engine sets it (e.g. class_era carries no poolYears).
  m.windowLabel = (d && d.windowLabel) || null;
  m.poolYears = Array.isArray(d && d.poolYears) ? d.poolYears : null;
  // readAt + trend quarters (Sam, Oct 16 2026, Lane A's shared card and its latest-quarter row): passed through from
  // the engine answer unchanged, the same values Market Check carries.
  m.readAt = (d && d.readAt) || null;
  m.latestSaleDate = (d && d.latestSaleDate) || null; m.oldestIncludedSaleDate = (d && d.oldestIncludedSaleDate) || null;
  m.latestSaleLine = (d && d.latestSaleLine) || null; m.includesFromLine = (d && d.includesFromLine) || null; m.basisLine = (d && d.basisLine) || null;
  m.bodyLine = (d && d.bodyLine) || null;
  m.trendQuarters = d && d.trend && Array.isArray(d.trend.quarters) ? d.trend.quarters.map(q => ({ period: q.period, low: q.low ?? null, high: q.high ?? null, count: Number(q.count) || 0, thin: !!q.thin })) : null;
  // v/engineVersion (Oct 2026, M3 Competition mismatch job): stamped HERE, in the one shared
  // builder, not by each caller. api/sellerDecision.js's opportunistic card-cache refresh (Market
  // Check and the Buy drawer) calls coreOf() directly and persists its result WITHOUT ever going
  // through walkLadder - before this, that persisted row carried no v/engineVersion at all, so
  // prefetchSpecs' own freshness check (market.v !== SPEC_V) discarded it as invalid immediately,
  // regardless of how fresh it was. The "ordinary traffic keeps a popular spec's card fresh" comment
  // on that call site was therefore a no-op in practice; walkLadder's own refresh was the only write
  // that ever produced a row Buy/Tasks would accept. Stamping here fixes every caller at once.
  // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026, Part 2): passed through
  // unchanged from the engine's own computation - same discipline as referenceFigure/counts above -
  // so Buy/Tasks' card states the identical rung and pool-scope label Market Check/Sell see. This is
  // the "pass fields through" option (not a direct raw-answer read, which would need a bigger change
  // to the epoch/cache layer this file's whole top half is built around) - see the job report.
  m.fallbackRung = d.fallbackRung || null;
  m.rungLabel = d.rungLabel || null;
  m.siblingName = d.siblingName || null;
  m.v = SPEC_V;
  m.engineVersion = ENGINE_VERSION;
  return m;
}
// body_unavailable "core" (Round 5 Lane B job, Oct 2026: renamed from classEraCoreOf and narrowed
// to this one tier - class_era is DELETED, since classEraGuarded/assessClassEra no longer exist and
// runOneBox never returns that tier). walkLadder has NEVER called coreOf for body_unavailable,
// deliberately: coreOf builds a FAMILY label claiming "the group THIS car belongs to"
// (m.family/m.short/m.familyOne), which would misstate a body_unavailable answer (the named body
// was never offered for this car at all - there is no real cohort to name). This function never
// claims a family: it returns a count-only core with family/short/familyOne all null, so
// listingMarket/salesNoun/soldLine fall back to their own existing generic wording ("comparable
// sales", "Not enough recent sales to show a range.") - no new copy, just letting the card show a
// real count instead of nothing at all.
function countOnlyCoreOf(d) {
  const mapped = mapEngineAnswer(d, null);
  const fb = mapped.factsBlock;
  if (!fb || !fb.count) return null;
  return {
    kind: "count", count: fb.count, low: null, high: null, window: fb.window || null, spread: false,
    family: null, familyOne: null, familyOneBare: null, familyBare: null, refinedNote: null, short: null,
    recent: [], top: null, take: null, span: null, step: d.ladderStep || d.tier,
    referenceFigure: d.referenceFigure || null, referenceFigureReason: d.referenceFigureReason || null,
    counts: d.counts || null, soldMi: [], bodyScoped: null,
    fallbackRung: d.fallbackRung || null, rungLabel: d.rungLabel || null, siblingName: d.siblingName || null,
    v: SPEC_V, engineVersion: ENGINE_VERSION,
  };
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

// ---------------------------------------------------------------- Market Check bare-nameplate warm cache (Round 5 Job 3)
//
// Market Check (api/sellerDecision.js oneBox branch) has ALWAYS called the engine fresh, by
// original design - no cache read at that layer at all. That was the right call before Job 1:
// caching Market Check risked exactly the staleness divergence Job 1's sales-epoch gate was built
// to fix. Now that the epoch gate exists, giving Market Check a cache-READ path for warmed bare-
// nameplate entries is safe - a hit is guaranteed epoch-fresh, byte-identical to what a live call
// would have returned at that moment. Scoped narrowly: ONLY a bare nameplate (no trim) hits this
// path; everything else (a named trim, a refine, any cache miss) falls straight through to the
// existing always-fresh call, unchanged. This is a fast path, not a new freshness guarantee of its
// own - it rides on Job 1's.
//
// Reuses spec_market_cache (the SAME table Buy/Tasks already read via coreOf/persistCore) but under
// a DISTINCT key namespace ("MCWARM:" + the existing specKeyFor) so this never collides with or
// changes the shape Buy/Tasks' own rows carry - this stores the FULL raw engine answer (every
// field Market Check's response spreads: tier, cluster, cards, rawPool, recent3, counts,
// identityQuestion, factsBlock, resolvedCar...), not coreOf's reduction, because Market Check's
// response IS the raw answer, byte for byte - serving anything less would be a silent fidelity
// loss, not a cache hit.
const WARM_PREFIX = "MCWARM:";
export function warmAnswerKeyFor(vehicle, generation, refine = null) { return WARM_PREFIX + specKeyFor(vehicle, generation, refine); }
// Read: null on ANY reason to not serve this (not warmed, wrong engine version, epoch stale, or
// older than the 24h outer backstop - the same defense-in-depth principle as CACHE_OUTER_TTL
// above, in case a write path ever misses an epoch bump) - every null is a plain cache miss to the
// caller, which just proceeds to its own always-fresh call exactly as if this function did not exist.
// STORED ANSWER PER MARKET (speed job stage 4, Sam's OK Oct 15 2026): the same row, read in detail. Returns
// { raw, stale, storedAt, reason }: raw is the stored answer when it is this engine version and under 24 hours old;
// stale is true when the ingest epoch has moved since it was stored (the caller serves it at once, marked, and
// recomputes in the background); raw is null on no row, an older engine version or past 24 hours (never served).
export async function readWarmAnswerDetailed(env, key) {
  const t0 = Date.now();
  try {
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market,computed_at`);
    const row = rows && rows[0];
    if (!row || !row.market || !row.market.raw) { logCacheDecision({ cache: "warm", key, hit: false, reason: "no_row", ms: Date.now() - t0 }); return { raw: null, stale: false, storedAt: null, reason: "no_row" }; }
    if (row.market.engineVersion !== ENGINE_VERSION) { logCacheDecision({ cache: "warm", key, hit: false, reason: "engine_version_mismatch", ms: Date.now() - t0 }); return { raw: null, stale: false, storedAt: null, reason: "engine_version_mismatch" }; }
    const computedAt = Date.parse(row.computed_at);
    if (!Number.isFinite(computedAt) || Date.now() - computedAt >= 24 * 3600e3) { logCacheDecision({ cache: "warm", key, hit: false, reason: "ttl_expired", ms: Date.now() - t0 }); return { raw: null, stale: false, storedAt: null, reason: "ttl_expired" }; }
    const epoch = await currentEpoch(env);
    const epochStale = !!(epoch && row.market.warmEpoch && row.market.warmEpoch !== epoch);
    const dayStale = !sameUtcDay(computedAt);
    const stale = epochStale || dayStale;
    logCacheDecision({ cache: "warm", key, hit: true, reason: stale ? (epochStale ? `stale:${row.market.warmEpoch}!=${epoch}` : "stale:earlier_utc_day") : null, ms: Date.now() - t0 });
    return { raw: row.market.raw, stale, storedAt: row.computed_at, recomputingSince: row.market.recomputingSince || null, reason: stale ? (epochStale ? "epoch_mismatch" : "earlier_utc_day") : null };   // recomputingSince: when a stale serve last started a recompute
  } catch (e) {
    logCacheDecision({ cache: "warm", key, hit: false, reason: "error:" + String(e && e.message || e).slice(0, 60), ms: Date.now() - t0 });
    return { raw: null, stale: false, storedAt: null, reason: "error" };
  }
}
export async function readWarmAnswer(env, key) {
  const t0 = Date.now();
  try {
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market,computed_at`);
    const row = rows && rows[0];
    let reason = null, result = null;
    if (!row || !row.market || !row.market.raw) {
      reason = "no_row";
    } else if (row.market.engineVersion !== ENGINE_VERSION) {
      reason = `engine_version_mismatch:${row.market.engineVersion}!=${ENGINE_VERSION}`;
    } else {
      const computedAt = Date.parse(row.computed_at);
      if (!Number.isFinite(computedAt) || Date.now() - computedAt >= 24 * 3600e3) {
        reason = "ttl_expired";
      } else {
        // EPOCH-UNAVAILABLE (null - unseeded app_config row, or a transient read failure) must NOT
        // force a miss: lib/_epoch.js's own contract is "a null return is handled by callers as
        // epoch checking is unavailable - they fall back to serving the cache on its existing TTL
        // alone, never to a hard miss" (see its currentEpoch comment). The old `!epoch ||` form
        // broke that contract HERE ONLY - every other epoch-gated read site in this file (rangeCache
        // above, specMem below) uses the same "only a confirmed, known mismatch misses" pattern.
        // A real mismatch (both epochs known and different, i.e. ingest actually bumped it since
        // this row warmed) still misses, exactly as designed.
        const epoch = await currentEpoch(env);
        if (epoch && row.market.warmEpoch && row.market.warmEpoch !== epoch) reason = `epoch_mismatch:${row.market.warmEpoch}!=${epoch}`;
        else if (!sameUtcDay(computedAt)) reason = "earlier_utc_day";
        else result = row.market.raw;
      }
    }
    logCacheDecision({ cache: "warm", key, hit: !!result, reason, ms: Date.now() - t0 });
    return result;
  } catch (e) {
    logCacheDecision({ cache: "warm", key, hit: false, reason: "error:" + String(e && e.message || e).slice(0, 60), ms: Date.now() - t0 });
    return null;
  }
}
// Write: stamps the CURRENT epoch and engine version onto the raw answer before persisting, via the
// SAME persistCore writer every other spec_market_cache row uses (low_usd/high_usd/sale_count come
// out null for this shape, harmless - nothing reads those columns back, only `market` whole).
// A stale row being served records when its recompute was started (stage 4), so a later stale read can tell a
// recompute in flight from one that never landed. One small PATCH of the market JSON, nothing else changes.
export async function markRecomputing(env, key) {
  const rows = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market,computed_at`);
  const row = rows && rows[0]; if (!(row && row.market)) return;
  await fetch(`${env.supabaseUrl}/rest/v1/spec_market_cache?on_conflict=spec_key`, { method: "POST", headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ spec_key: key, market: { ...row.market, recomputingSince: new Date().toISOString() }, computed_at: row.computed_at }]) });
}
export async function writeWarmAnswer(env, key, rawAnswer) {
  const epoch = await currentEpoch(env);
  await persistCore(env, key, { raw: rawAnswer, engineVersion: ENGINE_VERSION, warmEpoch: epoch, warmedAt: new Date().toISOString() });
}
// Load many keys from the table into memory at once (one query per 60 keys).
export async function prefetchSpecs(env, keys) {
  // SALES-EPOCH GATE: an in-memory hit whose stamped epoch no longer matches current is NOT
  // skipped here - it still needs a fresh table read, same as an expired-TTL or never-seen key.
  const epoch = await currentEpoch(env);
  const want = [...new Set(keys)].filter(k => k && !(specMem.has(k) && specMem.get(k).epoch === epoch && Date.now() - specMem.get(k).at < EFFECTIVE_TTL) && !(specMiss.has(k) && Date.now() - specMiss.get(k) < 120e3));
  for (let i = 0; i < want.length; i += 60) {
    const part = want.slice(i, i + 60);
    const list = part.map(k => '"' + String(k).replace(/"/g, '\\"') + '"').join(",");
    const rows = await supabaseSelect(env, `spec_market_cache?spec_key=in.(${encodeURIComponent(list)})&select=spec_key,market,computed_at`).catch(() => null);
    // A read that failed is not a table with nothing in it (Lane E, E5, Oct 16 2026): a null from a throttled or timed-out
    // read used to mark every key in the batch specMiss for two minutes, turning a whole Buy result into pending cards
    // and firing a background engine run per card. Ask again next time instead.
    if (rows == null) continue;
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
      // SHARED ENGINE VERSION GATE (Oct 2026, M3 Competition mismatch job): SPEC_V alone only
      // invalidates on the specific shape changes it was bumped for (the any_body ladder-step
      // removal). lib/onebox.js's own ENGINE_VERSION comment says it is meant to be "mixed into
      // every persistent... decision cache" so an engine change can never serve a pre-change
      // answer - this row-level check is what actually makes that true for spec_market_cache, not
      // just for market_fetch_cache. A row stamped under an older ENGINE_VERSION is a miss, exactly
      // like an expired or wrong-SPEC_V row, regardless of how fresh its computed_at timestamp is.
      if (r.market.engineVersion !== ENGINE_VERSION) continue;
      const computedAt = Date.parse(r.computed_at);
      if (!Number.isFinite(computedAt) || Date.now() - computedAt >= EFFECTIVE_TTL) continue;
      if (!sameUtcDay(computedAt)) continue;   // the window moved at 00:00 UTC: an earlier day's count can be one sale high
      // Stamped with the epoch CURRENT AS OF THIS READ (not the row's own computed_at): the table
      // row already reflects every ingest up to right now (rule 1, the table-level guarantee), so
      // the in-memory copy of it is exactly as fresh as a brand-new read would be, under whatever
      // epoch is current at this moment.
      specMem.set(r.spec_key, { core: r.market.kind === "none" ? null : r.market, at: computedAt, epoch });
      got.add(r.spec_key);
    }
    // A key the table doesn't hold is not asked for again for two minutes (no per-card re-query).
    for (const k of part) if (!got.has(k)) specMiss.set(k, Date.now());
  }
}
// Compute (engine), persist, remember. undefined = the read did not come back.
// The range ladder (Oct 2026): the exact spec first; when it has no range, the next cohort up, named
// for what it is. 1 exact (with the gearbox), 2 any gearbox (the archive often records no transmission,
// so a manual filter can empty a pool whose titles all say 5-Speed). Never past the body style or the
// trim the visitor named: a Carrera 2 is not a Carrera 4, and a Targa is not a Coupe (Oct 2026 follow-
// up, finding 8 - an "any_body" step used to drop the body filter when the body-scoped cohort was
// thin, landing on the whole model/trim pool instead; that is EXACTLY the widening Market Check/Sell's
// own evidence ladder never does, so a visitor-named body diverged from the other two lanes the first
// time it actually mattered - removed, not narrowed, so Buy/Tasks can never widen past a body style or
// trim at all, matching Market Check/Sell's policy exactly: a thin body-scoped cohort stays thin). The
// first rung with a range wins; with none, the most specific rung that has any sales (a count, no
// rail). The chosen cohort is cached under the EXACT spec's key.
export function ladderSteps(spec) {
  const steps = [{ step: "exact", v: spec.v, title: spec.title, refine: spec.refine }];
  if (spec.refine) steps.push({ step: "any_gearbox", v: spec.v, title: spec.title, refine: null });
  return steps;
}
export async function walkLadder(env, spec, trace) {
  let firstCount = null;
  for (const st of ladderSteps(spec)) {
    const d = await engineAnswer(st.v, spec.generation, st.title, env, st.refine);
    if (d === undefined) return undefined;   // a read that didn't come back: never cached as "nothing"
    // Only the engine's own read of THIS cohort counts - coreOf (which claims a family label) stays
    // gated to result/thin/refusal. body_unavailable gets countOnlyCoreOf instead (Oct 2026,
    // one-engine-entry-point job, renamed Round 5 Lane B job when class_era was deleted): a
    // count-only core with NO family claim, so Buy/Tasks shows a real number instead of "no market
    // read". class_era itself is GONE - classEraGuarded/assessClassEra no longer exist, so runOneBox
    // never returns that tier; no dispatch branch for it remains.
    const core = d && /^(result|thin|refusal)$/.test(String(d.tier)) ? coreOf(d, { ...spec, v: st.v, refine: st.refine })
      : d && d.tier === "body_unavailable" ? countOnlyCoreOf(d)
      : null;
    if (trace) trace.push({ step: st.step, title: st.title, tier: d && d.tier, family: core && core.family, kind: core && core.kind, count: core && core.count, low: core && core.low, high: core && core.high, span: core && core.span });
    if (core) core.step = st.step;   // v/engineVersion are now stamped inside coreOf itself
    // A gearbox-refined group keeps "manual"/"automatic" in its name only when the spec really sells in
    // both (5+ of each among its sales with no gearbox filter): a 997 Carrera S yes, a Cayenne never.
    if (core && st.refine) {
      const all = await engineAnswer(st.v, spec.generation, st.title, env, null).catch(() => undefined);
      const titles = ((all && all.cards) || []).map(c => String(c.title || c.t || ""));
      const man = titles.filter(t => /\b(?:manual|stick|\d-speed)\b/i.test(t) && !/\b(?:automatic|tiptronic|pdk|dct|smg|dsg|dual-clutch|sportomatic)\b/i.test(t)).length;
      const aut = titles.filter(t => /\b(?:automatic|tiptronic|pdk|dct|smg|dsg|dual-clutch|sportomatic)\b/i.test(t)).length;
      if (!(man >= 5 && aut >= 5)) { core.family = core.familyBare || core.family; core.familyOne = core.familyOneBare || core.familyOne; }
    }
    if (core && core.kind === "range") return core;
    if (core && core.count && !firstCount) firstCount = core;
  }
  return firstCount;
}
export async function refreshSpec(env, spec) {
  const core = await walkLadder(env, spec);
  if (core === undefined) return undefined;
  // A live ladder walk just ran THIS SECOND - stamp it with the epoch current right now, same as
  // every other write site (prefetchSpecs/engineAnswer), so it reads fresh until the NEXT bump.
  specMem.set(spec.key, { core, at: Date.now(), epoch: await currentEpoch(env) });
  await persistCore(env, spec.key, core || { v: SPEC_V, engineVersion: ENGINE_VERSION, kind: "none" });
  return core;
}
const filling = new Set();
async function specCore(env, spec, noBlock) {
  const hit = specMem.get(spec.key);
  const t0 = Date.now();
  // Same engine-version gate as rangeCache above: a refreshSpec() write (below) is in-memory, same-
  // instance, and carries no version check of its own - core.engineVersion is already stamped by
  // coreOf, so read it directly rather than adding a second wrapper field.
  // SALES-EPOCH GATE (Round 5 Job 1): an epoch mismatch is a miss, exactly like a version mismatch
  // or an expired TTL - see the FRESHNESS RULE comment above specMem's declaration.
  // OBSERVE ONLY (Part 1): mirrors the EXACT existing decision (hit.epoch === epoch, unchanged).
  const epoch = await currentEpoch(env);
  let missReason1 = null;
  if (!hit) missReason1 = "no_row";
  else if (hit.core && hit.core.engineVersion !== ENGINE_VERSION) missReason1 = `engine_version_mismatch:${hit.core.engineVersion}!=${ENGINE_VERSION}`;
  else if (hit.epoch !== epoch) missReason1 = `epoch_mismatch:${hit.epoch}!=${epoch}`;
  else if (!(Date.now() - hit.at < EFFECTIVE_TTL)) missReason1 = `ttl_expired:${Date.now() - hit.at}ms`;
  else if (!sameUtcDay(hit.at)) missReason1 = "earlier_utc_day";
  const memHit = hit && !missReason1;
  logCacheDecision({ cache: "specMem", key: spec.key, hit: memHit, reason: missReason1, ms: Date.now() - t0 });
  if (memHit) return hit.core;
  const t1 = Date.now();
  await prefetchSpecs(env, [spec.key]);
  // h2 must ALSO be epoch-fresh: prefetchSpecs only OVERWRITES specMem on an actual table hit - if
  // the table row was deleted by ingest's invalidation and not yet recomputed, the OLD stale-epoch
  // entry would otherwise still be sitting here and get returned as if it were a hit.
  const h2 = specMem.get(spec.key);
  const epochOk2 = h2 && h2.epoch === epoch;
  const h2Hit = h2 && epochOk2;
  logCacheDecision({ cache: "spec_market_cache", key: spec.key, hit: h2Hit, reason: h2Hit ? null : (h2 ? `epoch_mismatch:${h2.epoch}!=${epoch}` : "no_row"), ms: Date.now() - t1 });
  if (h2Hit) return h2.core;
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
// sold for (card line, the Market Check panel, Sam's notes, lists, task emails), so two cards never word it
// differently and a card never says both "there is a range" and "there is no range". A range is the middle
// half of the group's sales (Market Check's own "The middle half of comparable sales landed here."), so it
// says exactly that; never "most", never a median, never a count of sources. No range: one neutral line.
// "3.2 Carrera Cabriolets" -> "3.2 Carrera Cabriolet sales": the group noun in its one-car form.
export function salesNoun(m) {
  const one = m && m.familyOne ? String(m.familyOne) : null;
  if (one) return one + " sales";
  const fam = String((m && m.family) || "").trim();
  if (!fam) return "comparable sales";
  if (/ cars$/i.test(fam)) return fam.replace(/ cars$/i, "") + " sales";   // "SLS AMG cars" -> "SLS AMG sales"
  if (/ motorcycles$/i.test(fam)) return fam.replace(/ motorcycles$/i, " motorcycle") + " sales";
  return fam.replace(/([A-Za-z0-9])s$/, (x, c) => (/[sS]$/.test(c) ? x : c)) + " sales";
}
export function soldLine(m) {
  if (!m) return null;
  const n$ = n => Number(String(n == null ? "" : n).replace(/[^0-9.]/g, "")) || 0;   // a number or "$47,000"
  const usdW = n => "$" + Math.round(n$(n)).toLocaleString("en-US");
  if (m.kind === "range" && n$(m.low) > 0 && n$(m.high) > 0) return `The middle half of ${salesNoun(m)} landed at ${usdW(m.low)} to ${usdW(m.high)}${windowClause(m.window) ? " " + windowClause(m.window) : ""}.`;
  if (m.spread) return "Sales of cars like it vary too widely to show one range.";
  return "Not enough recent sales to show a range.";
}
// The resolved car as Market Check text: "1988 Porsche 911 Carrera Cabriolet", plus "manual" only when the
// card's own read was narrowed to the manual gearbox (its ladder step stayed "exact").
export function specQuery(spec, step) {
  const v = spec.v || {}, cap = x => String(x).replace(/\b[a-z]/g, c => c.toUpperCase());
  const body = v.bodyStyle && !new RegExp("\\b" + String(v.bodyStyle).replace(/[^a-z]/gi, "") + "\\b", "i").test([v.model, v.trim].join(" ")) ? cap(v.bodyStyle) : null;
  const words = [v.year, v.make, v.model, v.trim, body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const manual = spec.refine && spec.refine.tx === "manual" && (step || "exact") === "exact" && !/manual|\d-speed/i.test(words);
  return (words || spec.title) + (manual ? " manual" : "");
}
// THE MARKET CHECK PANEL on a Buy card (Oct 2026): the SAME spec key and the SAME engine answer the card's
// line was read from, never a second free-text Market Check call. Returns the card's market (range, count,
// the sentence) and the engine's three representative sales from that one answer. When the cached card line
// and a fresh engine read of the same key disagree, the spec is recomputed and rewritten first, so the card
// and its panel always come from one result.
export async function panelOf(env, row, facts) {
  const spec = await specOf(env, row, facts);
  if (!spec) return null;
  let m = await listingMarket(env, row, facts);
  if (!m || m.kind === "pending") return { market: m || null, representative: null };
  const read = () => engineAnswer(spec.v, spec.generation, spec.title, env, (m.step || "exact") === "exact" ? spec.refine : null);
  let d = await read();
  // The same range AND the same count (a stored line a few hours old can trail a fresh read by a sale or two).
  const same = (a, b) => (a && a.kind === "range") === (b && b.kind === "range") && (!a || a.kind !== "range" || (a.low === b.low && a.high === b.high && (a.count || null) === (b.count || null)));
  const fresh = d && /^(result|thin|refusal)$/.test(String(d.tier)) ? marketOf(d) : null;
  if (d !== undefined && !same(m, fresh)) {
    await refreshSpec(env, spec);
    m = await listingMarket(env, row, facts);
    d = await read();
  }
  const rep = (d && d.representative) || {};
  // year/offWindow added (Oct 2026, lane-notes "NEEDED FROM LANE B"): Buy's own card renderer
  // (api/buy.js) needs these two fields to show the context-cards job's "a {year} car, a few years
  // outside the searched window" note the way Market Check/Sell already do - both fields already exist
  // on the engine's representative card (lib/onebox.js pickRepresentative), they were simply not on
  // this whitelist yet.
  const slim = c => c ? { date: c.date || null, mi: Number(c.mi) || null, price: Number(c.price) || null, platform: c.platform || null, platformSlug: c.platformSlug || null, url: c.url || null, image: c.image || null, year: c.year || null, offWindow: c.offWindow === true } : null;
  return { market: m, representative: rep.closest || rep.high || rep.low ? { closest: slim(rep.closest), high: slim(rep.high), low: slim(rep.low) } : null, engineAnswer: cardAnswerOf(d) };
}
// The ONLY fields lib/sellsForCard.js reads, lifted off the engine's own answer (Lane A, Oct 2026, one
// engine / one card job): never the whole `d` over the wire to a Buy card's drawer - its diagnostic
// payload (cards/rawPool/dedup/htMeta) is exactly what Lane B's e59 egress job stopped shipping for
// Market Check itself. A field the engine didn't set is left off, never defaulted.
function cardAnswerOf(d) {
  if (!d) return null;
  const out = {};
  for (const k of ["cluster", "poolN", "windowMonths", "bodyLine", "bodyLabel", "setAsideReasons", "setAsideCount", "readAt", "stale", "staleLine", "qualifyingTotal",
    // e63 (Sam's thin card): what the shared card draws on a thin answer, passed through from the engine
    "tier", "thinLine", "thinReason", "latestSaleLine", "samLine"]) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  if (Array.isArray(d.cards)) out.cards = d.cards.map(c => ({ price: c.price ?? null, date: c.date || null, mi: c.mi ?? null, title: c.title || null, image: c.image || null }));
  if (d.trend && Array.isArray(d.trend.quarters)) {
    out.trendQuarters = d.trend.quarters.map(q => ({ period: q.period, low: q.low ?? null, high: q.high ?? null, count: Number(q.count) || 0, thin: !!q.thin }));
  }
  return out;
}
// LIVE-BUY WARM (e49, Sam's item 14): the distinct resolved specs of every car live on Buy, warmed through the SAME
// path a Buy card reads (specOf -> specCore: this instance's memory, the stored row, else the engine, which writes the
// row), so no card sits "pending" after a deploy while a sweep runs. Called by task=warmLive (api/usageDashboard.js)
// from scripts/postDeployWarm.mjs before the golden cars and before any sweep or identity-count run. Archive-only,
// zero vendor spend. Idempotent: a spec already fresh costs one memory check; the caller repeats until done.
export async function warmLiveSpecs(env, opts = {}) {
  const t0 = Date.now(), budgetMs = Math.min(230000, Number(opts.budgetMs) || 200000), width = Math.max(1, Math.min(8, Number(opts.concurrency) || 6));
  const rows = (await liveRows(env, "id=gt.0")) || [];
  // THE RESOLVED LIST SURVIVES THE INSTANCE (Oct 15 2026): resolving ~2,000 titles costs 120 to 150s on a cold instance
  // and 2s on one that has seen them; a Vercel call lands on a cold instance often enough that the resolve was eating
  // more than half of every call's budget. The resolved specs are kept in one spec_market_cache row (LIVESPECS, per
  // engine version, six hours) and only titles not in it are resolved.
  const LIVESPECS_KEY = "LIVESPECS:v1:" + ENGINE_VERSION;
  const known = new Map(); let failedAt = {};
  try {
    // This version's row first; else the newest row of any version (a bump used to restart the resolve from nothing,
    // 80s a call for eight calls on e52). The mk keys carry the version, so entries are re-keyed to this one.
    let got = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(LIVESPECS_KEY)}&select=spec_key,market,computed_at`);
    let row = got && got[0];
    if (!(row && row.market && Array.isArray(row.market.specs) && row.market.specs.length)) {
      got = await supabaseSelect(env, `spec_market_cache?spec_key=like.${encodeURIComponent("LIVESPECS:v1:%")}&select=spec_key,market,computed_at&order=computed_at.desc&limit=1`);
      row = got && got[0];
    }
    if (row && row.market && Array.isArray(row.market.specs) && Date.now() - Date.parse(row.computed_at) < 6 * 3600e3) {
      const prev = String(row.spec_key).slice("LIVESPECS:v1:".length);
      for (const e of row.market.specs) if (e && e.mk) known.set(prev === ENGINE_VERSION ? e.mk : ENGINE_VERSION + e.mk.slice(prev.length), e.spec || null);
      if (prev === ENGINE_VERSION) failedAt = (row.market.failedAt && typeof row.market.failedAt === "object") ? row.market.failedAt : {};
    }
  } catch { /* the list is a convenience; resolving from scratch still works */ }
  // A read that did not come back is not retried for an hour (failedAt, kept with the list), so every call makes
  // progress on specs it has not tried instead of re-timing-out on the same slow listings first. shard=k/n (opts)
  // lets several calls, on several instances, warm different slices of the list at once.
  const FAIL_HOLD_MS = 60 * 60e3;
  const shard = opts.shard && /^\d+\/\d+$/.test(String(opts.shard)) ? String(opts.shard).split("/").map(Number) : null;
  const mkOf = (r, f) => ENGINE_VERSION + "|" + String(r.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim() + "|" + (r.year || "") + "|" + (f.body || "") + "|" + (f.gearbox || "");
  const specs = new Map(); let unresolved = 0, resolvedRows = 0, fromList = 0;
  const fresh = [];
  const take = (mk, sp) => { resolvedRows++; fresh.push({ mk, spec: sp && sp.key ? { title: sp.title, v: sp.v, generation: sp.generation, refine: sp.refine, key: sp.key } : null }); if (!sp || !sp.key) { unresolved++; return; } if (!specs.has(sp.key)) specs.set(sp.key, { spec: sp, n: 0 }); specs.get(sp.key).n++; };
  const todo = [];
  for (const r of rows) { const f = listingFacts(r); const mk = mkOf(r, f); if (known.has(mk)) { fromList++; take(mk, known.get(mk)); } else todo.push({ r, f, mk }); }
  for (let i = 0; i < todo.length; i += 12) {
    if (Date.now() - t0 > budgetMs * 0.4) break;   // the resolve never eats the budget: some warming always happens
    const batch = todo.slice(i, i + 12);
    const out = await Promise.all(batch.map(x => specOf(env, x.r, x.f).catch(() => null)));
    out.forEach((sp, j) => take(batch[j].mk, sp));
  }
  const resolveMs = Date.now() - t0;
  let list = [...specs.values()].sort((a, b) => b.n - a.n);   // the specs with the most live cars first
  // WARM ONLY THE SPECS WITH TRAFFIC (Sam, Oct 16 2026, egress decision 4): a live listing's spec is warmed only when
  // its make|model was searched on Buy, Market Check or Sell in the last opts.trafficDays days (analytics_events
  // search_run, props.vehicle_key, the same make|model key every product writes). The full list (about 1,950 specs,
  // 6 to 10 GB a warm) is warmed only when the traffic read itself fails, and the answer says so (traffic.source).
  const trafficDays = Number.isFinite(Number(opts.trafficDays)) ? Number(opts.trafficDays) : 14;
  const trafficInfo = { source: "analytics_events", days: trafficDays, keys: 0, specsAll: list.length, specsWarmed: list.length };
  if (trafficDays > 0) {
    try {
      const since = new Date(Date.now() - trafficDays * 864e5).toISOString();
      const ev = await supabaseSelectAll(env, `analytics_events?select=vk:props->>vehicle_key&name=eq.search_run&ts=gte.${encodeURIComponent(since)}&product=in.(buy,market_check,sell)`);
      if (ev == null) throw new Error("analytics_events unreadable");
      const keys = new Set(ev.map(e => String(e.vk || "").toLowerCase().trim()).filter(k => k && k !== "-" && k.includes("|")));
      trafficInfo.keys = keys.size;
      const keyOf = x => `${String(x.spec && x.spec.v && x.spec.v.make || "").toLowerCase()}|${String(x.spec && x.spec.v && x.spec.v.model || "").toLowerCase()}`;
      list = list.filter(x => keys.has(keyOf(x)));
      trafficInfo.specsWarmed = list.length;
    } catch (e) {
      trafficInfo.source = "unavailable, every spec warmed: " + String(e && e.message || e).slice(0, 80);
    }
  } else trafficInfo.source = "off (trafficDays=0), every spec warmed";
  if (shard && shard[1] > 1) list = list.filter((_, i) => i % shard[1] === (shard[0] % shard[1]));
  const held = k => failedAt[k] && (Date.now() - Date.parse(failedAt[k])) < FAIL_HOLD_MS;
  const epoch = await currentEpoch(env);
  const isFresh = k => { const h = specMem.get(k); return !!(h && h.core && h.core.engineVersion === ENGINE_VERSION && h.epoch === epoch && Date.now() - h.at < EFFECTIVE_TTL && sameUtcDay(h.at)); };
  await prefetchSpecs(env, list.map(x => x.spec.key)).catch(() => {});
  let warmed = 0, alreadyWarm = 0, failed = 0, notReached = 0, idx = 0, attempted = 0, readMs = 0, maxReadMs = 0, heldOut = 0;
  const failedSample = [], newlyFailed = {};
  const worker = async () => {
    while (idx < list.length) {
      const item = list[idx++];
      if (Date.now() - t0 > budgetMs) { notReached++; continue; }
      if (isFresh(item.spec.key)) { alreadyWarm++; continue; }
      if (held(item.spec.key)) { heldOut++; continue; }
      const r0 = Date.now(); attempted++;
      try { const core = await specCore(env, item.spec, false); if (core === undefined) { failed++; newlyFailed[item.spec.key] = new Date().toISOString(); if (failedSample.length < 5) failedSample.push({ title: item.spec.title, ms: Date.now() - r0 }); } else warmed++; }
      catch (e) { failed++; newlyFailed[item.spec.key] = new Date().toISOString(); if (failedSample.length < 5) failedSample.push({ title: item.spec.title, ms: Date.now() - r0, error: String(e && e.message || e).slice(0, 80) }); }
      const dt = Date.now() - r0; readMs += dt; if (dt > maxReadMs) maxReadMs = dt;
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  const keepFail = {}; for (const [k, t] of Object.entries(failedAt)) if (Date.now() - Date.parse(t) < FAIL_HOLD_MS) keepFail[k] = t;
  Object.assign(keepFail, newlyFailed);
  if (fresh.length || Object.keys(newlyFailed).length) persistCore(env, LIVESPECS_KEY, { v: "livespecs", engineVersion: ENGINE_VERSION, specs: fresh.length ? fresh : [...known.entries()].map(([mk, spec]) => ({ mk, spec })), failedAt: keepFail }).catch(() => {});
  const resolvedAll = resolvedRows >= rows.length;
  // done: every spec in this shard is warm or held (a held spec is reported, never silently counted as warm)
  return { liveRows: rows.length, traffic: trafficInfo, resolvedRows, fromList, unresolved, distinctSpecs: list.length, shard: shard ? shard.join("/") : null, alreadyWarm, warmed, failed, heldOut, notReached, attempted, avgReadMs: attempted ? Math.round(readMs / attempted) : null, maxReadMs, failedSample, resolveMs, ms: Date.now() - t0, done: resolvedAll && notReached === 0, engineVersion: ENGINE_VERSION };
}
// HELD LIVE SPECS (Oct 15 2026, Sam's coordinator): the live specs whose warm reads did not come back for a given engine
// version (the failedAt map kept with that version's LIVESPECS row), each with its title, spec key and the live listing
// ids that resolve to it, so Lane C can check them and the warm can be re-run on exactly these.
export async function heldLiveSpecs(env, version) {
  const key = "LIVESPECS:v1:" + (version || ENGINE_VERSION);
  const got = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=market,computed_at`);
  const row = got && got[0];
  if (!(row && row.market)) return { version: version || ENGINE_VERSION, found: false, held: [] };
  const failedAt = (row.market.failedAt && typeof row.market.failedAt === "object") ? row.market.failedAt : {};
  const byKey = new Map();
  for (const e of (row.market.specs || [])) if (e && e.spec && e.spec.key && failedAt[e.spec.key]) { if (!byKey.has(e.spec.key)) byKey.set(e.spec.key, { key: e.spec.key, title: e.spec.title, failedAt: failedAt[e.spec.key], mks: [], listingIds: [] }); byKey.get(e.spec.key).mks.push(e.mk); }
  const rows = (await liveRows(env, "id=gt.0")) || [];
  const mkOf = (r, f) => String(key.slice("LIVESPECS:v1:".length)) + "|" + String(r.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim() + "|" + (r.year || "") + "|" + (f.body || "") + "|" + (f.gearbox || "");
  const mkIndex = new Map();
  for (const r of rows) { const mk = mkOf(r, listingFacts(r)); if (!mkIndex.has(mk)) mkIndex.set(mk, []); mkIndex.get(mk).push({ id: r.id, source: r.source, url: r.url }); }
  for (const h of byKey.values()) for (const mk of h.mks) for (const x of (mkIndex.get(mk) || [])) h.listingIds.push(x);
  return { version: version || ENGINE_VERSION, found: true, computedAt: row.computed_at, heldCount: byKey.size, held: [...byKey.values()].map(h => ({ key: h.key, title: h.title, failedAt: h.failedAt, listings: h.listingIds })) };
}
// LIVE SPEC KEYS (speed job, stage 3, Oct 15 2026; read-only): how many distinct engine reads Buy's live listings
// need today, and how many they would need if listings that resolve to the same market shared one read, counted
// under the real key (specKeyFor) and under the key with one part dropped at a time. Uses the stored LIVESPECS row
// (no resolving, no engine read) so it costs one table read.
export async function liveSpecKeyCounts(env) {
  const key = "LIVESPECS:v1:" + ENGINE_VERSION;
  let got = await supabaseSelect(env, `spec_market_cache?spec_key=eq.${encodeURIComponent(key)}&select=spec_key,market,computed_at`);
  let row = got && got[0];
  if (!(row && row.market && Array.isArray(row.market.specs) && row.market.specs.length)) {
    got = await supabaseSelect(env, `spec_market_cache?spec_key=like.${encodeURIComponent("LIVESPECS:v1:%")}&select=spec_key,market,computed_at&order=computed_at.desc&limit=1`);
    row = got && got[0];
  }
  if (!(row && row.market && Array.isArray(row.market.specs))) return { found: false };
  const specs = row.market.specs.filter(e => e && e.spec && e.spec.key && e.spec.v);
  const parse = k => { try { return JSON.parse(k); } catch { return null; } };
  // key parts: [make, model, trim, year, genCode, bodyStyle, edition, variant, wheelbase, tx, rBody, rTrim, rVariant]
  const count = drop => { const set = new Set(); for (const e of specs) { const a = parse(e.spec.key); if (!a) continue; const b = a.slice(); for (const i of drop) b[i] = null; set.add(JSON.stringify(b)); } return set.size; };
  const listings = specs.length;
  const full = count([]);
  const readsPerSpec = {}; for (const e of specs) { const n = e.spec.refine ? 2 : 1; readsPerSpec[n] = (readsPerSpec[n] || 0) + 1; }
  const gearboxed = specs.filter(e => e.spec.refine).length;
  return { found: true, version: String(row.spec_key).slice("LIVESPECS:v1:".length), computedAt: row.computed_at, listings, distinctKeys: full,
    withGearboxRefine: gearboxed, engineReadsToday: full + gearboxed,   // a gearbox-refined spec walks two steps (exact + any_gearbox)
    ifShared: { dropGearbox: count([9]), dropYear: count([3]), dropYearAndGearbox: count([3, 9]), dropBody: count([5]), dropYearBodyGearbox: count([3, 5, 9]), makeModelTrimGenOnly: count([3, 5, 6, 7, 8, 9, 10, 11, 12]) } };
}
export async function listingMarket(env, row, facts, opts = {}) {
  // the clock starts here (buybound): the resolver's own lookup (up to 12 s under the e60 contract) counts inside the
  // same 20 s bound as the market read, so a card is never more than ONEBOX_DEADLINE_MS from its answer or its
  // still-reading line
  const budget = Number(process.env.ONEBOX_DEADLINE_MS || 20000), deadlineAt = Number(opts.deadlineAt) > 0 ? Number(opts.deadlineAt) : Date.now() + budget;   // e61: a caller may pass its own request clock
  const remaining = () => Math.max(250, deadlineAt - Date.now());
  const within = p => { let timer; const expiry = new Promise(res => { timer = setTimeout(() => res(undefined), remaining()); }); return Promise.race([p, expiry]).finally(() => clearTimeout(timer)); };
  try {
    const specP = specOf(env, row, facts, opts.vehicle || null);
    const spec = opts.noBlock ? await specP : await within(specP);
    if (spec === undefined) return stillReadingMarket();   // the resolver did not answer in time
    if (!spec) return null;
    // WHOLE-PATH BOUND (buybound, Sam's Buy no-answer fix, Oct 18 2026): a card's market read gets the SAME bound Market
    // Check's page has (ONEBOX_DEADLINE_MS, 20 s). A blocking read that runs past it returns the engine's still-reading
    // answer for a card (below) while the compute keeps running and fills the stored row, so the page's retry is a hit;
    // a read of a key whose compute is already running returns that answer at once, never a second wait. Before this
    // a cold card waited for the engine's full compute (25 s and a retry) with no bound on the Buy request at all.
    let core;
    if (opts.noBlock) core = await specCore(env, spec, true);
    else if (filling.has(spec.key)) core = undefined;
    else {
      const p = specCore(env, spec, false);
      filling.add(spec.key); p.catch(() => {}).finally(() => filling.delete(spec.key));
      core = await within(p);
    }
    if (core === undefined) return stillReadingMarket();   // not cached / didn't come back in time: never drawn as "no line", never a number
    if (!core) return null;
    const m = { kind: core.kind, low: core.low, high: core.high, count: core.count, window: core.window, spread: core.spread, family: core.family, familyOne: core.familyOne || null, refinedNote: core.refinedNote || null, short: core.short || core.familyBare || core.family, recent: core.recent, top: core.top, take: core.take, span: core.span || null, step: core.step || "exact", referenceFigure: core.referenceFigure || null, referenceFigureReason: core.referenceFigureReason || null, counts: core.counts || null,
      // fallbackRung/rungLabel/siblingName (Round 5 Lane B job, Oct 2026, Part 2): same pass-through
      // discipline as every other field on this line - Buy/Tasks states the identical rung/scope
      // label Market Check and Sell see for the same car.
      fallbackRung: core.fallbackRung || null, rungLabel: core.rungLabel || null, siblingName: core.siblingName || null,
      // e61: exact lowest and highest sale and the wide-spread flag, the same values Market Check and Sell carry.
      lowestSaleN: core.lowestSaleN ?? null, highestSaleN: core.highestSaleN ?? null, wideSpread: core.wideSpread === true };
    // A motorcycle's group is named as motorcycles, never "R90S cars" (the engine's noun is for cars).
    if (isMotorcycle(row)) for (const k of ["family", "short"]) if (m[k]) m[k] = String(m[k]).replace(/\bcars$/i, "motorcycles");
    m.bodyScoped = core.bodyScoped === true || core.bodyScoped === false ? core.bodyScoped : null;
    m.salesNoun = salesNoun(m);
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
    // Market Check: the One Box question for this exact spec, prefilled. Written from the RESOLVED car (year,
    // make, model, trim, body), never the listing's raw title: a title like "3.6L-Powered 1988 Porsche 911
    // Carrera Cabriolet G50" re-read as free text landed on a broad era band with no range, while the card
    // read the resolved 3.2 Carrera Cabriolet.
    m.query = specQuery(spec, core.step);
    return m;
  } catch (e) { console.error("listingMarket:", e && e.message); return stillReadingMarket(); }
}
// THE STILL-READING ANSWER FOR A CARD (buybound; the shape every Buy and Tasks surface draws, recorded in lane-notes for
// Lane C): kind "pending" as before, plus stillReading, the line, and the retry the engine asks for. No page computes
// a timeout or a retry rule of its own; it draws this.
export function stillReadingMarket() {
  return { kind: "pending", stillReading: true, line: "Sam is still reading the sales for this one.", retry: true, retryAfterMs: 15000 };
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
// Sam's decision (Oct 15 2026): the market is the United States AND Canada; a Canadian listing is never "abroad".
export function isAbroadRow(r) { const cc = String((r && r.country) || "").toUpperCase(); return !!cc && cc !== "US" && cc !== "CA"; }
export async function liveForFamily(env, vehicle, generation, filters, limit = 3, band = null) {
  const v = (await resolveForBuy([vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "), env).catch(() => null)) || { ...vehicle };
  const f = emptyFilters();
  if (vehicle.bodyStyle) f.bodies = [String(vehicle.bodyStyle).toLowerCase()];
  // The resolved car's own generation code first (e46, "E46 M3": the panel counted every M3 generation, Buy the E46s only);
  // the year's generation only when the caller passed none.
  if (vehicle.genCode) f.gens = [String(vehicle.genCode)];
  else if (generation && generation.code) f.gens = [generation.code];
  // YEAR WINDOW (job 3, trim-fence sweep, Oct 2026, replaces the old "drop the year whenever no trim
  // was given" guard): read the window straight off the SAME buildSpec the sales pool itself uses -
  // the one shared window, never a second derivation. The old guard dropped the year filter entirely
  // for any trim-less query ("!vehicle.trim" alone set oneCarGen, regardless of how wide the matched
  // generation actually spans), so a bare "2025 Porsche 911 Cabriolet" search's live panel was
  // effectively UNBOUNDED by year while the sales pool itself was bound to the current generation -
  // confirmed live, a 2022 Porsche 911 Turbo S Cabriolet (a genuinely different generation AND trim)
  // showed as "live right now" comparable to a search for the current car. spec.yearMin/yearMax is
  // null only when buildSpec itself found nothing to bind to (a genuinely unbounded nameplate), the
  // same honest case the sales pool is in too.
  const spec = buildSpec(vehicle, generation, [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.bodyStyle].filter(Boolean).join(" "));
  // The panel's years are the years the sales read landed on (e45, Sam's item 7), the same window searchLive gives Buy
  // and the Task preview for the typed year; a year-less query keeps the spec's own bound as before.
  const yw = Number(vehicle.year) ? await liveYearWindow(env, { ...v, year: vehicle.year }) : null;
  if (yw) { f.yearMin = yw.yearMin; f.yearMax = yw.yearMax; }
  else if (spec.yearMin != null || spec.yearMax != null) { f.yearMin = spec.yearMin; f.yearMax = spec.yearMax; }
  const yearless = { ...v, year: (f.yearMin != null || f.yearMax != null) ? null : v.year };
  const { rows } = await searchLive(env, yearless, f, "");
  // The same cars Buy counts: confirmed matches, abroad left out (isAbroadRow), never a cap on the total.
  // FENCED (job 3): every title/year-based membership rule the sales pool applies (trim/model-line
  // scope, modified/replica/conversion markers, performance-badge, body) via the SAME shared function,
  // titleFenceReason - a live listing that would never qualify as a sold comp must never show as a
  // "live right now" comparable either. Confirmed live before this fix: a "2005 BMW M3 Coupe" search's
  // panel showed a "2004 BMW 330Ci ZHP Coupe" (not an M3 - no badge check existed here at all) and a
  // "... M3 Competition Package Coupe Conversion" (a conversion, never caught).
  const fenceRow = x => ({ raw_title: x.r.listing_title || x.r.title || "", rtitle: x.r.listing_title || x.r.title || "", year: x.r.year || null, mods: x.r.modifications || null, transmission: x.r.transmission || null });
  const sure = rows.filter(x => !x.unknown.length && !isAbroadRow(x.r) && titleFenceReason(fenceRow(x), spec) === null);
  // POSITION field + counts (job 3): computed here, in the engine, over the FULL fenced match set -
  // not just the capped `limit` shown as cards - so the intro sentence's counts are never short of
  // what the cards themselves imply. placingFor is the one shared "inside/below/above the range"
  // function the headline's own live-bid placement already uses (api/buySearch.js); null when there
  // is no band to measure against (the caller passed none) or the row carries no usable USD figure.
  const positionOf = r => band ? placingFor(r.current_bid_usd != null ? Math.round(Number(r.current_bid_usd)) : null, band) : null;
  const positions = band ? { inside: 0, below: 0, above: 0, unknown: 0 } : null;
  if (positions) for (const x of sure) {
    const p = positionOf(x.r);
    if (p === "inside the range") positions.inside++;
    else if (p === "below the range") positions.below++;
    else if (p === "above the range") positions.above++;
    else positions.unknown++;
  }
  return { rows: sure.slice(0, limit).map(x => ({ ...x.r, position: positionOf(x.r) })), total: sure.length, positions, yearWindow: yw || (f.yearMin != null || f.yearMax != null ? { yearMin: f.yearMin, yearMax: f.yearMax, basis: "spec bound" } : null) };
}

// Empty state: the searched family's own market line (same engine path as a card's).
export async function familyMarket(env, v, f, opts = {}) {
  // opts.noBlock (e57, for the Buy search header): never wait for the engine; a market with no stored row comes back
  // { kind: "pending" } at once and the page fetches the line later, the same path the per-card markets already use,
  // so a slow archive read can never hold the whole Buy result (the engine read behind a cold header runs up to two
  // 25-second attempts in engineAnswer).
  if (!v || !v.model) return null;
  // ONE RESOLVER (Oct 2026): v is already resolved (every caller passes resolveForBuy's or
  // resolveVehicle's own output) - pass it straight through as opts.vehicle so specOf never
  // re-stringifies it into "[year, make, model, trim].join(' ')" and re-parses that lossy text
  // through resolveForBuy a second time. listing_title is kept only as the cache-key/display title.
  const row = { listing_title: [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "), year: v.year || (v.yearSpan ? v.yearSpan[0] : null) };
  return listingMarket(env, row, { body: f.bodies.length === 1 ? f.bodies[0] : null, gearbox: f.gearbox, gearboxLabel: f.gearboxLabel }, { vehicle: v, noBlock: !!opts.noBlock });
}

// Detail view facts for one live listing: its own family's sold range and count, where its miles sit
// against the sold cars like it, what separated the stronger sales (the engine's Sam's Take pattern,
// never a cause), all from finished sales. Never a verdict on the bid, a repair cost or a condition claim.
export async function listingDetail(env, row) {
  const facts = listingFacts(row);
  const title = String(row.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
  // The SAME spec the card line reads (specOf), so the miles note and Sam's Take come from the one answer.
  const spec = await specOf(env, row, facts), v = spec && spec.v;
  let market = null, miles = null, moved = null, d = null;
  if (v && v.model) {
    d = await engineAnswer(v, spec.generation, spec.title, env, spec.refine);
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
