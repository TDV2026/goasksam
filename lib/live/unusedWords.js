// LEFTOVER WORDS (Sam's order, Oct 23 2026): a word in the typed search that Sam did not use is named back plainly, never silently dropped:
// "Sam didn't use 'xyz' in this search." The engine knows which words it used: the search's own filters (parseQuery strips colours, body
// words, gearbox, miles and prices), the group-term words, the resolved car's own words and the aliases that name it, the year and
// number words, and the soft words Buy sorts by. Filler (a, the, for, sale, ...) never counts. One module for Buy, Market Check, Sell
// and Tasks (they all read the typed text through the resolver or parseQuery); each surface prints the engine's line, nothing computed.
import { parseQuery } from "./search.js";
import { MAKE_ALIASES, MODEL_ALIASES } from "../vehicleData.js";
import { enthusiastTermsIn, withoutTerms } from "../enthusiastTerms.js";
import { CURATED_GENERATIONS } from "../generations.js";

const sq = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const FILLER = new Set(("a an the for sale selling sell buy buying bought find finding show shows me my i we you your our us want wants wanted need needs looking look looks " +
  "please any some with without and or of in on to at near from is are was be been it its it's this that these those one ones what which who where how " +
  "car cars vehicle vehicles auto automobile listing listings available current currently right now today can could would should will get got give " +
  "used pre owned preowned really very just also only about around approximately roughly maybe like love best nice cheap cheapest low lowest high " +
  "miles mile mileage mi km kilometers kilometres k thousand under over below above than less more max min maximum minimum up no not " +
  // the value-intent words (GoAskSam 2.0 Stage 3): Find answers them with its own line pointing to Market Check, so they are never "unused"
  "sell selling worth value").split(/\s+/));
// CONDITION AND PRAISE WORDS PASS SILENTLY (Sam, Oct 23 2026): they describe the car, the search cannot filter on them, so no leftover line and
// no "Listings don't say which cars are ..." note either (lib/live/samChat.js reads this set too). A hyphenated word ('garage-kept') is tried in
// its parts. Feature words (sunroof, hardtop, sport seats), typos and unknown words are still named.
export const PASS_SILENT = new Set(["restored", "restoration", "survivor", "original", "garage", "garaged", "kept", "clean", "nice", "runs", "great", "good", "beautiful",
  "gorgeous", "pretty", "perfect", "pristine", "mint", "excellent", "well", "maintained", "owner", "owned", "tidy", "solid", "honest", "lovely", "stunning", "immaculate", "sharp"]);
// chassis and generation codes that resolve a car are understood words, the same as on Market Check (E30, E46, W113, R107, C5, 993 ...): the curated
// codes of the resolved make, and the plain shapes of a chassis code
const CODE_SHAPE = /^(?:[efgu]\d{2}|[wrvxz]\d{2,3}|c[1-8]|[sd]\d|mk\d|b\d|a\d{2})$/i;
function genCodesOf(make) {
  const mk = sq(make), out = new Set();
  if (!mk) return out;
  for (const g of CURATED_GENERATIONS) if (sq(g.make) === mk) out.add(sq(g.code));
  return out;
}
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
export function unusedWordsOf(raw, vehicle, corrections, extraUsed) {
  try {
    // a VIN is an identifier the page decodes, never a word Sam left unused (a card's own Market Check link opens on the VIN)
    const text = String(raw || "").replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, " ");
    if (!text.trim()) return { unused: [], line: null };
    // only when a car was resolved: while the make or the model is still being asked, the typed words may be the answer's own words
    // (a model the resolver has not read yet), and naming them "unused" would be wrong
    if (!vehicle || !vehicle.make || !vehicle.model) return { unused: [], line: null };
    const terms = enthusiastTermsIn(text, (vehicle && vehicle.make) || "");
    const own = ownWords(vehicle, corrections);
    // the place the search resolved (Chicago, 90210, California) is a used word, and so is the distance phrase around it
    for (const x of extraUsed || []) for (const w of String(x || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) own.add(w);
    // the typed words that only differ from the make by a space ("De Tomaso" for DeTomaso, "Rolls Royce" for Rolls-Royce) are the make, not leftovers
    { const tw = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), mk = sq(vehicle.make);
      for (let i = 0; i + 1 < tw.length; i++) { if (sq(tw[i] + tw[i + 1]) === mk) { own.add(tw[i]); own.add(tw[i + 1]); } if (i + 2 < tw.length && sq(tw[i] + tw[i + 1] + tw[i + 2]) === mk) { own.add(tw[i]); own.add(tw[i + 1]); own.add(tw[i + 2]); } } }
    // A CODE TYPED WITH A SPACE IS THE CAR'S OWN WORD (Oct 29 2026, "Sam didn't use 'rs' in this search." under the Find search "Audi RS 6 Avant", model RS6): typed words that only differ from a word of the car's name by spaces or hyphens
    // ("RS" + "6" for RS6, "RX" + "7" for RX-7, "SL" + "500") are that word, never leftovers; two or three typed words joined are tried against every own word.
    { const tw = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), ownSq = new Set([...own].map(sq).filter(Boolean));
      for (let i = 0; i < tw.length; i++) for (const n of [2, 3]) { if (i + n > tw.length) continue; const j = sq(tw.slice(i, i + n).join("")); if (ownSq.has(j)) for (let k = i; k < i + n; k++) own.add(tw[k]); } }
    const genCodes = genCodesOf(vehicle.make);
    // the search's own filters come out first (colours, body words, gearbox, miles, prices, countries, houses ...)
    const protectedWords = new Set([...own].map(sq).filter(Boolean));
    let rest = parseQuery(withoutTerms(text, terms), protectedWords).text || "";
    rest = rest.replace(/\b(?:within|further than|farther than|more than|over|under|up to)?\s*\d[\d,]*\s*(?:miles?|mi|km|kilometers?|kilometres?)\s+(?:of|from|away from|around)\b/ig, " ");
    // a year or a decade the resolver read
    const yr = vehicle && (vehicle.year || vehicle.yearRange) ? true : false;
    const out = [], seen = new Set();
    for (const tok of rest.toLowerCase().replace(/[–—]/g, " ").split(/[\s,;:!?()"]+/).filter(Boolean)) {
      const w = tok.replace(/^['"-]+|['"-]+$/g, "");
      if (!w || seen.has(w)) continue;
      if (PASS_SILENT.has(w) || (w.includes("-") && w.split("-").filter(Boolean).every(x => PASS_SILENT.has(x) || FILLER.has(x)))) continue;
      if (genCodes.has(sq(w)) || CODE_SHAPE.test(w)) continue;
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

// THE WORDS THAT MADE THE REFUSAL (e90, Oct 25 2026, the 1992 Porsche 911 Carrera 4 by Singer): when the typed words themselves are what
// produced the no-range answer (the Singer mark, or a typed model that names a different car of the make), the answer already says so in its
// own sentence, so the "Sam didn't use ..." line is not added above it. Every other answer keeps the line exactly as before.
export function unusedFieldsFor(raw, vehicle, answer) {
  try {
    const rf = answer && answer.refusal;
    if (rf && (rf.kind === "builder_car" || (rf.kind === "invariant_failed" && Array.isArray(rf.failedChecks) && rf.failedChecks.includes("typed_model_mismatch")))) return {};
    const u = unusedWordsOf(raw, vehicle, null);
    return u.unused.length ? { unusedWords: u.unused, unusedLine: u.line } : {};
  } catch { return {}; }
}
