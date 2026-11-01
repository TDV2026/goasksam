// ONE DISPLAY RULE FOR A CHIP LABEL (Lane B, Oct 31 2026). A model, generation, trim or body chip prints the way the model is normally written: "M8", "GT3", "RS6", "300SL", "E-Type", "Land Cruiser", never "m8".
// CAUSE of the live "2024 BMW" chip "m8": a record's model or model_family value reaches the chip as the record wrote it (buildAskModels fell back to the normalised lowercase key), and nothing between the source and the page set the case.
// RULE (display only; a label that already carries a capital is printed as it is, only a label with none is cased):
//   - a token with a digit and letters ("m8", "gt3", "300sl", "sl55", "e30") is upper case; a one or two letter token ("m", "gt", "sl") is upper case;
//   - a three letter token that is a known model code ("gto", "gts", "amg", "nsx", "wrx", "sti", "crx", "cls", "clk", "slk", "sls") is upper case;
//   - any other word is capitalised ("land cruiser" is "Land Cruiser", "bel air" is "Bel Air"), each part of a hyphen or slash joined word on its own ("e-type" is "E-Type", "8-series" is "8-Series");
//   - small joining words inside a name ("of", "de", "la", "and", "the") stay lower case after the first word.
// Values, keys and queries are never changed: only the text a reader sees.
const CODES = new Set(["gto", "gts", "gti", "gtr", "gtv", "gt", "amg", "nsx", "wrx", "sti", "crx", "cls", "clk", "slk", "sls", "slr", "xjs", "xkr", "xk", "xj", "rs", "csl", "cs", "cx", "mr", "ls", "lt", "ss", "rt", "srt", "svt", "ford", "gl", "ml", "gle", "glc", "gla", "glb", "glk", "cla", "slc", "suv", "ev", "tt", "tts", "ttrs", "dbs", "db", "xt", "sc", "gs", "is", "es", "rx", "nx", "ux", "lx", "rc", "lc", "ct"]);
CODES.delete("ford");
const SMALL = new Set(["of", "de", "la", "le", "and", "the", "du", "des", "von", "van"]);
const part = (w, first) => {
  if (!w) return w;
  if (/\d/.test(w) && /[a-z]/i.test(w) && w.length <= 7 && !/^\d+(st|nd|rd|th)$/i.test(w)) return w.toUpperCase();
  const lw = w.toLowerCase();
  if (/^[a-z]{1,2}$/i.test(w) && !SMALL.has(lw)) return w.toUpperCase();
  if (CODES.has(lw)) return w.toUpperCase();
  if (!first && SMALL.has(lw)) return lw;
  return lw.charAt(0).toUpperCase() + lw.slice(1);
};
const BMW_I = /^i(\d|x)\d*$/i;   // the maker writes its electric models i3, i8, iX
const NUM_SUFFIX = /^[a-z]{0,2}\d{2,4}(tii|ti|csi|ci|xi|is|si|i|d|e|hp|cc|ps)$/i;   // 2002tii, 635CSi, 320i, 850i, 535xi, 325is, 330ci, 20hp: the maker writes a small lowercase suffix after the digits, so it stays
const numSuffix = w => { const m = NUM_SUFFIX.test(w) && /^([a-z]{0,2})(\d{2,4})([a-z]+)$/i.exec(w); return m ? m[1].toUpperCase() + m[2] + (m[3].toLowerCase() === "csi" ? "CSi" : m[3].toLowerCase()) : null; };
const unset = w => /[a-z]/i.test(w) && !/[A-Z]/.test(w);   // a word with letters and no capital: the case was never set
export function chipLabel(label) {
  if (typeof label !== "string") return label;
  const s = label.trim();
  if (!s || /[A-Z]/.test(s) || !s.split(/[\s\-/]+/).some(unset)) return label;   // a label with any capital was cased by whoever wrote it ("Not sure", "M8 competition"): as written
  return s.split(/(\s+)/).map((tok, i) => /^\s+$/.test(tok) ? tok : (BMW_I.test(tok) ? "i" + tok.slice(1).toUpperCase() : numSuffix(tok) ? numSuffix(tok) : tok.split(/([-/])/).map((p, j) => /^[-/]$/.test(p) || !unset(p) ? p : part(p, i === 0 && j === 0)).join(""))).join("");
}
// the chip lists and labelled options of an answer or a question, with their text cased; values, queries and counts are untouched
const LISTS = ["modelOptions", "trimChips", "chips"], LABELLED = ["trimOptions", "generationOptions", "bodyOptions", "variantOptions", "refineOptions", "gearboxOptions"];
export function casedChips(d) {
  if (!d || typeof d !== "object") return d;
  let out = d;
  const put = (k, v) => { if (out === d) out = { ...d }; out[k] = v; };
  for (const k of LISTS) if (Array.isArray(d[k]) && d[k].some(x => typeof x === "string" && chipLabel(x) !== x)) put(k, d[k].map(x => typeof x === "string" ? chipLabel(x) : x));
  for (const k of LABELLED) if (Array.isArray(d[k]) && d[k].some(o => o && typeof o.label === "string" && chipLabel(o.label) !== o.label)) put(k, d[k].map(o => o && typeof o.label === "string" ? { ...o, label: chipLabel(o.label) } : o));
  return out;
}
