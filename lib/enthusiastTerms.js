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

// the 911 family by year (the impact-bumper and long-hood terms): model 911 (or 930 for the Turbo; 912 where named) inside the years,
// and the 964 / 993 / 996 and later never: a model year 1989 car that the title or model names 964 or Carrera 4 is the 964 (it started
// with model year 1989), so it is left out of the impact-bumper cars; a 1989 car that names neither is a 3.2 Carrera and stays in
function elevenYears(c, models, from, to, { dropFirst964 = false } = {}) {
  const model = squash(c.model), titleRaw = String(c.title || "");
  let year = Number(c.year);
  if (!(year > 1900)) { const m = /\b(19[4-9]\d|20[0-3]\d)\b/.exec(titleRaw); year = m ? Number(m[1]) : null; }
  if (!year || year < from || year > to) return false;
  const named = model ? models.some(x => model.startsWith(x)) : models.some(x => new RegExp("\\b" + x + "\\b").test(titleRaw));
  if (!named) return false;
  if (/^(964|993|996|997|991|992)/.test(model)) return false;
  if (dropFirst964 && year === 1989 && (/\b964\b|\bcarrera\s?4\b|\bC4\b/i.test(titleRaw) || /^964/.test(model))) return false;
  return true;
}
const MB = ["mercedesbenz", "mercedes", "mb"];
function mercedesKind(c) {
  const model = squash(c.model), t = String(c.title || ""), tl = t.toLowerCase();
  let year = Number(c.year);
  if (!(year > 1900)) { const m = /\b(19[4-9]\d|20[0-3]\d)\b/.exec(t); year = m ? Number(m[1]) : null; }
  if (/\bponton\b/.test(tl)) return "ponton";
  if (/\b(fintail|fin tail|heckflosse)\b/.test(tl)) return "fintail";
  if (!year) return null;
  const base = model || squash(t.replace(/^.*?(mercedes[-\s]?benz|mercedes)\s*/i, "").split(/\s+/)[0]);
  // the models that are NOT either: the 190 SL roadster, the 190 E and later 190s, and every other class
  if (/^190sl/.test(base)) return null;
  const n = base.replace(/^(\d{3}).*/, "$1");
  const suffix = base.replace(/^\d{3}/, "");
  // PONTON (the unibody sedans, coupes and cabriolets, model years 1953 to 1962): 180 (1953 to 1962), 190 and 190D (1956 to 1961),
  // 219 (1956 to 1959), 220, 220S and 220SE (1953 to 1958; the coupe and cabriolet to 1960)
  if (n === "180" && year >= 1953 && year <= 1962) return "ponton";
  if (n === "190" && /^(d|)$/.test(suffix) && year >= 1956 && year <= 1960) return "ponton";
  if (n === "219" && year >= 1956 && year <= 1959) return "ponton";
  if (n === "220" && /^(s|se|)$/.test(suffix) && year >= 1953 && year <= 1958) return "ponton";
  if (n === "220" && /^(s|se)$/.test(suffix) && year >= 1959 && year <= 1960 && /coupe|cabriolet|convertible/i.test(t)) return "ponton";
  // FINTAIL (the W110, W111 and W112 sedans, coupes and cabriolets, model years 1959 to 1968): 190 and 190D (1961 to 1965), 200 and 200D
  // (1965 to 1968), 230 and 230S (1965 to 1968), 220b, 220Sb, 220SEb (1960 to 1965), 250S and 250SE (1965 to 1968), 300SE (1961 to 1965).
  // A 220 of 1959 is on the edge of both bodies and is in neither unless its title says ponton or fintail.
  if (n === "190" && /^(d|)$/.test(suffix) && year >= 1961 && year <= 1965) return "fintail";
  if (n === "200" && /^(d|)$/.test(suffix) && year >= 1965 && year <= 1968) return "fintail";
  if (n === "230" && /^(s|)$/.test(suffix) && year >= 1965 && year <= 1968) return "fintail";
  if (n === "220" && /^(b|sb|seb|s|se|)$/.test(suffix) && year >= 1960 && year <= 1965 && !(year <= 1960 && /^(s|se)$/.test(suffix) && /coupe|cabriolet|convertible/i.test(t))) return "fintail";
  if (n === "250" && /^(s|se)$/.test(suffix) && year >= 1965 && year <= 1968) return "fintail";
  if (n === "300" && /^se/.test(suffix) && year >= 1961 && year <= 1965) return "fintail";
  return null;
}

