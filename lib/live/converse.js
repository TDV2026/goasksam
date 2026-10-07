// The /buy conversation (Lane C, Oct 2026). ZERO OldCarsData. Stateless: the client sends the whole
// conversation state each turn; this returns the next step. Sam asks only about what is missing AND
// would actually narrow the search, one question at a time, at most three, in the order generation,
// mileage, budget, location. Every reply: what was understood (one line), any market part answered
// from sales, then cars. Never a dead end, never a verdict on a bid, never a prediction.
import { parseQuery, emptyFilters, gensNamed, resolveForBuy, searchLive, listingMarket, familyMarket, nounFor, genFor, genLabel, COUNTRY_NAME } from "./search.js";
import { zipCoord, listingCoord, milesBetween, nearestPlace, placeFromText, stateCode, cityOnly } from "./geo.js";
import { CURATED_GENERATIONS } from "../generations.js";

const OUT_OF_SCOPE = /\b(good |great |solid |smart )?investment\b|\bappreciat\w*|\bwill (?:it|they|this|that) (?:be )?(?:worth|go up|appreciate|hold)|\bfuture value\b|\bgo(?:ing)? up in value\b|\bshould i buy\b|\bworth buying\b|\bhold (?:its|their) value\b|\bis (?:it|this|that) a good buy\b|\bwhat will (?:it|they|this) be worth\b/i;
const VALUE = /\b(good value|great value|best value|value for money|a deal|good deal|great deal|deals?|cheap(?:est)?|bargains?|steals?|undervalued|under-?priced|bang for (?:the|my) buck)\b/i;
const ENDING_TODAY = /\b(ending|ends|closing|finishing) (?:today|soon|tonight|in the next (?:day|24 hours))\b|\bending today\b/i;
const NEAR = /\b(?:within|in)\s+(\d{1,4})\s*(?:miles?|mi)\s+(?:of|from)\s+(?:zip\s*)?([0-9]{5}|[A-Za-z .'-]+,\s*[A-Za-z]{2,})|\b(?:near|close to|around)\s+(me|zip\s*\d{5}|\d{5}|[A-Za-z .'-]+,\s*[A-Za-z]{2,})/i;
const NONSENSE_CHIPS = ["a black manual BMW M3", "Porsches under $50k", "anything ending today"];
const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
const num = n => Math.round(Number(n)).toLocaleString("en-US");
const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---- turn the words (all messages so far + typed answers) into state ----
function readIntent(text) {
  const t = String(text || "");
  const near = NEAR.exec(t);
  let geo = null;
  if (near) {
    const radius = near[1] ? Number(near[1]) : 50;
    const place = near[2] || near[3] || "";
    const zip = (/\d{5}/.exec(place) || [])[0] || null;
    geo = { radius, zip, place: zip ? null : (/^me$/i.test(place.trim()) ? null : place.trim()), needZip: /^me$/i.test(place.trim()) };
  }
  return { outOfScope: OUT_OF_SCOPE.test(t), value: VALUE.test(t), endingToday: ENDING_TODAY.test(t), geo,
    clean: t.replace(OUT_OF_SCOPE, " ").replace(VALUE, " ").replace(ENDING_TODAY, " ").replace(NEAR, " ").replace(/\b(is|are|a|an|that'?s|which|what|can i get|could i get|for|me|find|show|get|i|want|need|looking|good|any|anything|all)\b/ig, " ").replace(/\s+/g, " ").trim() };
}
function mergeFilters(base, add) {
  const f = { ...emptyFilters(), ...(base || {}) };
  for (const k of ["bodies", "colours", "notColours", "countries", "houses", "gens"]) f[k] = [...new Set([...(f[k] || []), ...((add && add[k]) || [])])];
  for (const k of ["kind", "gearbox", "gearboxLabel", "miMax", "miMin", "priceMax", "priceMin", "yearMin", "yearMax"]) if (add && add[k] != null) f[k] = add[k];
  return f;
}

// ---- questions: one sentence, plain inline options, "any" and "just show me" always available ----
function genQuestion(v, matches) {
  const parent = v.parentModel || v.model; if (!parent) return null;
  const counts = new Map();
  for (const x of matches) if (x.gen) counts.set(x.gen.code, (counts.get(x.gen.code) || 0) + 1);
  if (counts.size >= 2) {
    const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code]) => code)
      .sort((a, b) => { const ya = (CURATED_GENERATIONS.find(g => g.code === a) || {}).yearStart || 0, yb = (CURATED_GENERATIONS.find(g => g.code === b) || {}).yearStart || 0; return ya - yb; });
    return { key: "generation", prompt: "Which generation?", options: opts.map(code => ({ label: genLabel(code), value: code })) };
  }
  return null;
}
function bodyQuestion(matches) {
  const bodies = new Map();
  for (const x of matches) if (x.facts.body) bodies.set(x.facts.body, (bodies.get(x.facts.body) || 0) + 1);
  if (bodies.size >= 2) {
    const B = { coupe: "coupe", cabriolet: "cabriolet", convertible: "convertible", targa: "Targa", roadster: "roadster", spyder: "Spyder", spider: "Spider", speedster: "Speedster", sedan: "sedan", wagon: "wagon", suv: "SUV", hatchback: "hatchback" };
    return { key: "body", prompt: "Which body?", options: [...bodies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b]) => ({ label: B[b] || b, value: b })) };
  }
  return null;
}
function milesQuestion(matches) {
  const known = matches.filter(x => x.facts.miles).map(x => x.facts.miles);
  if (known.length < 6) return null;
  const caps = [10000, 20000, 30000, 50000, 75000, 100000].map(c => ({ c, n: known.filter(m => m <= c).length })).filter(x => x.n > 0 && x.n < known.length);
  if (caps.length < 2) return null;
  const pick = caps.length > 3 ? [caps[0], caps[Math.floor(caps.length / 2)], caps[caps.length - 1]] : caps;
  return { key: "mileage", prompt: "How many miles, at most?", options: [...new Map(pick.map(x => [x.c, x])).values()].map(x => ({ label: "under " + num(x.c), value: String(x.c) })) };
}
function budgetQuestion(matches) {
  const bids = matches.map(x => Number(x.r.current_bid_usd)).filter(b => b > 0).sort((a, b) => a - b);
  if (bids.length < 6) return null;
  const nice = n => { const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.ceil(n / (p * 5)) * p * 5; };
  const qs = [0.3, 0.6, 0.85].map(q => nice(bids[Math.min(bids.length - 1, Math.floor(q * bids.length))]));
  const uniq = [...new Set(qs)].filter(c => { const n = bids.filter(b => b <= c).length; return n > 0 && n < bids.length; });
  if (uniq.length < 2) return null;
  return { key: "budget", prompt: "What's your budget?", options: uniq.map(c => ({ label: "under " + usd(c), value: String(c) })) };
}
// Location is worth asking only when the live cars span more than one region.
const REGION = { CT: "NE", ME: "NE", MA: "NE", NH: "NE", RI: "NE", VT: "NE", NJ: "NE", NY: "NE", PA: "NE", IL: "MW", IN: "MW", MI: "MW", OH: "MW", WI: "MW", IA: "MW", KS: "MW", MN: "MW", MO: "MW", NE: "MW", ND: "MW", SD: "MW", DE: "S", FL: "S", GA: "S", MD: "S", NC: "S", SC: "S", VA: "S", DC: "S", WV: "S", AL: "S", KY: "S", MS: "S", TN: "S", AR: "S", LA: "S", OK: "S", TX: "S", AZ: "W", CO: "W", ID: "W", MT: "W", NV: "W", NM: "W", UT: "W", WY: "W", AK: "W", CA: "W", HI: "W", OR: "W", WA: "W" };
function regionOf(r) {
  const cc = String(r.country || "").toUpperCase();
  if (cc && cc !== "US") return "abroad:" + cc;
  const parts = String(r.location || "").split(",").map(s => s.trim());
  const st = parts.length >= 2 ? stateCode(parts[1]) : null;
  return st ? REGION[st] || null : null;
}
function locationQuestion(matches) {
  const regions = new Set(matches.map(x => regionOf(x.r)).filter(Boolean));
  if (regions.size < 2) return null;
  return { key: "location", prompt: "Where are you?", free: "A ZIP or a city is fine, or say", options: [{ label: "anywhere", value: "__any" }], noTail: true };
}
const DONT = [{ label: "Doesn't matter", value: "__any" }, { label: "Just show me", value: "__show" }];
// ---- the kind of car (a broad search narrows by kind first, with counts) ----
function kindOf(x, make) {
  const model = String(x.r.model || "").trim();
  const isCode = /^\d{3}$|^[a-z]\d{2,3}$/i.test(model) || squash(model) === "911";
  const gen = x.gen || genFor(make || x.r.make, model, x.r.year, x.r.listing_title);
  if (isCode && gen) return genLabel(gen.code);
  return model ? model.replace(/^\w/, c => c.toUpperCase()) : (x.r.make || "Other");
}
const MAKE_PLURAL = m => /s$/i.test(m) ? m : m + "s";
function kindQuestion(matches, make, f) {
  const counts = new Map();
  for (const x of matches) { const k = kindOf(x, make); counts.set(k, (counts.get(k) || 0) + 1); }
  if (counts.size < 2) return null;
  const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, n]) => ({ label: `${k} (${n})`, value: k }));
  const who = make ? MAKE_PLURAL(make) : "cars";
  const budget = f.priceMax ? ` that have sold under ${usd(f.priceMax)}` : "";
  return { key: "kind", style: "kinds", prompt: `${matches.length} ${who} live${budget}. Which kind?`, options: opts };
}
function travelQuestion() {
  return { key: "travel", style: "plain", prompt: "How far would you travel?", options: [{ label: "100 miles", value: "100" }, { label: "500 miles", value: "500" }, { label: "anywhere", value: "__any" }] };
}
// "Under $50k" means what the car's exact spec SELLS for, not today's bid: a car whose spec's sold
// range sits wholly above the budget is left out. No range for the spec: the bid filter stands.
async function budgetBySpec(env, matches, f) {
  if (!f.priceMax && !f.priceMin) return matches;
  const ms = await Promise.all(matches.map(x => listingMarket(env, x.r, x.facts).catch(() => null)));
  return matches.filter((x, i) => {
    const m = ms[i]; x.market = m && m.kind === "pending" ? undefined : m;
    if (!m || m.kind !== "range") return true;
    if (f.priceMax && m.low > f.priceMax) return false;
    if (f.priceMin && m.high < f.priceMin) return false;
    return true;
  });
}

