// WHY A TAXONOMY MODEL HAS NO PRODUCTION YEARS, AND WHERE ITS YEARS CAN HONESTLY COME FROM (Lane B, Oct 29 2026). Four buckets, each model in exactly one:
//   noise  (d) not a car model: a listing title, a list of several models in one name, a year in the name, a motorcycle, a replica or tribute;
//   exact  (b) in the Daily Vroom calculator's list under a different spelling: the same name after folding case, accents, hyphens and spaces ("300 SL" and "300SL"), years from that entry;
//   variant(c) a trim, body style or variant of a model that already has years: the name extends that model by a whole word, by digits ("SL" + "55") or by a leading code ("240" + "Z"); it inherits the parent's years;
//   absent (a) none of the above: the calculator does not have it (years from a public source, or left unfilled and listed).
// Nothing here guesses: (b) needs an exact fold match, (c) a parent that already has years.
import { calculatorYearsFor, calculatorEntries, mergeRanges } from "./calculatorYears.js";
export const foldCompact = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
export const foldWords = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const baseCompact = s => foldCompact(s).replace(/(class|series)$/, "");
const MOTORCYCLE_MAKES = new Set(["harleydavidson", "ducati", "yamaha", "kawasaki", "vespa", "indian", "norton", "bsa", "vincent", "broughsuperior", "mvagusta", "aprilia", "moto guzzi", "motoguzzi", "royalenfield", "lambretta", "innocenti"]);
const NOISE = /(,|&|\band\b|\/)\s*\S|recreation|tribute|replica|project|powered|\b\d+\s?-?\s?mile|years?\s?owned|owned\b|motorcycle|\b\d+\s?cc\b|^other\b|^unknown/i;
const HONDA_BIKE = /^(cb|cbr|cbx|cl|ct|cx|gl|xl|xr|cr|crf|atc|vf|vt|vfr|nc|nt|st|trx|sl|mt|z50|ca|c7|c1|s9)\d*[a-z]?$|^(gold wing|elsinore|benly|dream|super cub|monkey|rebel|shadow|magna|interceptor|nighthawk|hawk|ascot|aero|spree|elite|helix|metropolitan|ruckus|fourtrax|odyssey)$/i;
const BMW_BIKE = /^(r|k|f|g|s|c)\s?\d{2,4}(\s?[a-z]{1,4})?$/i;
export function isNoise(make, name) {
  const n = String(name || ""), mk = foldCompact(make);
  if (/\b(19|20)\d{2}\b/.test(n) && n.trim().split(/\s+/).length >= 4) return "a listing title (a year in a long name)";   // a year in a short name is a model: the BMW 2002
  if (n.length > 34 || NOISE.test(n)) return "listing title, a list of models or a non-car word";
  if (MOTORCYCLE_MAKES.has(mk)) return "motorcycle make";
  if (mk === "honda" && HONDA_BIKE.test(n.trim())) return "Honda motorcycle or scooter";
  if (mk === "bmw" && BMW_BIKE.test(n.trim())) return "BMW motorcycle";
  return null;
}
// the model's years from an exact fold match to a calculator entry (b), else null
export function exactCalculatorMatch(make, name) {
  const want = foldCompact(name), wantB = baseCompact(name); if (!want) return null;
  const entries = calculatorEntries(make); const hits = entries.filter(e => foldCompact(e[0]) === want || (wantB && baseCompact(e[0]) === wantB));
  if (!hits.length) return null;
  return { match: hits.map(h => h[0]).join(" | "), ranges: mergeRanges(hits.map(h => [h[1], h[2]])) };
}
// the parent among models that already have years: `known` is a Map of display name -> ranges
export function variantParent(name, known) {
  const w = foldWords(name), c = foldCompact(name); let best = null;
  for (const [pn, pr] of known) {
    const pw = foldWords(pn), pc = baseCompact(pn), letters = /^[a-z]+$/.test(pc); if (!pc || pc === c) continue;
    // a whole-word extension needs a parent of 3 letters or more ("CR" is not the parent of "CR-Z"); the digit and code rules need a parent of letters only ("SL" + "55", "240" + "Z", never "7" + "00")
    const word = pc.length >= 3 && w.startsWith(pw + " ");
    const digits = letters && pc.length >= 1 && c.startsWith(pc) && /^\d+$/.test(c.slice(pc.length)) && c.length > pc.length;
    const code = letters && pc.length >= 1 && c.endsWith(pc) && /^\d+$/.test(c.slice(0, c.length - pc.length)) && c.length > pc.length;
    if ((word || digits || code) && (!best || pc.length > best.len)) best = { parent: pn, ranges: pr, len: pc.length };
  }
  return best;
}
export function bucketOf(make, name, known) {
  const noise = isNoise(make, name); if (noise) return { bucket: "noise", why: noise };
  const ex = exactCalculatorMatch(make, name); if (ex) return { bucket: "exact", match: ex.match, ranges: ex.ranges };
  const v = variantParent(name, known || new Map()); if (v) return { bucket: "variant", parent: v.parent, ranges: v.ranges };
  return { bucket: "absent" };
}

// years filled from a public source for models the calculator does not have (data/modelYearsFilled.json: { "<make slug>": { "<model>": { ranges, source, date, ... } } }), written by scripts/fillModelYears.mjs, one entry per model with its source and date
import fs from "node:fs";
let FILLED = null;
function loadFilled() { if (FILLED) return FILLED; try { FILLED = JSON.parse(fs.readFileSync(new URL("../data/modelYearsFilled.json", import.meta.url), "utf8")).models || {}; } catch { FILLED = {}; } return FILLED; }
export function filledYearsFor(make, name) {
  const mk = loadFilled()[foldCompact(make)]; if (!mk) return null;
  const key = Object.keys(mk).find(k => foldCompact(k) === foldCompact(name));
  return key ? mk[key].ranges : null;
}