export const TERMS = [
  { key: "air-cooled", re: /\bair[\s-]?cooled\b/i, makes: ["porsche"], context: /\b(porsche|911|356|912|914|930|964|993|boxster|cayman)\b/i, label: "air-cooled", models: ["911", "356", "912", "914", "930"],
    defn: "an air-cooled Porsche: the 911 through model year 1998 (the 993; also the 964, 993 and 930 by name), the 356, 912 and 914",
    short: "the 911 through 1998, the 356, 912, 914 and 930",
    match: c => porscheKind(c) === "air" },
  { key: "water-cooled", re: /\bwater[\s-]?cooled\b/i, makes: ["porsche"], context: /\b(porsche|911|996|997|991|992|boxster|cayman)\b/i, label: "water-cooled", models: ["911", "Boxster", "Cayman"],
    defn: "a water-cooled Porsche: the 911 from model year 1999 (the 996, 997, 991 and 992), the Boxster and the Cayman",
    short: "the 911 from 1999 (996, 997, 991, 992), the Boxster and the Cayman",
    match: c => porscheKind(c) === "water" },
  // "G-body" is the same cars (the G series, 1974 to 1989); in GM's world it is the Regal and Monte Carlo, so it counts only in a Porsche context
  { key: "impact-bumper", re: /\b(impact[\s-]?bumpers?|g[\s-]?bod(?:y|ies))\b/i, makes: ["porsche"], context: /\b(porsche|911|930)\b/i, label: "impact-bumper", models: ["911", "930"],
    yearChips: [1975, 1980, 1986], yearAsk: "1974 to 1977, 1978 to 1983 or 1984 to 1988", defn: "an impact-bumper Porsche: the 911 and the 930 Turbo, model years 1974 through 1989",
    short: "the 911 and the 930 Turbo, model years 1974 through 1989 (the 964 starts with model year 1989 and is not one)",
    match: c => elevenYears(c, ["911", "930"], 1974, 1989, { dropFirst964: true }) },
  { key: "long-hood", re: /\blong[\s-]?hoods?\b/i, makes: ["porsche"], context: /\b(porsche|911|912)\b/i, label: "long-hood", models: ["911", "912"],
    yearChips: [1965, 1969, 1973], yearAsk: "1964 to 1973, one pool for all", defn: "a long-hood Porsche: the 911 and 912, model years 1964 through 1973",
    short: "the 911 and 912, model years 1964 through 1973 (before the impact bumpers)",
    match: c => elevenYears(c, ["911", "912"], 1964, 1973) },
  { key: "ponton", re: /\bpontons?\b/i, makes: MB, context: /\b(mercedes|benz|180|190|219|220)\b/i, label: "ponton", models: ["180", "190", "219", "220"],
    defn: "a ponton Mercedes-Benz: the 180, 190, 219 and 220 (220S and 220SE) of model years 1953 through 1962",
    short: "the 180, 190, 219 and 220 of 1953 through 1962",
    match: c => mercedesKind(c) === "ponton" },
  { key: "fintail", re: /\bfin[\s-]?tails?\b/i, makes: MB, context: /\b(mercedes|benz|190|200|220|230|250|300)\b/i, label: "fintail", models: ["190", "200", "220", "230", "250", "300SE"],
    defn: "a fintail Mercedes-Benz: the W110, W111 and W112 (190, 200, 220, 230, 250 and 300SE) of model years 1959 through 1968",
    short: "the 190, 200, 220, 230, 250 and 300SE of 1959 through 1968",
    match: c => mercedesKind(c) === "fintail" }
];

// the terms the words name for this make (or, with no make yet, the ones whose own context the words carry); [] when none
export function enthusiastTermsIn(text, make) {
  const t = String(text || ""), mk = squash(make);
  return TERMS.filter(x => x.re.test(t) && (mk ? x.makes.includes(mk) : (x.context ? x.context.test(t) : true)));
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