// ---- groups (budget discovery, value) ----
const TRIM_WORDS = /\b(carrera 4 gts|carrera 4s|carrera gts|carrera s|carrera 4|carrera t|carrera|targa 4 gts|targa 4s|targa 4|targa|turbo s|turbo|gt3 rs|gt3 touring|gt3|gt2 rs|gt2|gt4 rs|gt4|gts|sport classic|speedster|dakar|s|competition|cs|amg|base)\b/i;
function groupKeyOf(x, make) {
  const model = x.r.model || "";
  const gen = genFor(make, model, x.r.year, x.r.listing_title);
  const after = String(x.r.listing_title || "").split(new RegExp("\\b" + model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"))[1] || "";
  const tm = TRIM_WORDS.exec(after);
  const trim = tm ? tm[1].replace(/\b\w/g, c => c.toUpperCase()).replace(/\bGt(\d)/g, "GT$1").replace(/\bRs\b/g, "RS").replace(/\bGts\b/g, "GTS").replace(/\bCs\b/g, "CS").replace(/\bAmg\b/g, "AMG") : "";
  const isCode = /^\d{3}$|^[a-z]\d{2,3}$/i.test(model.trim()) || squash(model) === "911";
  const head = gen ? (isCode || squash(model) === squash(gen.code) ? genLabel(gen.code) : genLabel(gen.code) + " " + model) : (isCode ? genLabel(model) : model);
  return [head, trim].filter(Boolean).join(" ").trim() || (x.r.make || make);
}
function groupsOf(matches, make, perGroup = 3, maxGroups = 8) {
  const g = new Map();
  for (const x of matches) { const k = groupKeyOf(x, make); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
  for (const list of g.values()) if (list.some(x => x.distance != null)) list.sort((a, b) => (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance));
  return [...g.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxGroups).map(([label, list]) => ({ label, n: list.length, items: list, first: list.slice(0, perGroup) }));
}

// ---- natural openers (never a comma list of the filters) ----
const STATE_NAME = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const COUNTRY_SHORT = { GB: "the UK", US: "the US", AE: "the UAE", NL: "the Netherlands" };
export function countryPhrase(cc) { cc = String(cc || "").toUpperCase(); return COUNTRY_SHORT[cc] || COUNTRY_NAME[cc] || cc; }
function whereOf(r) {
  const cc = String(r.country || "").toUpperCase();
  if (cc && cc !== "US") return null;
  const parts = String(r.location || "").split(",").map(s => s.trim());
  const st = parts.length >= 2 ? stateCode(parts[1]) : null;
  return st ? STATE_NAME[st] || null : null;
}
function modelName(r) {
  const t = String(r.listing_title || "").replace(/^\s*[\d,.]+\s*k?[- ]mile\s*/i, "").replace(/\s+\d+[- ]speed\b/ig, "").trim();
  const m = /\b((?:18|19|20)\d{2})\s+(.+)$/.exec(t);
  return m ? { year: m[1], name: m[2].replace(new RegExp("^" + String(r.make || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), "") } : { year: r.year || "", name: t };
}
function openerOne(x, f) {
  const { year, name } = modelName(x.r);
  const lead = ["Found one. A", x.facts.colour || "", year, name].filter(Boolean).join(" ");
  const where = whereOf(x.r);
  const tail = [x.facts.gearbox === "manual" ? "manual" : x.facts.gearbox === "auto" ? String(x.facts.gearboxLabel || "automatic").toLowerCase() : "", x.facts.miles ? num(x.facts.miles) + " miles" : ""].filter(Boolean);
  let s = lead + (where ? " in " + where : "") + (tail.length ? ", " + tail.join(", ") : "") + ".";
  const cc = String(x.r.country || "").toUpperCase();
  if (cc && cc !== "US" && !((f && f.countries) || []).includes(cc)) s += " This one is in " + countryPhrase(cc) + ".";
  return s;
}
function openerFor(list, geoInfo, f) {
  const n = list.length;
  if (n === 1) return openerOne(list[0], f);
  if (n <= 5) {
    const d = list.find(x => x.distance != null);
    return "A few came up." + (geoInfo && d ? " Nearest first, the closest is about " + num(Math.max(1, d.distance)) + " miles away." : " The ones ending soonest are first.");
  }
  return "There are " + n + " live right now." + (geoInfo ? " Here are the closest." : " Here are the closest matches.");
}
export const NONE_LINE = "Nothing live matches that right now. Closest is below, or Sam can tell you when one comes up.";
// Zero matches: relax the soft filters (colour, miles, budget, gearbox, body) for the "closest" cars.
async function closestRelaxed(env, v, f, text) {
  const loose = { ...f, colours: [], notColours: [], miMax: null, miMin: null, priceMax: null, priceMin: null, gearbox: null, gearboxLabel: null, bodies: [], countries: [], houses: [] };
  const r = v ? await searchLive(env, v, loose, text) : { rows: [] };
  return r.rows.slice(0, 3);
}

// ---- main ----
// state: { messages: [text...], filters, answered: [keys], asked: n, zip, showNow }
export async function converse(env, state) {
  const st = { messages: [], answered: [], asked: 0, ...state };
  const all = st.messages.join(" . ");
  const intent = readIntent(all);
  const parsed = parseQuery(intent.clean);
  const f = mergeFilters(parsed.filters, st.filters);
  const placeTyped = st.place || null;
  const zip = st.zip || (intent.geo && intent.geo.zip) || null;
  const v = await resolveForBuy(parsed.text || intent.clean, env);
  const broad = !!(f.priceMax || f.priceMin || f.miMax || f.gearbox || f.colours.length || intent.endingToday || f.bodies.length);
  if (!v && !broad) return { type: "nonsense", say: "Tell Sam a car, a budget or a type of car and Sam will find what's live.", options: NONSENSE_CHIPS };
  if (v && !f.gens.length) { const named = gensNamed(parsed.text, v.make); if (named.length > 1 || (named.length === 1 && !v.genCode)) f.gens = named; }
  const vv = v || { make: null };
  const res = v ? await searchLive(env, v, f, parsed.text) : await searchAll(env, f);
  let matches = res.rows;
  if (intent.endingToday) matches = matches.filter(x => x.r.end_time && Date.parse(x.r.end_time) - Date.now() < 24 * 3600e3);
  // Location: a ZIP or a typed place sorts nearest first; unknown locations stay, flagged.
  let geoInfo = null;
  const center = zip ? zipCoord(zip) : (placeTyped ? placeAny(placeTyped) : (intent.geo && intent.geo.place ? placeAny(intent.geo.place) : null));
  if ((intent.geo || zip || placeTyped) && !center && intent.geo && intent.geo.needZip && !st.answered.includes("location")) {
    return { type: "question", key: "location", prompt: "Where are you?", free: "A ZIP or a city is fine, or say", options: [{ label: "anywhere", value: "__any" }], noTail: true };
  }
  // Cars abroad stay out unless the buyer said anywhere or named a country.
  if (!f.countries.length && st.travel !== "any") matches = matches.filter(x => { const cc = String(x.r.country || "").toUpperCase(); return !cc || cc === "US"; });
  if (center) {
    const placeName = zip ? ((nearestPlace(center) || {}).name || zip) : (center.name || placeTyped || (intent.geo && intent.geo.place));
    // The radius: what the buyer said, else what they'd travel, else 500 miles ("anywhere" lifts it).
    const radius = intent.geo && intent.geo.radius ? intent.geo.radius : (st.travel === "any" ? null : (Number(st.travel) || 500));
    geoInfo = { radius, placeName };
    for (const x of matches) { const c = listingCoord(x.r); x.distance = c ? milesBetween(center, c) : null; }
    matches.sort((a, b) => (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance));
    if (geoInfo.radius) {
      const inside = matches.filter(x => x.distance != null && x.distance <= geoInfo.radius);
      if (!inside.length) {
        const nearest = matches.find(x => x.distance != null);
        const where = nearest ? (listingCoord(nearest.r) || {}).name : null;
        return { type: "results", say: nearest ? `Nothing within ${geoInfo.radius} miles. The nearest is ${num(nearest.distance)} miles away in ${where}, and all of these ship.` : `Nothing within ${geoInfo.radius} miles.`, matches: matches.filter(x => x.distance != null).slice(0, 60), geo: true, filters: f };
      }
      matches = inside;
    }
  }
  // Budget by what the spec sells for, then the chosen kind.
  matches = await budgetBySpec(env, matches, f);
  if (f.kind) matches = matches.filter(x => kindOf(x, vv.make) === f.kind);
  // Out of scope: one line, the sales, then cars.
  if (intent.outOfScope && v) {
    const m = await familyMarket(env, v, f);
    return { type: "results", say: "Sam shows what sold, not what will." + (m ? "" : " These don't trade as one market, so each car below shows what cars like it sold for."), market: m, matches, outOfScope: true, filters: f };
  }
  // Value: grouped by variant, each card with its own sold range; never ranked by value.
  if (intent.value) return { type: "groups", say: matches.length ? "Here they are by variant, with what each sold for." : NONE_LINE, ...splitGroups(matches, vv.make || "", f, 6, 10), perCard: true, footnote: true, filters: f, vins: vinsOf(matches) };
  // Budget discovery and broad asks: grouped by family, most live first. Same question policy as a
  // named model: budget when none was given and the pool is large, then where the buyer is when the
  // live cars span regions. A budget-led search still groups by model once the location is known.
  if (!v || !v.model) {
    // The pool the policy judges is the stated matches when a filter left some unconfirmed ("yellow
    // porsche" is the 16 stated yellow cars, not every Porsche whose listing does not give a colour).
    const stated = matches.filter(x => !(x.unknown || []).length), pool = stated.length ? stated : matches;
    if (!st.showNow && st.asked < 4 && pool.length > 5) {
      const order = [
        ["kind", () => (!f.kind && pool.length > 15) ? kindQuestion(pool, vv.make, f) : null],
        ["budget", () => (!f.priceMax && !f.priceMin && pool.length > 20) ? budgetQuestion(pool) : null],
        ["location", () => (!f.countries.length && !center && !intent.geo) ? locationQuestion(pool) : null],
        ["travel", () => (center && !(intent.geo && intent.geo.radius) && !st.travel) ? travelQuestion() : null]
      ];
      for (const [key, fn] of order) {
        if (st.answered.includes(key)) continue;
        const q = fn();
        if (q) return { type: "question", ...q, key, filters: f };
      }
    }
    const budgetLed = !!(f.priceMax || f.priceMin);
    if (geoInfo && !budgetLed) return { type: "results", say: openerFor(matches, geoInfo, f), matches, geo: true, filters: f, vins: vinsOf(matches) };
    return { type: "groups", say: matches.length ? "Here's what's live, grouped by model." : NONE_LINE, ...splitGroups(matches, vv.make || "", f, 3, 10), geo: !!geoInfo, filters: f, vins: vinsOf(matches) };
  }
  // One question policy: at most three about the car (generation or body, miles, budget), then where the
  // buyer is when live cars span regions. Only when the answer changes the results; none at 5 or fewer.
  if (!st.showNow && st.asked < 4 && matches.length > 5) {
    const statedMiles = /\bmiles?\b|\bmileage\b/i.test(all);
    const order = [
      ["generation", () => { const genOpen = !f.gens.length && !f.yearMin && !f.yearMax && !v.year && !v.genCode && !v.yearSpan; return (genOpen ? genQuestion(v, matches) : null) || (!f.bodies.length && !v.bodyStyle ? bodyQuestion(matches) : null); }],
      ["mileage", () => (!f.miMax && !f.miMin && (statedMiles || matches.length >= 25)) ? milesQuestion(matches) : null],
      ["budget", () => (!f.priceMax && !f.priceMin && matches.length > 8) ? budgetQuestion(matches) : null],
      ["location", () => (!f.countries.length && !center && !intent.geo) ? locationQuestion(matches) : null],
      ["travel", () => (center && !(intent.geo && intent.geo.radius) && !st.travel) ? travelQuestion() : null]
    ];
    for (const [key, fn] of order) {
      if (st.answered.includes(key) || (key === "generation" && st.answered.includes("body"))) continue;
      if (key !== "location" && key !== "travel" && st.asked >= 3) continue;
      const q = fn();
      if (q) return { type: "question", ...q, key: q.key === "body" ? "body" : key, filters: f };
    }
  }
  if (!matches.length) {
    const closest = await closestRelaxed(env, v, f, parsed.text);
    return { type: "results", say: closest.length ? NONE_LINE : "Nothing live matches that right now. Sam can tell you when one comes up.", matches: closest, closest: true, filters: f };
  }
  return { type: "results", say: openerFor(matches, geoInfo, f), matches, geo: !!geoInfo, filters: f, vins: vinsOf(matches) };
}
// A typed place: "Austin, TX", or a bare city name (the largest-area match wins ties).
function placeAny(text) {
  const t = String(text || "").trim();
  return placeFromText(t) || cityOnly(t);
}
// Every live car for a make-less broad ask, through the same filters.
async function searchAll(env, f) {
  const { liveRows, listingFacts } = await import("./search.js");
  const rows = await liveRows(env, "end_time=gte." + encodeURIComponent(new Date(Date.now() - 3600e3).toISOString()));
  const out = [];
  for (const r of rows) {
    const facts = listingFacts(r);
    if (f.priceMax && r.current_bid_usd && r.current_bid_usd > f.priceMax) continue;
    if (f.priceMin && r.current_bid_usd && r.current_bid_usd < f.priceMin) continue;
    if (f.miMax && facts.miles && facts.miles > f.miMax) continue;
    if (f.gearbox && facts.gearbox && facts.gearbox !== f.gearbox) continue;
    if (f.colours.length && facts.colour && !f.colours.includes(facts.colour)) continue;
    if (f.bodies.length && facts.body && !f.bodies.includes(facts.body)) continue;
    if (f.countries.length && !f.countries.includes(String(r.country || "").toUpperCase())) continue;
    const unknown = [];
    if (f.miMax && !facts.miles) unknown.push("miles");
    if (f.gearbox && !facts.gearbox) unknown.push("gearbox");
    if (f.colours.length && !facts.colour) unknown.push("colour");
    out.push({ r, facts, gen: genFor(r.make, r.model, r.year, r.listing_title), unknown, exactTrim: 1, yearDist: 0 });
  }
  out.sort((a, b) => (a.unknown.length ? 1 : 0) - (b.unknown.length ? 1 : 0) || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  return { rows: out };
}
const vinsOf = list => list.map(x => x.r.vin_norm).filter(Boolean);
// Stated matches grouped first; when a colour/miles/body/gearbox was asked and some listings don't
// say, those form their own groups after, under the "may be" line (never mixed into the stated ones).
function splitGroups(matches, make, f, perGroup, maxGroups) {
  const sure = matches.filter(x => !(x.unknown || []).length), maybe = matches.filter(x => (x.unknown || []).length);
  return { groups: groupsOf(sure, make, perGroup, maxGroups), maybeGroups: maybe.length ? groupsOf(maybe, make, perGroup, maxGroups) : [], maybeKeys: [...new Set(maybe.flatMap(x => x.unknown || []))] };
}
export { groupsOf, kindOf, budgetBySpec, placeAny, searchAll };
