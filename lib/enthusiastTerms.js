// ENTHUSIAST GROUP TERMS (Sam's order, Oct 23 2026: "air cooled Porsche" returned all 167 Porsches; the words were silently dropped).
// One module, one definition per term, read by the resolver (Market Check, Sell, Tasks asks) and by Buy's live search (Buy and Tasks):
//   air-cooled Porsche   = the 911 through model year 1998 (the 993), the 964, 993 and 930 by name, the 356, 912 and 914.
//   water-cooled Porsche = the 911 from model year 1999 (the 996 on: 996, 997, 991, 992), the Boxster and the Cayman.
// Left out of both on purpose, said plainly where it matters: the front-engined 924, 928, 944 and 968, the Cayenne, Panamera and
// Macan (water-cooled but not what the enthusiast term means), the Taycan, and the early racing cars (550, 718 RSK, 904, 906, 917).
// A listing whose model or year cannot be read is NOT counted in a group (counted by the report, never guessed).
const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function porscheKind(c) {
  const model = squash(c.model), titleRaw = String(c.title || "");
  let year = Number(c.year);
  if (!(year > 1900)) { const m = /\b(19[4-9]\d|20[0-3]\d)\b/.exec(titleRaw); year = m ? Number(m[1]) : null; }
  // the model field when it has one, else the title's own words
  const has = re => (model ? re.test(model) : false);
  const inTitle = re => (!model && re.test(titleRaw));
  // the named bodies carry their own cooling: 356, 912, 914, 930 (the 911 Turbo), 964 and 993 are air-cooled; 996, 997, 991, 992 water-cooled
  if (has(/^(356|912|914|930|964|993)/) || inTitle(/\b(356|912|914|930|964|993)\b/)) return "air";
  if (has(/^(996|997|991|992)/) || inTitle(/\b(996|997|991|992)\b/)) return "water";
  if (has(/boxster|cayman/) || inTitle(/\b(boxster|cayman)\b/i)) return "water";
  if (has(/^911/) || inTitle(/\b911\b/)) { if (!year) return null; return year <= 1998 ? "air" : "water"; }
  return null;
}

export const TERMS = [
  { key: "air-cooled", re: /\bair[\s-]?cooled\b/i, makes: ["porsche"], label: "air-cooled", models: ["911", "356", "912", "914", "930"],
    defn: "an air-cooled Porsche: the 911 through model year 1998 (the 993; also the 964, 993 and 930 by name), the 356, 912 and 914",
    short: "the 911 through 1998, the 356, 912, 914 and 930",
    match: c => porscheKind(c) === "air" },
  { key: "water-cooled", re: /\bwater[\s-]?cooled\b/i, makes: ["porsche"], label: "water-cooled", models: ["911", "Boxster", "Cayman"],
    defn: "a water-cooled Porsche: the 911 from model year 1999 (the 996, 997, 991 and 992), the Boxster and the Cayman",
    short: "the 911 from 1999 (996, 997, 991, 992), the Boxster and the Cayman",
    match: c => porscheKind(c) === "water" }
];

// the terms the words name for this make (or, with no make yet, any make the term belongs to); [] when none
export function enthusiastTermsIn(text, make) {
  const t = String(text || ""), mk = squash(make);
  return TERMS.filter(x => x.re.test(t) && (!mk || x.makes.includes(mk)));
}
// the words without the term (what the resolver reads)
export function withoutTerms(text, terms) {
  let t = String(text || "");
  for (const x of terms || []) t = t.replace(x.re, " ");
  return t.replace(/\s+/g, " ").trim();
}
// does one listing or sale belong to every named term? c = { make, model, year, title }
export function termsMatch(terms, c) {
  return (terms || []).every(x => x.match(c));
}
// what a group term says it is, for a plain line ("air-cooled Porsche")
export function termPhrase(terms, make) {
  return [...(terms || []).map(x => x.label), make].filter(Boolean).join(" ");
}
