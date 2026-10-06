// The /buy conversation (Lane C, Oct 2026). ZERO OldCarsData. Stateless: the client sends the whole
// conversation state each turn; this returns the next step. Sam asks only about what is missing AND
// would actually narrow the search, one question at a time, at most three, in the order generation,
// mileage, budget, location. Every reply: what was understood (one line), any market part answered
// from sales, then cars. Never a dead end, never a verdict on a bid, never a prediction.
import { parseQuery, emptyFilters, gensNamed, resolveForBuy, searchLive, listingMarket, familyMarket, nounFor, genFor, genLabel, COUNTRY_NAME } from "./search.js";
import { zipCoord, listingCoord, milesBetween, nearestPlace, placeFromText } from "./geo.js";
import { CURATED_GENERATIONS } from "../generations.js";

const OUT_OF_SCOPE = /\b(good |great |solid |smart )?investment\b|\bappreciat\w*|\bwill (?:it|they|this|that) (?:be )?(?:worth|go up|appreciate|hold)|\bfuture value\b|\bgo(?:ing)? up in value\b|\bshould i buy\b|\bworth buying\b|\bhold (?:its|their) value\b|\bis (?:it|this|that) a good buy\b|\bwhat will (?:it|they|this) be worth\b/i;
const VALUE = /\b(good value|great value|best value|value for money|a deal|good deal|great deal|deals?|cheap(?:est)?|bargains?|steals?|undervalued|under-?priced|bang for (?:the|my) buck)\b/i;
const ENDING_TODAY = /\b(ending|ends|closing|finishing) (?:today|soon|tonight|in the next (?:day|24 hours))\b|\bending today\b/i;
const NEAR = /\b(?:within|in)\s+(\d{1,4})\s*(?:miles?|mi)\s+(?:of|from)\s+(?:zip\s*)?([0-9]{5}|[A-Za-z .'-]+,\s*[A-Za-z]{2,})|\b(?:near|close to|around)\s+(me|zip\s*\d{5}|\d{5}|[A-Za-z .'-]+,\s*[A-Za-z]{2,})/i;
const NONSENSE_CHIPS = ["Black manual BMW M3", "Porsches under $50k", "Anything ending today"];
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
  for (const k of ["gearbox", "gearboxLabel", "miMax", "miMin", "priceMax", "priceMin", "yearMin", "yearMax"]) if (add && add[k] != null) f[k] = add[k];
  return f;
}

// ---- the next question, only when it narrows the matches ----
function genQuestion(v, matches) {
  const parent = v.parentModel || v.model; if (!parent) return null;
  const counts = new Map();
  for (const x of matches) if (x.gen) counts.set(x.gen.code, (counts.get(x.gen.code) || 0) + 1);
  if (counts.size < 2) return null;
  const chips = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, n]) => {
    const g = CURATED_GENERATIONS.find(x => x.code === code && squash(x.model) === squash(parent));
    return { label: genLabel(code) + (g ? " (" + g.yearStart + " to " + g.yearEnd + ")" : ""), value: code, n };
  });
  return { key: "generation", prompt: "Which generation?", chips };
}
function milesQuestion(matches) {
  const known = matches.filter(x => x.facts.miles).map(x => x.facts.miles);
  if (known.length < 4) return null;
  const caps = [10000, 20000, 30000, 50000, 75000, 100000].map(c => ({ c, n: known.filter(m => m <= c).length })).filter(x => x.n > 0 && x.n < known.length);
  if (caps.length < 2) return null;
  const pick = caps.length > 4 ? [caps[0], caps[Math.floor(caps.length / 3)], caps[Math.floor(2 * caps.length / 3)], caps[caps.length - 1]] : caps;
  return { key: "mileage", prompt: "How many miles, at most?", chips: [...new Map(pick.map(x => [x.c, x])).values()].map(x => ({ label: "Under " + num(x.c) + " miles", value: String(x.c), n: x.n })) };
}
function budgetQuestion(matches) {
  const bids = matches.map(x => Number(x.r.current_bid_usd)).filter(b => b > 0).sort((a, b) => a - b);
  if (bids.length < 4) return null;
  const nice = n => { const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.ceil(n / (p * 5)) * p * 5; };
  const qs = [0.25, 0.5, 0.75].map(q => nice(bids[Math.min(bids.length - 1, Math.floor(q * bids.length))]));
  const uniq = [...new Set(qs)].filter(c => { const n = bids.filter(b => b <= c).length; return n > 0 && n < bids.length; });
  if (uniq.length < 2) return null;
  return { key: "budget", prompt: "What's your budget?", chips: uniq.map(c => ({ label: "Under " + usd(c), value: String(c), n: bids.filter(b => b <= c).length })) };
}
function locationQuestion(matches) {
  const us = matches.filter(x => !x.r.country || String(x.r.country).toUpperCase() === "US").length;
  if (us === matches.length && matches.length <= 12) return null;
  const chips = [{ label: "Near my ZIP", value: "zip" }];
  if (us && us < matches.length) chips.push({ label: "United States only", value: "US", n: us });
  chips.push({ label: "Anywhere", value: "any", n: matches.length });
  return { key: "location", prompt: "Where are you?", chips };
}
const DONT = [{ label: "Doesn't matter", value: "__any" }, { label: "Just show me", value: "__show" }];

