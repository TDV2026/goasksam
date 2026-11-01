// GENERATION PHRASES ("first gen", "1st gen", "Mk1", "Mk I", "first generation", "gen 1", "original generation", "latest generation") (Lane B, Nov 1 2026).
// A generation phrase names a row of the generation table (lib/generations.js: all trims, the generation's own years). It is never a trim filter and never a year range the reader or the chat made up.
// CAUSE (reader report, "first gen Ford Capri"): the resolver kept "1st" and "Mk1" as the TRIM, dropped "first gen", "gen 1" and "Mk I" without scoping anything, and the chat's search tool (which is told
// nothing about a car with no generation row) filled a trim and years from its own memory (trim=RS, from=1968). This file is the one reading of the phrase; the resolver and the chat tool both use it.
import { generationsForModel } from "./generations.js";

const WORDS = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, sixth: 6, "6th": 6, seventh: 7, "7th": 7, eighth: 8, "8th": 8,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = t => { const w = String(t).toLowerCase(); return WORDS[w] || ROMAN[w] || (/^\d{1,2}$/.test(w) ? Number(w) : null); };

const PATTERNS = [
  { re: /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th)[\s-]+gen(?:eration)?s?\b/i, kind: "nth" },
  { re: /\bgen(?:eration)?[\s-]*(\d{1,2}|one|two|three|four|five|six|seven|eight)\b/i, kind: "nth" },
  { re: /\bmk\.?[\s-]*(\d{1,2}|[ivx]{1,4})\b/i, kind: "nth", mk: true },
  { re: /\bmark[\s-]*(\d{1,2}|[ivx]{1,4})\b/i, kind: "nth", mk: true },
  { re: /\boriginal[\s-]+gen(?:eration)?\b/i, kind: "first" },
  { re: /\b(?:latest|newest|current|newest)[\s-]+gen(?:eration)?\b/i, kind: "last" }
];

// The phrase in the words, or null. { kind: "nth"|"first"|"last", n, text, mk }
export function genPhraseOf(text) {
  const t = String(text || "");
  for (const p of PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    const n = p.kind === "nth" ? num(m[1]) : null;
    if (p.kind === "nth" && !n) continue;
    return { kind: p.kind, n, text: m[0], mk: !!p.mk };
  }
  return null;
}
// The words with the phrase taken out.
export function withoutGenPhrase(text) {
  const gp = genPhraseOf(text);
  return gp ? String(text).replace(gp.text, " ").replace(/\s+/g, " ").trim() : String(text || "");
}

// Models whose table rows are the maker's own generations in order from the first, no gaps and no sub-rows, so "second gen" is the second row. Any model not listed answers "ordinal_unverified"
// (the engine's own generation question stands): a wrong ordinal would scope the wrong years, which is worse than asking. Porsche 911 (three G-series rows), 356, Skyline (R32 is the eighth), SL,
// Land Cruiser (no 50-series row), Rabbit (Mk1 and Mk5 only), A6 (starts at C5), Impala, Thunderbird, Charger, Challenger, GTO are deliberately absent.
export const ORDINAL_SAFE = new Set([
  "ford|capri",
  "ford|mustang", "ford|bronco", "chevrolet|camaro", "chevrolet|corvette", "pontiac|firebird", "chevrolet|chevelle", "mazda|mx-5", "mazda|rx-7", "toyota|supra", "toyota|4runner", "jeep|wrangler",
  "nissan|300zx", "bmw|m3", "bmw|m5", "bmw|m2", "bmw|m4", "bmw|3-series", "land rover|range rover", "porsche|boxster", "porsche|cayman", "porsche|cayenne", "porsche|panamera",
  "honda|s2000", "audi|tt", "audi|rs6", "audi|a4", "mercedes-benz|c63", "mercedes-benz|s-class", "volkswagen|bus", "jaguar|e-type", "jaguar|xke", "ford|f-100", "chevrolet|c10"
]);

// The generation rows for a car, one per base code (991.1 and 991.2 are the 991), oldest first.
export function generationRows(make, model) {
  const by = new Map();
  for (const g of generationsForModel(make, model)) {
    const base = String(g.code).split(".")[0], cur = by.get(base);
    if (!cur) by.set(base, { code: g.code, yearStart: g.yearStart, yearEnd: g.yearEnd });
    else { cur.yearStart = Math.min(cur.yearStart, g.yearStart); cur.yearEnd = Math.max(cur.yearEnd, g.yearEnd); }
  }
  return [...by.values()].sort((a, b) => a.yearStart - b.yearStart);
}

// The generation row the phrase names for this car: { row } or { why } ("no_table": the car has no generation table, so nothing is scoped and nothing is invented;
// "ordinal_unverified": the table is not the maker's own count; "beyond_table": the ordinal is past the last row).
export function generationForPhrase(make, model, gp) {
  if (!gp) return { why: "no_phrase" };
  const rows = generationRows(make, model);
  if (!rows.length) return { why: "no_table" };
  // a code the table itself carries wins ("Mk1" on a Rabbit is the Mk1 row)
  if (gp.mk) { const lit = rows.find(r => squash(r.code) === squash(gp.text)); if (lit) return { row: lit }; }
  const key = `${String(make || "").toLowerCase().trim()}|${String(model || "").toLowerCase().trim()}`;
  if (!ORDINAL_SAFE.has(key)) return { why: "ordinal_unverified" };
  if (gp.kind === "first") return { row: rows[0] };
  if (gp.kind === "last") return { row: rows[rows.length - 1] };
  return gp.n <= rows.length ? { row: rows[gp.n - 1] } : { why: "beyond_table", count: rows.length };
}

