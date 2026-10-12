// One shared car-title helper (Lane C, Oct 2026): a listing or resolved name in the case a person would
// write it. Shouting words read in proper case ("SPORT" -> "Sport", "COUPE" -> "Coupe"); badges and codes
// stay as the maker writes them (xDrive35i, sDrive28i, GT3 RS, Z06, SS, GTS, M3, AMG, E46, 911S). Words
// already in mixed or lower case are left as written. Used by Buy's cards today; Market Check and Tasks
// can import the same function (see docs/lane-notes.md).
const UPPER = new Set(["BMW", "AMG", "GT", "GTS", "GTI", "GTO", "GTR", "GT-R", "RS", "RSR", "SS", "SRT", "TRD", "SVT", "SHO", "STI", "WRX", "BRZ", "NSX", "CSL", "CS", "SL", "SLK", "SLS", "SLR", "CL", "CLK", "CLS", "SEL", "SEC", "SE", "LE", "LX", "GX", "RC", "TT", "TTS", "XJ", "XJS", "XK", "XKR", "XJR", "DB", "SUV", "VW", "MG", "GMC", "AMC", "TVR", "AWD", "4WD", "FWD", "RWD", "TDI", "V6", "V8", "V10", "V12", "LS", "LT", "ZR", "ZL", "RT", "RX", "SC", "SVR", "SVJ", "LP", "TS", "HSE", "HPE", "ST", "R", "S", "M", "GL", "GLE", "GLS", "GLC", "ML", "MX", "NA", "NB", "ND", "JCW", "SRX", "CTS", "XLR", "ZHP", "CSi", "IROC", "SSR", "USA", "UK", "US", "II", "III", "IV", "VI", "4MATIC",
  // DTM (Round 5 Lane B job, Oct 2026): the touring-car-racing-derived CLK DTM badge - was falling
  // through to the generic all-caps-to-titlecase rule below ("DTM" -> "Dtm") since it was never in
  // this set. All-caps model designators stay all caps, same as every other entry here.
  "DTM"]);
function word(w) {
  if (!w) return w;
  if (/^[xs]drive\d*[a-z]*$/i.test(w)) { const m = /^([xs])drive(\d*)([a-z]*)$/i.exec(w); return m[1].toLowerCase() + "Drive" + m[2] + m[3].toLowerCase(); }
  // BMW-style engine suffixes read lower case (328I -> 328i, 35I -> 35i, 525D -> 525d, 325XI -> 325xi);
  // any other letter after digits is a badge and stays upper (4S, 911S, 2002TII stays as written).
  if (/^\d+(i|d|e|xi|ci|si|ti|is|ix)$/i.test(w)) return w.replace(/[a-z]+$/i, s => s.toLowerCase());
  // A known badge already in capitals stays in capitals (never proper-cased); lower-case words are left alone.
  if (w === w.toUpperCase() && UPPER.has(w)) return w === "CSI" ? "CSi" : w;
  if (/\d/.test(w)) return /[a-z]/.test(w) && /[A-Z]/.test(w) ? w : w.toUpperCase();   // GT3, Z06, M3, E46 (mixed case kept: 911Turbo)
  if (/^[A-Z]{2,}$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase();             // SPORT -> Sport
  return w;
}
export function humanTitle(t) {
  let s = String(t == null ? "" : t);
  // SELLER PREFIX (job 10, trim-fence sweep, Oct 2026): a card must show year/make/model/trim only -
  // a seller's own flourish ahead of the car ("Individual Midnight Blue Slicktop 2004 BMW M3 Coupe",
  // sometimes with a leading comma from a truncated longer phrase) must never display. Every real
  // listing title names a year; anything before the FIRST one is seller text, not the car, so it is
  // dropped. A title with no year at all (rare; some house titles) is left untouched - nothing to
  // anchor on, and the original is still more informative than a guess.
  const yearAt = s.search(/\b(19|20)\d{2}\b/);
  if (yearAt > 0) s = s.slice(yearAt);
  // Half-year designator garbling (Oct 2026): a mid-year model (the famous 1964½ Mustang) sometimes
  // files with a stray " .5" token next to the year, occasionally duplicated elsewhere in the same
  // title ("1964 .5 FORD .5 MUSTANG 260"). Merge the first one onto the year as the real glyph; any
  // further " .5" token is the same artifact repeated, dropped rather than shown twice.
  let halfYear = false;
  s = s.replace(/\b(\d{4})\s+\.5\b/, (m, y) => { halfYear = true; return y; }).replace(/\s+\.5\b/g, "");
  if (halfYear) s = s.replace(/\b(\d{4})\b/, "$1½");
  // Dangling open bracket (Oct 2026): some upstream listing titles are themselves cut off mid paint-
  // code parenthetical ("...Gullwing (PB26", the source field truncated before OCD ever reached us -
  // confirmed by tracing raw_title to the listing_title column itself, not a slice in this file or the
  // card builder). We cannot recover the missing text, but a title must never render with an unclosed
  // "(" - strip a trailing "(" and everything after it only when no matching ")" follows it.
  s = s.replace(/\s*\([^)]*$/, "");
  // No leading or trailing punctuation (job 10): strip stray commas/dashes/quotes/whitespace left over
  // at either end (from the stripped prefix above, or already present in the source title). ")" is
  // EXCLUDED from the trailing class (Oct 2026, dangling-open-bracket job): a title legitimately
  // ending in a closed parenthetical ("...Carrera S (997.1)") was having just its closing ")" stripped
  // here, which turned a complete, balanced bracket into exactly the "ends in an open bracket" symptom
  // this file now explicitly guards against above - the real unclosed-paren case is already handled by
  // the dangling-open-bracket strip two lines up, so this class no longer needs to touch ")" at all.
  s = s.replace(/^[\s,;:.\-–—"'()]+/, "").replace(/[\s,;:.\-–—"']+$/, "");
  return s.split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : part.split("-").map(word).join("-")).join("");
}
