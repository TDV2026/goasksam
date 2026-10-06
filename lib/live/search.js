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
import { supabaseSelect } from "../_supabase.js";
import { projectFlagReason } from "../_classify.js";

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
export function emptyFilters() { return { bodies: [], colours: [], notColours: [], gearbox: null, gearboxLabel: null, miMax: null, miMin: null, priceMax: null, priceMin: null, countries: [], houses: [], gens: [], yearMin: null, yearMax: null }; }
// Returns { text: words left for the car resolver, filters: every understood constraint }.
export function parseQuery(raw) {
  let t = " " + String(raw || "").replace(/[–—]/g, "-").replace(/\s+/g, " ") + " ";
  const f = emptyFilters();
  const take = (re, fn) => { t = t.replace(re, (...a) => { fn(...a); return " "; }); };
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
  // Years: "2005 to 2008", "2005-2008", "2005+", "after 2005", "before 1973". A single year goes to the resolver.
  take(/\b((?:18|19|20)\d{2})\s*(?:to|-|through|thru)\s*((?:18|19|20)\d{2})\b/ig, (m, a, b) => { f.yearMin = Math.min(+a, +b); f.yearMax = Math.max(+a, +b); });
  take(/\b((?:18|19|20)\d{2})\s*\+/ig, (m, a) => { f.yearMin = +a; });
  take(/\b(?:after|newer than|since)\s*((?:18|19|20)\d{2})\b/ig, (m, a) => { f.yearMin = +a; });
  take(/\b(?:before|older than|pre)\s*((?:18|19|20)\d{2})\b/ig, (m, a) => { f.yearMax = +a; });
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
  t = t.replace(/\b(or|and|for sale|live|auctions?|looking for|i want|i'?m after|find me|show me|any|a|an|the|with|cars?|please|one)\b/ig, " ");
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
  // A body word the resolver filed as the trim ("Targa") is a body, not a trim: never "Targa Targas".
  if (v.trim) for (const b of BODIES) if (BODY_RE[b].test(v.trim)) { v.trim = v.trim.replace(new RegExp(BODY_RE[b].source, "ig"), " ").replace(/\s+/g, " ").trim() || null; if (!v.bodyStyle) v.bodyStyle = b; }
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
  // Miles: the mileage field, then the title ("10k-Mile"), then the description ("shows 12,345 miles").
  let miles = Number(r.mileage) > 0 ? Number(r.mileage) : null, milesSrc = miles ? "field" : null;
  if (!miles) { const m = /\b([\d][\d,.]*)\s*(k)?[- ]mile/i.exec(title); if (m) { miles = Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)); milesSrc = "title"; } }
  if (!miles && desc) { const m = /\b(?:shows|showing|indicates|displays|reads|has covered|covered)\s+(?:just\s+|only\s+|approximately\s+|roughly\s+|under\s+)?([\d][\d,]{1,7})\s*(?:miles|mi)\b/i.exec(desc); if (m) { miles = Number(m[1].replace(/,/g, "")); milesSrc = "description"; } }
  // Body: the title first (BaT files a Targa as a coupe or convertible in its field), then the field.
  let body = null;
  for (const b of BODIES) if (BODY_RE[b].test(title)) { body = b; break; }
  if (!body) for (const b of BODIES) if (BODY_RE[b].test(r.body || "")) { body = b; break; }
  const gtxt = (r.transmission || "") + " " + title;
  const gearbox = /\b(pdk|automatic|tiptronic|dct|dsg|smg|e-?gear|f1)\b/i.test(gtxt) ? "auto" : (/\b(manual|\d-speed|stick)\b/i.test(gtxt) ? "manual" : null);
  const gearboxLabel = gearbox === "auto" ? (/\bpdk\b/i.test(gtxt) ? "PDK" : /tiptronic/i.test(gtxt) ? "Tiptronic" : "Automatic") : gearbox === "manual" ? "Manual" : null;
  return { colour, colourSrc, miles, milesSrc, body, gearbox, gearboxLabel };
}