// Apply the phrase to a resolved vehicle: a row puts its code where a chassis code goes (the engine binds that code to the generation and its years and clears it from the trim, the way "C4 Corvette" and
// "ND Miata" already work); a phrase with no row leaves no trim and no years behind. A trim the buyer really named stays.
export function applyGenPhrase(vehicle, rawText) {
  if (!vehicle || !vehicle.make || !vehicle.model) return vehicle;
  if (/\bmark\b/i.test(String(vehicle.model)) || /\bgen(?:eration)?\b/i.test(String(vehicle.model))) return vehicle;
  const gp = genPhraseOf(rawText);
  if (!gp) return vehicle;
  const g = generationForPhrase(vehicle.make, vehicle.model, gp);
  const bits = new Set(gp.text.toLowerCase().split(/[\s.-]+/).filter(Boolean)), isBit = w => bits.has(w) || /^(?:\d{1,2}(?:st|nd|rd|th)|mk\.?\d{1,2}|mark\d{1,2}|gen\d{1,2})$/i.test(w);
  const left = String(vehicle.trim || "").split(/\s+/).filter(w => w && !isBit(w.toLowerCase())).join(" ");   // the trim without the phrase's own words ("C63 1ST" is "C63")
  const out = { ...vehicle, generationPhrase: { text: gp.text, code: g.row ? g.row.code : null, why: g.row ? null : g.why } };
  out.trim = left || (g.row ? g.row.code : null);
  return out;
}

// The chat's search tool fills make, model, generation, trim and years from the model's own memory. When the buyer's words carry a generation phrase, the table decides: a row sets the generation and its years
// (unless the buyer stated years), a car with no row gets no trim and no years the buyer did not say. A trim stays only when the buyer's own words contain it. Returns the filters to search with.
export function guardGenPhraseFilters(p, lastUser, saidYears = false) {
  const words = String(lastUser || "");
  const gp = genPhraseOf(words) || genPhraseOf(String(p && p.generation || ""));
  if (!p || !gp || !p.make || !p.model) return p;
  const g = generationForPhrase(p.make, p.model, gp), q = { ...p }, low = words.toLowerCase();
  if (q.trim && squash(q.trim) !== squash(g.row && g.row.code) && !saidWord(low, q.trim)) delete q.trim;   // a whole word of theirs ("rs" is not in "first")
  if (g.row) {
    q.generation = g.row.code;
    if (!saidYears) { q.year_min = g.row.yearStart; q.year_max = g.row.yearEnd; }
  } else {
    if (q.generation && genPhraseOf(String(q.generation))) delete q.generation;
    if (!saidYears) { delete q.year_min; delete q.year_max; }
  }
  return q;
}

// A TRIM THE READER DID NOT SAY IS NOT APPLIED (Lane B, Nov 1 2026): the chat's search tool fills trim from memory ("Ford Capri" became trim RS). A trim stays only when the buyer's words carry it
// (every word of it as a whole word, or a squashed trim of four letters or more inside the squashed words: "GT-3" for GT3) or when the search already carried it from an earlier turn (prevTrim).
export function saidTrim(lastUser, trim) {
  const w = String(lastUser || "").toLowerCase(), t = String(trim || "").toLowerCase().trim(); if (!t) return false;
  const sq = x => x.replace(/[^a-z0-9]/g, "");
  return t.split(/[^a-z0-9]+/).filter(Boolean).every(x => saidWord(w, x)) || (sq(t).length >= 3 && sq(w).includes(sq(t)));
}
// YEARS THE READER DID NOT SAY ARE NOT APPLIED (Lane B, Nov 1 2026): the tool's year_min and year_max stay only when the buyer's words carry a year, a range or a decade (said), or the search already carried
// the same years (prev). A generation phrase sets its own years from the table (guardGenPhraseFilters), after this.
export function dropUnsaidYears(p, said, prev) {
  if (!p || (!p.year_min && !p.year_max) || said) return p;
  if (prev && (Number(prev.year_min) || 0) === (Number(p.year_min) || 0) && (Number(prev.year_max) || 0) === (Number(p.year_max) || 0)) return p;
  const q = { ...p }; delete q.year_min; delete q.year_max; return q;
}
export function dropUnsaidTrim(p, lastUser, prevTrim) {
  if (!p || !p.trim || !String(lastUser || "").trim()) return p;
  if (saidTrim(lastUser, p.trim) || (prevTrim && String(prevTrim).toLowerCase() === String(p.trim).toLowerCase())) return p;
  const q = { ...p }; delete q.trim; return q;
}
// A whole word of the buyer's own ("rs" is not in "first"). Used by the trim guards that ask whether the buyer said a trim.
export function saidWord(words, w) {
  const x = String(w || "").toLowerCase().trim(); if (!x) return false;
  return new RegExp("(?:^|[^a-z0-9])" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:[^a-z0-9]|$)").test(String(words || "").toLowerCase());
}
