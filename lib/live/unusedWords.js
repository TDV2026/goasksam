// LEFTOVER WORDS (Sam's order, Oct 23 2026): a word in the typed search that Sam did not use is named back plainly, never silently dropped:
// "Sam didn't use 'xyz' in this search." The engine knows which words it used: the search's own filters (parseQuery strips colours, body
// words, gearbox, miles and prices), the group-term words, the resolved car's own words and the aliases that name it, the year and
// number words, and the soft words Buy sorts by. Filler (a, the, for, sale, ...) never counts. One module for Buy, Market Check, Sell
// and Tasks (they all read the typed text through the resolver or parseQuery); each surface prints the engine's line, nothing computed.
import { parseQuery } from "./search.js";
import { MAKE_ALIASES, MODEL_ALIASES } from "../vehicleData.js";
import { enthusiastTermsIn, withoutTerms } from "../enthusiastTerms.js";

const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const FILLER = new Set(("a an the for sale selling sell buy buying bought find finding show shows me my i we you your our us want wants wanted need needs looking look looks " +
  "please any some with without and or of in on to at near from is are was be been it its it's this that these those one ones what which who where how " +
  "car cars vehicle vehicles auto automobile listing listings available current currently right now today can could would should will get got give " +
  "used pre owned preowned really very just also only about around approximately roughly maybe like love best nice cheap cheapest low lowest high " +
  "miles mile mileage mi km kilometers kilometres k thousand under over below above than less more max min maximum minimum up no not").split(/\s+/));
const asNumberish = w => /^\$?\d[\d,.]*k?$/.test(w) || /^\d+(st|nd|rd|th)$/.test(w) || /^(19|20)\d\d s?$/.test(w) || /^\d0s$/.test(w) || /^'?\d\d$/.test(w);

// the words of a car's own name: its fields, and every alias that names its make or model
function ownWords(vehicle, corrections) {
  const v = vehicle || {}, words = new Set();
  const add = x => { for (const w of String(x || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) words.add(w); };
  for (const f of [v.make, v.model, v.parentModel, v.trim, v.edition, v.variant, v.series, v.bodyStyle, v.color, v.wheelbase, v.canonicalLabel, v.genCode]) add(f);
  if (v.make) { const mk = sq(v.make); for (const a of MAKE_ALIASES) if (sq(a.make) === mk) add(a.alias); }
  if (v.model) { const md = sq(v.model); for (const a of MODEL_ALIASES) if (sq(a.model) === md && (!v.make || sq(a.make) === sq(v.make))) { add(a.alias); add(a.trim); } }
  for (const c of corrections || []) { add(c && (c.from || c.original)); add(c && (c.to || c.corrected)); }
  return words;
}
// does the typed word belong to the car's own words (also a short prefix, a squashed join, or a hyphen split of one)?
function explained(word, own) {
  if (own.has(word)) return true;
  const w = sq(word);
  if (!w) return true;
  for (const o of own) { const s = sq(o); if (s === w || (w.length >= 3 && (s.startsWith(w) || w.startsWith(s) && s.length >= 3 && w.length - s.length <= 2))) return true; }
  const joined = sq([...own].join(""));
  return w.length >= 4 && joined.includes(w);
}
// raw: the typed text; vehicle: what the resolver made of it; corrections: the resolver's typo fixes. Returns { unused: [...], line }.
export function unusedWordsOf(raw, vehicle, corrections) {
  try {
    const text = String(raw || "");
    if (!text.trim()) return { unused: [], line: null };
    // only when a car was resolved: while the make or the model is still being asked, the typed words may be the answer's own words
    // (a model the resolver has not read yet), and naming them "unused" would be wrong
    if (!vehicle || !vehicle.make || !vehicle.model) return { unused: [], line: null };
    const terms = enthusiastTermsIn(text, (vehicle && vehicle.make) || "");
    const own = ownWords(vehicle, corrections);
    // the search's own filters come out first (colours, body words, gearbox, miles, prices, countries, houses ...)
    const protectedWords = new Set([...own].map(sq).filter(Boolean));
    let rest = parseQuery(withoutTerms(text, terms), protectedWords).text || "";
    // a year or a decade the resolver read
    const yr = vehicle && (vehicle.year || vehicle.yearRange) ? true : false;
    const out = [], seen = new Set();
    for (const tok of rest.toLowerCase().replace(/[–—]/g, " ").split(/[\s,;:!?()"]+/).filter(Boolean)) {
      const w = tok.replace(/^['"-]+|['"-]+$/g, "");
      if (!w || seen.has(w)) continue;
      if (FILLER.has(w) || asNumberish(w) || (yr && /^(19|20)\d\d$/.test(w))) continue;
      if (explained(w, own)) continue;
      seen.add(w); out.push(w);
    }
    return { unused: out, line: unusedWordsLine(out) };
  } catch { return { unused: [], line: null }; }
}
// the engine's one plain sentence (at most four words named)
export function unusedWordsLine(words) {
  const list = (words || []).slice(0, 4).map(w => `'${w}'`);
  if (!list.length) return null;
  const named = list.length === 1 ? list[0] : list.length === 2 ? `${list[0]} or ${list[1]}` : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
  return `Sam didn't use ${named} in this search.`;
}
