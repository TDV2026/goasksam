// One shared car-title helper (Lane C, Oct 2026): a listing or resolved name in the case a person would
// write it. Shouting words read in proper case ("SPORT" -> "Sport", "COUPE" -> "Coupe"); badges and codes
// stay as the maker writes them (xDrive35i, sDrive28i, GT3 RS, Z06, SS, GTS, M3, AMG, E46, 911S). Words
// already in mixed or lower case are left as written. Used by Buy's cards today; Market Check and Tasks
// can import the same function (see docs/lane-notes.md).
const UPPER = new Set(["BMW", "AMG", "GT", "GTS", "GTI", "GTO", "GTR", "GT-R", "RS", "RSR", "SS", "SRT", "TRD", "SVT", "SHO", "STI", "WRX", "BRZ", "NSX", "CSL", "CS", "SL", "SLK", "SLS", "SLR", "CL", "CLK", "CLS", "SEL", "SEC", "SE", "LE", "LX", "GX", "RC", "TT", "TTS", "XJ", "XJS", "XK", "XKR", "XJR", "DB", "SUV", "VW", "MG", "GMC", "AMC", "TVR", "AWD", "4WD", "FWD", "RWD", "TDI", "V6", "V8", "V10", "V12", "LS", "LT", "ZR", "ZL", "RT", "RX", "SC", "SVR", "SVJ", "LP", "TS", "HSE", "HPE", "ST", "R", "S", "M", "GL", "GLE", "GLS", "GLC", "ML", "MX", "NA", "NB", "ND", "JCW", "SRX", "CTS", "XLR", "ZHP", "CSi", "IROC", "SSR", "USA", "UK", "US", "II", "III", "IV", "VI", "4MATIC"]);
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
  return String(t == null ? "" : t).split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : part.split("-").map(word).join("-")).join("");
}
