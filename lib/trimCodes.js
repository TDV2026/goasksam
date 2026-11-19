// TRIM CODES THE RESOLVER READS AS THE TRIM'S FULL NAME (Lane B, Oct 30 2026, the Unmet demand table: "2016 Porsche 911 C4S" read "No sale of a Porsche 911 C4S has been tracked yet.", "2007 BMW Z4 3.0" asked which Z4).
// Owners and sellers type the short code ("C4S", "Z4 3.0"); the sales are filed under the full name ("Carrera 4S", "3.0si"). One table, applied to the typed text before the resolver reads it, each rule gated to the car it is true of:
//   Porsche 911 (the text names Porsche or a 911 chassis code): C2 is the Carrera, C2S the Carrera S, C4 the Carrera 4, C4S the Carrera 4S.
//   BMW Z4 with a year: "3.0" is the 3.0i in 2003 to 2005 and the 3.0si from 2007 (2006 carried both, so it is left alone); "2.5" is the 2.5i in 2003 to 2005.
// A code outside its car (an Audi C4, a C4 Corvette) is never touched: each rule needs its make's word in the text.
export const TRIM_CODE_RULES = [
  { name: "porsche-c4s", when: t => /\b(porsche|911|99[3-7]|991|992|964|930)\b/i.test(t), apply: t => t.replace(/\b(?:carrera\s+)?c2s\b/gi, "Carrera S").replace(/\b(?:carrera\s+)?c4s\b/gi, "Carrera 4S").replace(/\b(?:carrera\s+)?c4\b/gi, "Carrera 4").replace(/\b(?:carrera\s+)?c2\b/gi, "Carrera") },
  { name: "bmw-z4-engine", when: t => /\bz4\b/i.test(t) && /\b(19|20)\d\d\b/.test(t), apply: t => {
    const y = Number((/\b((?:19|20)\d\d)\b/.exec(t) || [])[1]);
    if (y >= 2003 && y <= 2005) return t.replace(/\b3\.0(?![\w.])/g, "3.0i").replace(/\b2\.5(?![\w.])/g, "2.5i");
    if (y >= 2007 && y <= 2008) return t.replace(/\b3\.0(?![\w.])/g, "3.0si");
    return t; } }
];
export function expandTrimCodes(text) {
  let t = String(text == null ? "" : text);
  for (const r of TRIM_CODE_RULES) { try { if (r.when(t)) t = r.apply(t); } catch { /* a rule never blocks the resolver */ } }
  return t;
}