// ---- groups (budget discovery, value) ----
const TRIM_WORDS = /\b(carrera 4 gts|carrera 4s|carrera gts|carrera s|carrera 4|carrera t|carrera|targa 4 gts|targa 4s|targa 4|targa|turbo s|turbo|gt3 rs|gt3 touring|gt3|gt2 rs|gt2|gt4 rs|gt4|gts|sport classic|speedster|dakar|s|competition|cs|amg|base)\b/i;
function groupKeyOf(x, make) {
  const model = x.r.model || "";
  const gen = genFor(make, model, x.r.year);
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
  return [...g.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxGroups).map(([label, list]) => ({ label, n: list.length, items: list, first: list.slice(0, perGroup) }));
}

// ---- the result line ("Black manual E92 M3s, under 70,000 miles, under $45,000, near Beverly Hills first. 6 live now.") ----
function resultLine(v, f, n, geoInfo) {
  const noun = nounFor(v, f);
  const lead = [(f.colours || []).join(" or "), f.gearbox ? (f.gearbox === "manual" ? "manual" : String(f.gearboxLabel || "automatic")) : "", noun].filter(Boolean).join(" ");
  const bits = [lead.charAt(0).toUpperCase() + lead.slice(1)];
  if (f.miMax) bits.push("under " + num(f.miMax) + " miles");
  if (f.priceMax) bits.push("under " + usd(f.priceMax));
  if (f.priceMin) bits.push("over " + usd(f.priceMin));
  (f.notColours || []).forEach(c => bits.push("not " + c));
  if ((f.countries || []).length === 1 && f.countries[0] !== "US") bits.push("in " + (COUNTRY_NAME[f.countries[0]] || f.countries[0]));
  if (geoInfo && geoInfo.placeName) bits.push((geoInfo.radius ? "within " + geoInfo.radius + " miles of " : "closest to ") + geoInfo.placeName + (geoInfo.radius ? "" : " first"));
  return bits.join(", ") + ". " + n + " live now.";
}