// ---------------------------------------------------------------- 4. search
function bodyMatches(want, have) {
  if (!want.length) return true;
  if (!have) return null;
  if (want.includes(have)) return true;
  if (OPEN.includes(have) && want.some(w => OPEN.includes(w))) return true;
  return false;
}
const LIVE_SEL = "id,source,source_listing_id,url,listing_title,make,model,year,vin_norm,mileage,body,transmission,location,country,currency,current_bid,current_bid_usd,end_time,photo_url,last_seen";
const LIVE_SEL_EXTRA = ",exterior_color,std_color,description,bid_at";
export async function liveRows(env, filterQs) {
  let rows = await supabaseSelect(env, `live_listings?status=eq.live&${filterQs}&select=${LIVE_SEL}${LIVE_SEL_EXTRA}&order=end_time.asc.nullslast&limit=1500`);
  if (rows == null) rows = (await supabaseSelect(env, `live_listings?status=eq.live&${filterQs}&select=${LIVE_SEL}&order=end_time.asc.nullslast&limit=1500`)) || [];
  return rows;
}
// Every live match for the car + filters. "sure" = every stated filter confirmed; "maybe" = a stated
// filter the listing doesn't state (shown after, labelled). Facets are counted over the matches.
export async function searchLive(env, v, f0, text) {
  let f = f0;
  if (!v || !v.make) return { rows: [], facets: {} };
  const rows = await liveRows(env, `make=ilike.${encodeURIComponent(String(v.make).split(/[\s-]/)[0] + "*")}`);
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
  for (const r of rows) {
    if (r.end_time && Date.parse(r.end_time) < now - 3600e3) continue;
    const title = r.listing_title || "", st = squash(title + " " + (r.model || ""));
    const toks = tokSet(title + " " + (r.model || ""));
    const hasTok = w => toks.has(String(w).toLowerCase()) || [...toks].some(t => t.replace(/[^a-z0-9]/g, "") === squash(w));
    if (modelTok && !hasTok(parent) && !(gens.length && gens.some(g => hasTok(g) || hasTok(String(g).split(".")[0])))) continue;
    if (spec) {
      const why = qualifyReason({ price: Math.max(2600, Number(r.current_bid_usd) || 0), currency: "USD", image: r.photo_url || "live", raw_title: title, rtitle: title, year: r.year, mileage: r.mileage, body: r.body, transmission: r.transmission, mods: null, source: r.source }, spec);
      if (why && /replica|kit car|tribute|memorabilia|part|restomod|race|other cobra|different cobra/i.test(why)) continue;   // a project car shows, flagged on its card
    }
    if (restomodReason(title, v.make, parent)) continue;   // Singer / reimagined / restomod: never a comp, never this car
    const gen = parent ? genFor(v.make, parent, r.year, title) : null;
    const facts = listingFacts(r);
    // A stated filter the listing CONTRADICTS removes it.
    if (gens.length && !(gen && gens.includes(gen.code))) continue;
    if (f.yearMin && r.year && r.year < f.yearMin) continue;
    if (f.yearMax && r.year && r.year > f.yearMax) continue;
    if (v.year && !gens.length && !f.yearMin && !f.yearMax && r.year && Math.abs(r.year - Number(v.year)) > 2) continue;
    if (bodyMatches(f.bodies, facts.body) === false) continue;
    if (f.gearbox && facts.gearbox && facts.gearbox !== f.gearbox) continue;
    if (trimTok && !st.includes(trimTok)) continue;
    if (f.priceMax && r.current_bid_usd && r.current_bid_usd > f.priceMax) continue;
    if (f.priceMin && r.current_bid_usd && r.current_bid_usd < f.priceMin) continue;
    if (f.miMax && facts.miles && facts.miles > f.miMax) continue;
    if (f.miMin && facts.miles && facts.miles < f.miMin) continue;
    if (f.colours.length && facts.colour && !f.colours.includes(facts.colour)) continue;
    if (f.notColours.length && facts.colour && f.notColours.includes(facts.colour)) continue;
    if (f.countries.length && !f.countries.includes(String(r.country || "").toUpperCase())) continue;
    if (f.houses.length && !f.houses.includes(r.source)) continue;
    const unknown = [];
    if ((f.colours.length || f.notColours.length) && !facts.colour) unknown.push("colour");
    if ((f.miMax || f.miMin) && !facts.miles) unknown.push("miles");
    if (f.bodies.length && !facts.body) unknown.push("body");
    if (f.gearbox && !facts.gearbox) unknown.push("gearbox");
    // Closeness: exact trim (or, with none asked, the base car), then year distance, then ending soonest.
    const exactTrim = trimTok ? 1 : (OTHER_TRIMS_RE.test(title) ? 0 : 1);
    const targetYear = v.year ? Number(v.year) : (f.yearMin && f.yearMax ? (f.yearMin + f.yearMax) / 2 : null);
    const yearDist = targetYear && r.year ? Math.abs(r.year - targetYear) : 0;
    out.push({ r, facts, gen, unknown, exactTrim, yearDist });
  }
  out.sort((a, b) => (a.unknown.length ? 1 : 0) - (b.unknown.length ? 1 : 0) || b.exactTrim - a.exactTrim || a.yearDist - b.yearDist || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  return { rows: out, facets: facetsOf(out) };
}
function facetsOf(list) {
  const count = fn => { const m = new Map(); for (const x of list) { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n })); };
  return { generation: count(x => x.gen && x.gen.code), body: count(x => x.facts.body), colour: count(x => x.facts.colour), gearbox: count(x => x.facts.gearbox), house: count(x => x.r.source), country: count(x => String(x.r.country || "").toUpperCase() || null) };
}

// ---------------------------------------------------------------- 5. each listing's OWN family + market line
const rangeCache = new Map();
async function engineAnswer(vehicle, generation, text, env, refine) {
  const key = JSON.stringify([vehicle.make, vehicle.model, vehicle.trim, generation && generation.code, vehicle.bodyStyle, refine && refine.tx]);
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.d;
  const run = asked => Promise.race([runOneBox(vehicle, generation, text, { ...env, exactSale: null, asked }, refine || null), new Promise((_, rej) => setTimeout(() => rej(new Error("deadline")), 15000))]);
  let d = null;
  try { d = await run(0); if (d && /_choice$/.test(String(d.tier || ""))) d = await run(2); } catch { d = null; }
  if (d && /_choice$/.test(String(d.tier || ""))) d = null;
  rangeCache.set(key, { at: Date.now(), d });
  if (rangeCache.size > 400) rangeCache.delete(rangeCache.keys().next().value);
  return d;
}
const marketWin = d => /twelve|12 months/.test((d && d.windowLabel) || "") ? "the past year" : (d && d.tier === "thin") ? "the past three years" : "the past two years";
export function marketOf(d) {
  if (!d) return null;
  // The engine's refusal still carries the real sales it read (thin: too few for a range; varied: too
  // spread out). Count THOSE cards, the same pool the miles note is built from, never a silent nothing.
  if (d.tier === "refusal" && (d.cards || []).length) return { kind: "count", count: d.cards.length, window: marketWin(d), spread: !!(d.refusal && d.refusal.kind === "varied") };
  if (d.tier === "result" && Array.isArray(d.cluster)) return { kind: "range", low: d.cluster[0], high: d.cluster[1], count: d.poolN || null, window: marketWin(d) };
  const n = d.tier === "thin" ? ((d.cards || []).length || ((d.thin && d.thin.receipts) || []).length) : (d.poolN || 0);
  // A full result with no cluster had sales, just too spread out to mark one range (rule 24).
  return n > 0 ? { kind: "count", count: n, window: marketWin(d), spread: d.tier === "result" } : null;
}
const BODY_PLURAL = { coupe: "coupes", cabriolet: "Cabriolets", convertible: "convertibles", roadster: "roadsters", targa: "Targas", sedan: "sedans", spider: "Spiders", spyder: "Spyders", speedster: "Speedsters", wagon: "wagons" };
// The listing resolved to its own family (generation, trim, body, gearbox); One Box's answer for it.
export async function listingMarket(env, row, facts) {
  try {
    const title = String(row.listing_title || "").replace(/^\s*[\d,.]+\s*k?\s*-?\s*mile[s]?\b/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
    const v = await resolveForBuy(title, env);
    if (!v || !v.model) return null;
    if (row.year) v.year = row.year;
    if (facts.body && !v.bodyStyle) v.bodyStyle = facts.body;
    const generation = await listingGeneration(v, title, env);
    const refine = facts.gearbox ? { tx: facts.gearbox, label: facts.gearboxLabel || facts.gearbox } : null;
    const d = await engineAnswer(v, generation, title, env, refine);
    const m = marketOf(d);
    if (!m) return null;
    const rc = (d && d.resolvedCar) || v;
    const gc = (generation && generation.code) || rc.genCode || null, mdl = String(rc.model || ""), trm = rc.trim ? String(rc.trim) : "";
    const showModel = !(gc && squash(mdl) === "911") && !squash(trm).includes(squash(mdl));
    const head = [gc && !squash(mdl).includes(squash(gc)) ? (/^[a-z]\d/i.test(gc) ? String(gc).toUpperCase() : gc) : null, showModel ? mdl : null, trm ? trm.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, (m0, a, b) => a + b.toLowerCase()) : null].filter(Boolean).join(" ") || mdl;
    const bw = rc.bodyStyle ? BODY_PLURAL[String(rc.bodyStyle).toLowerCase()] : "";
    const fam = bw && !new RegExp(bw.replace(/s$/, ""), "i").test(head) ? head + " " + bw : (/[a-z]s$/.test(head) ? head : (/\d$/.test(head) ? head + "s" : (/(^|\s)[A-Z]{1,4}$/.test(head) ? head + " cars" : head + "s")));
    m.family = (refine && d && d.refined ? (refine.tx === "manual" ? "manual " : String(refine.label) + " ") : "") + fam;
    // Where this car's miles sit among the SAME sold cards the line counts (only when that is the pool).
    const soldMi = ((d && d.cards) || []).map(c => Number(c.mi)).filter(x => x > 0);
    if (facts.miles && soldMi.length >= 8 && soldMi.length === m.count) m.miles = { miles: facts.miles, soldN: soldMi.length, fewer: soldMi.filter(x => x < facts.miles).length };
    // Market Check: the One Box question for this exact spec, prefilled.
    m.query = [title, facts.gearbox === "manual" && !/manual|\d-speed/i.test(title) ? "manual" : ""].filter(Boolean).join(" ").trim();
    return m;
  } catch (e) { console.error("listingMarket:", e && e.message); return null; }
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
  else noun = /[a-z]s$/.test(head) ? head : (/\d$/.test(head) ? head + "s" : (/(^|\s)[A-Z]{1,4}$/.test(head) ? head + " cars" : head + "s"));
  if (!/^\d/.test(noun) && v.make && !/^(911|cobra)$/i.test(model)) noun = noun;
  return noun;
}