// ---- main ----
// state: { messages: [text...], filters, answered: [keys], asked: n, zip, showNow }
export async function converse(env, state) {
  const st = { messages: [], answered: [], asked: 0, ...state };
  const all = st.messages.join(" . ");
  const intent = readIntent(all);
  const parsed = parseQuery(intent.clean);
  const f = mergeFilters(parsed.filters, st.filters);
  const zip = st.zip || (intent.geo && intent.geo.zip) || null;
  const v = await resolveForBuy(parsed.text || intent.clean, env);
  const broad = !!(f.priceMax || f.priceMin || f.miMax || f.gearbox || f.colours.length || intent.endingToday || f.bodies.length);
  // e. Not a car and not a broad ask: one line + three examples. Never a dead end.
  if (!v && !broad) return { type: "nonsense", say: "Tell Sam a car, a budget or a type of car and he'll find what's live.", chips: NONSENSE_CHIPS };
  if (v && !f.gens.length) { const named = gensNamed(parsed.text, v.make); if (named.length > 1 || (named.length === 1 && !v.genCode)) f.gens = named; }
  const vv = v || { make: null };
  // Matches. A make-less broad ask ("anything ending today", "manual only") reads every live car.
  let res = v ? await searchLive(env, v, f, parsed.text) : await searchAll(env, f);
  let matches = res.rows;
  if (intent.endingToday) matches = matches.filter(x => x.r.end_time && Date.parse(x.r.end_time) - Date.now() < 24 * 3600e3);
  // a. Location: distance from a ZIP or a typed place; ask once when "near me" has no ZIP.
  let geoInfo = null;
  if (intent.geo || zip) {
    const center = zip ? zipCoord(zip) : (intent.geo && intent.geo.place ? placeFromText(intent.geo.place) : null);
    if (!center && !st.answered.includes("zip")) return { type: "question", key: "zip", understood: understoodLine(vv, f, intent), prompt: "What's your ZIP code?", chips: DONT.slice(1), free: true, count: matches.length };
    if (center) {
      const placeName = zip ? ((nearestPlace(center) || {}).name || zip) : intent.geo.place;
      geoInfo = { radius: intent.geo && intent.geo.radius ? intent.geo.radius : null, placeName };
      for (const x of matches) { const c = listingCoord(x.r); x.distance = c ? milesBetween(center, c) : null; }
      matches.sort((a, b) => (a.distance == null ? 1e9 : a.distance) - (b.distance == null ? 1e9 : b.distance));
      if (geoInfo.radius) {
        const inside = matches.filter(x => x.distance != null && x.distance <= geoInfo.radius);
        if (!inside.length) {
          const nearest = matches.find(x => x.distance != null);
          const where = nearest ? (listingCoord(nearest.r) || {}).name : null;
          return { type: "results", understood: understoodLine(vv, f, intent, geoInfo),
            say: nearest ? `Nothing within ${geoInfo.radius} miles. The nearest is ${num(nearest.distance)} miles away in ${where}, and all of these ship.` : `Nothing within ${geoInfo.radius} miles, and none of these list a US location.`,
            matches: matches.filter(x => x.distance != null).slice(0, 60), geo: true };
        }
        matches = inside;
      }
    }
  }
  if (geoInfo) return { type: "results", understood: understoodLine(vv, f, intent, geoInfo), say: resultLineGeo(vv, f, matches.length, geoInfo), matches, filters: f };
  // d. Out of scope: one line, the sales, then cars.
  if (intent.outOfScope && v) {
    const m = await familyMarket(env, v, f);
    return { type: "results", understood: understoodLine(vv, f, intent), say: "Sam shows what sold, not what will.", market: m, matches, outOfScope: true };
  }
  // c. Value: the family's live cars grouped by variant, each with its own sold range; never ranked by value.
  if (intent.value) {
    return { type: "groups", understood: understoodLine(vv, f, intent), groups: groupsOf(matches, vv.make || "", 6, 10), perCard: true,
      footnote: "Sam doesn't call a live bid cheap or dear. Each card shows what cars like it sold for." };
  }
  // b. Budget discovery / broad asks: a make (or nothing) plus a constraint, grouped by family.
  if (!v || !v.model) {
    return { type: "groups", understood: understoodLine(vv, f, intent), groups: groupsOf(matches, vv.make || "", 3, 10) };
  }
  // 1. The conversation: ask only what is missing and narrows, max three, unless "just show me".
  if (!st.showNow && st.asked < 3 && matches.length > 5) {
    const order = [
      ["generation", () => (!f.gens.length && !f.yearMin && !f.yearMax && !v.year && !v.genCode) ? genQuestion(v, matches) : null],
      ["mileage", () => (!f.miMax && !f.miMin) ? milesQuestion(matches) : null],
      ["budget", () => (!f.priceMax && !f.priceMin) ? budgetQuestion(matches) : null],
      ["location", () => (!f.countries.length && !zip && !intent.geo) ? locationQuestion(matches) : null]
    ];
    for (const [key, fn] of order) {
      if (st.answered.includes(key)) continue;
      const q = fn();
      if (q) return { type: "question", key, understood: st.asked ? null : understoodLine(vv, f, intent), prompt: q.prompt, chips: q.chips.concat(DONT), count: matches.length, filters: f };
    }
  }
  return { type: "results", understood: null, say: resultLine(v, f, matches.length, geoInfo), matches, filters: f };
}
function resultLineGeo(v, f, n, g) {
  const noun = v && v.make ? (v.model ? nounFor(v, f) : v.make + "s") : "Cars";
  return noun.charAt(0).toUpperCase() + noun.slice(1) + (g.radius ? " within " + g.radius + " miles of " + g.placeName : " closest to " + g.placeName) + ", nearest first. " + n + " live now.";
}
function understoodLine(v, f, intent, geoInfo) {
  const car = v && v.make ? [v.year, v.make, v.genCode ? genLabel(v.genCode) + (v.parentModel && squash(v.parentModel) !== "911" ? " " + v.parentModel : "") : v.model, v.trim, v.yearSpan ? "(" + v.yearSpan[0] + " to " + (v.yearSpan[1] > 2050 ? "today" : v.yearSpan[1]) + ")" : null].filter(Boolean).join(" ") : "any car";
  const bits = [car];
  if (f.colours.length) bits.push(f.colours.join(" or "));
  if (f.gearbox) bits.push(f.gearbox === "manual" ? "manual" : String(f.gearboxLabel || "automatic"));
  if (f.bodies.length) bits.push(f.bodies.join(" or "));
  if (f.miMax) bits.push("under " + num(f.miMax) + " miles");
  if (f.priceMax) bits.push("under " + usd(f.priceMax));
  if (intent && intent.endingToday) bits.push("ending today");
  if (intent && intent.geo && intent.geo.radius) bits.push("within " + intent.geo.radius + " miles" + (geoInfo && geoInfo.placeName ? " of " + geoInfo.placeName : ""));
  if (intent && intent.value) bits.push("value");
  return "Looking for: " + bits.join(", ") + ".";
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
    out.push({ r, facts, gen: genFor(r.make, r.model, r.year), unknown, exactTrim: 1, yearDist: 0 });
  }
  out.sort((a, b) => (a.unknown.length ? 1 : 0) - (b.unknown.length ? 1 : 0) || String(a.r.end_time || "9").localeCompare(String(b.r.end_time || "9")));
  return { rows: out };
}
export { groupsOf };