// ---------------------------------------------------------------- One Box live panel (same contract as before)
export async function liveForFamily(env, vehicle, generation, filters, limit = 3) {
  const v = (await resolveForBuy([vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "), env).catch(() => null)) || { ...vehicle };
  const f = emptyFilters();
  if (vehicle.bodyStyle) f.bodies = [String(vehicle.bodyStyle).toLowerCase()];
  if (generation && generation.code) f.gens = [generation.code];
  const yearless = { ...v, year: (generation && generation.code) || v.genCode ? null : v.year };
  const { rows } = await searchLive(env, yearless, f, "");
  const sure = rows.filter(x => !x.unknown.length);
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
const ENGINE_SWAP_RE = /\bengine[-\s]?swap(?:ped)?\b|\bswapped\b|\bre-?powered\b|\b(?:ls[0-9]?x?|lsx|coyote|[12]jz|k-?series|hemi)[-\s]?(?:swap(?:ped)?|powered|conversion)\b/i;
const EX_WORKS_RE = /\bex[-\s]?works\b|\bworks (?:team |rally |race )?car\b|\bex[-\s]?factory team\b/i;
const MODIFIED_RE = /\bmodified\b|\bmodded\b|\bwide-?body\b|\bbody ?kit\b|\bbagged\b|\bair ride\b|\blift(?:ed| kit)\b|\bstroker\b|\bbackdate[ds]?\b|\boutlaw\b|\bresto-?mod\b|\bbuilt engine\b|\btwin-?turbo conversion\b/i;
export function cardFlag(r) {
  const title = String(r.listing_title || ""), desc = String(r.description || "");
  if (ENGINE_SWAP_RE.test(title)) return { kind: "engine_swap", line: "Engine swapped, so Sam sets it aside." };
  if (EX_WORKS_RE.test(title)) return { kind: "ex_works", line: "Ex-works car, trades on its history." };
  if (projectFlagReason(title, desc || null)) return { kind: "project", line: "Project car." };
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
