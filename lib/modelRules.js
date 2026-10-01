// CURATED MODEL RULES (Part 1, Oct 2026). One file, plain data. The question engine consults this
// BEFORE offering any clarifying chip (Rule 1), for gearbox (Rule 2), for real names (Rule 3), and
// the pool guard reads year-gating + the deny map (Rule 5). Hand-curated truth about what each car
// actually came with. Nothing here is computed from a live query.
//
// STRUCTURE (post-review):
//   make, model, family (archive model_family), canonical (display name), aliases[]
//   bodyNames { internalBody: chipLabel }        marque body names on chips (Ferrari/Jaguar/etc.)
//   poolTerms []                                  extra title tokens that belong to this pool (D50 family)
//   replicaSeparate true                         originals vs replicas/continuations are NEVER one range
//   specialEditions [RegExp]                      model-wide tag+exclude patterns (Rule 7)
//   generations[] {
//     code (UPPERCASE display), years:[start,end] US MODEL YEARS (year-gate AND chip years),
//     bodies:[internalBody...],
//     gearbox:[gearbox_type...]                   gearboxes THIS GENERATION offered ([] = never ask),
//     trims:[ { name, bodies?:[...], gearbox?:[...], years?:[s,e], tag?:true } ]
//                                                  a trim may restrict body/gearbox/years; tag:true =
//                                                  tag+exclude from the base range (a special edition)
//   }
// Body-lock is PER model+generation via trim.bodies (never a global keyword). Gearbox is PER
// generation (and per trim where trim.gearbox is set), never per model.
// internal bodies: sedan, coupe, convertible, targa, wagon, truck. gearbox_type: manual,
// automated_manual, dual_clutch, automatic, cvt.

// GLOBAL restomod / replica / continuation set, applied to EVERY make. A tagged car never enters a
// standard headline range (Rule 4/7). WHOLE-WORD only, and each tag is SKIPPED when its word is the
// sale's own make or model (Fix 1): "Eagle" is a restomod builder for a Jaguar but a real make/model
// for AMC Eagle and Eagle Talon; "Singer" is a Porsche restomancer but a real British make (Gazelle/
// Vogue/Chamois). "Holman" is NOT global (Holman Moody built real cars; the Ford GT Holman Moody
// Heritage is a genuine Ford special) - it lives only in the GT40 replica rule with a post-1969 year.
// Each entry: { re (whole-word), word (lowercase token for the own-make/model + known-make skip) }.
// GENERIC builder/condition words apply to EVERY make. NAMED builders are make-scoped (change 2):
// a builder tag fires only when the sale's make (or make+model) is in the builder's `makes` set, so
// "Eagle" tags a Jaguar restomod but never AMC Eagle / Eagle Talon; "Singer" tags a Porsche but never
// a Singer Gazelle; the Cobra/GT40 kit builders tag only those cars. `makes` entries are norm(make)
// or norm(make)+"|"+norm(model).
export const RESTOMOD_TAGS = [
  { re: /\breplica\b/i, word: "replica" }, { re: /\btribute\b/i, word: "tribute" },
  { re: /\bcontinuation\b/i, word: "continuation" }, { re: /\bre-?creation\b/i, word: "recreation" },
  { re: /\brestomod\b/i, word: "restomod" }, { re: /\bresto-mod\b/i, word: "restomod" },
  { re: /\breimagined\b/i, word: "reimagined" },
  { re: /\bbackdate\b/i, word: "backdate" }, { re: /\bbackdated\b/i, word: "backdated" },
  { re: /\boutlaw\b/i, word: "outlaw" },
  { re: /\belectric\s?conversion\b/i, word: "electric conversion" }, { re: /\bEV\s?conversion\b/i, word: "ev conversion" },
  { re: /\bev-?converted\b/i, word: "ev converted" }, { re: /\btool\s?room\b/i, word: "toolroom" },
  // make-scoped named builders
  { re: /\beagle\b/i, word: "eagle", makes: ["jaguar"] },
  { re: /\bsinger\b/i, word: "singer", makes: ["porsche"] },
  { re: /\bsuperformance\b/i, word: "superformance", makes: ["ford|gt40", "shelby", "ac", "shelby|cobra"] },
  { re: /\bsafir\b/i, word: "safir", makes: ["ford|gt40"] },
  { re: /\bCAV\b/i, word: "cav", makes: ["ford|gt40", "shelby", "ac"] },
  { re: /\bRCR\b/i, word: "rcr", makes: ["ford|gt40", "shelby", "ac"] },
  { re: /\bkirkham\b/i, word: "kirkham", makes: ["shelby", "ac", "shelby|cobra"] }
];

export const MODEL_RULES = [
  // ---- Mercedes-Benz ----------------------------------------------------------------------------
  {
    make: "Mercedes-Benz", model: "S65", family: "S-Class", canonical: "S65 AMG",
    aliases: ["s65", "s 65", "s65 amg"],
    bodyNames: { sedan: "Sedan", coupe: "Coupe", convertible: "Cabriolet" },
    specialEditions: [/final\s?edition/i],
    generations: [
      { code: "W220", years: [2005, 2006], bodies: ["sedan"], gearbox: [] },
      { code: "W221", years: [2007, 2013], bodies: ["sedan"], gearbox: [] },
      { code: "W222", years: [2015, 2020], bodies: ["sedan", "coupe", "convertible"], gearbox: [] }
    ]
  },
  {
    make: "Mercedes-Benz", model: "S-Class", family: "S-Class", canonical: "S-Class",
    aliases: [],
    bodyNames: { sedan: "Sedan", coupe: "Coupe", convertible: "Cabriolet" },
    generations: [
      { code: "W116", years: [1973, 1980], bodies: ["sedan"], gearbox: [] },
      { code: "W126", years: [1981, 1991], bodies: ["sedan"], gearbox: [] },   // SEC coupe is CL/C126 (deny)
      { code: "W140", years: [1992, 1999], bodies: ["sedan"], gearbox: [] },   // coupe is CL/C140 (deny)
      { code: "W220", years: [2000, 2006], bodies: ["sedan"], gearbox: [] },
      { code: "W221", years: [2007, 2013], bodies: ["sedan"], gearbox: [] },
      { code: "W222", years: [2014, 2020], bodies: ["sedan", "coupe", "convertible"], gearbox: [] },
      { code: "W223", years: [2021, 2026], bodies: ["sedan"], gearbox: [] }
    ]
  },
  // ---- BMW --------------------------------------------------------------------------------------
  {
    make: "BMW", model: "M3", family: "M3", canonical: "M3",
    aliases: [],
    bodyNames: { sedan: "Sedan", coupe: "Coupe", convertible: "Convertible" },
    specialEditions: [
      /\bCSL\b/i, /\bGTS\b/i, /\bCRT\b/i, /competition/i, /\bZCP\b/i, /\bCS\b/i,
      /lightweight/i, /\bLTW\b/i, /\bM3\s?GT\b/i, /lime\s?rock/i, /frozen/i, /30\s?jahre/i
    ],
    generations: [
      { code: "E30", years: [1988, 1991], prodYears: [1986, 1991], bodies: ["coupe", "convertible"], gearbox: ["manual"],
        trims: [{ name: "Sport Evolution", bodies: ["coupe"], tag: true }, { name: "Evolution", bodies: ["coupe"], tag: true }] },
      { code: "E36", years: [1995, 1999], prodYears: [1992, 1999], bodies: ["coupe", "convertible", "sedan"], gearbox: ["manual", "automatic"],
        trims: [{ name: "Lightweight", bodies: ["coupe"], tag: true }, { name: "GT", bodies: ["coupe"], tag: true }] },
      { code: "E46", years: [2001, 2006], prodYears: [2000, 2006], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [{ name: "CSL", bodies: ["coupe"], tag: true }, { name: "CS", bodies: ["coupe"], tag: true }] },
      { code: "E9X", years: [2008, 2013], prodYears: [2007, 2013], bodies: ["coupe", "convertible", "sedan"], gearbox: ["manual", "dual_clutch"],
        trims: [{ name: "GTS", bodies: ["coupe"], tag: true }, { name: "CRT", bodies: ["sedan"], tag: true }, { name: "Lime Rock Park", tag: true }] },
      { code: "F80", years: [2015, 2018], prodYears: [2014, 2018], bodies: ["sedan"], gearbox: ["manual", "dual_clutch"],
        trims: [{ name: "Competition", tag: true }, { name: "CS", tag: true }, { name: "30 Jahre", tag: true }] },
      { code: "G80", years: [2021, 2026], bodies: ["sedan"], gearbox: ["manual", "automatic"],
        trims: [{ name: "Competition", tag: true }, { name: "CS", tag: true }] }
    ]
  },
  // ---- Ferrari ----------------------------------------------------------------------------------
  {
    make: "Ferrari", model: "355", family: "355", canonical: "F355",
    aliases: ["f355", "355"],
    bodyNames: { coupe: "Berlinetta", targa: "GTS", convertible: "Spider" },
    specialEditions: [/conversion/i, /serie\s?fiorano/i, /\bchallenge\b/i],   // Challenge = race car
    generations: [
      { code: "F355", years: [1994, 1999], bodies: ["coupe", "targa", "convertible"],
        gearbox: ["manual", { type: "automated_manual", years: [1997, 1999] }] }   // F1 offered 1997-99 only (Fix 3)
    ]
  },
  {
    make: "Ferrari", model: "360", family: "360", canonical: "360",
    aliases: ["360 modena", "360 spider"],
    bodyNames: { coupe: "Modena", convertible: "Spider" },
    specialEditions: [/challenge\s?stradale/i, /360\s?challenge\b/i],
    generations: [
      { code: "360", years: [1999, 2005], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [{ name: "Challenge Stradale", bodies: ["coupe"], gearbox: ["automated_manual"], tag: true }] }
    ]
  },
  {
    make: "Ferrari", model: "F430", family: "430", canonical: "F430",
    aliases: ["f430", "430", "f430 spider"],
    bodyNames: { coupe: "Berlinetta", convertible: "Spider" },
    specialEditions: [/scuderia/i, /\b16M\b/i, /430\s?challenge\b/i],
    generations: [
      { code: "F430", years: [2005, 2009], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [
          { name: "Scuderia", bodies: ["coupe"], gearbox: ["automated_manual"], tag: true },
          { name: "Scuderia Spider 16M", bodies: ["convertible"], gearbox: ["automated_manual"], tag: true }
        ] }
    ]
  },
  // ---- Ford -------------------------------------------------------------------------------------
  {
    make: "Ford", model: "GT", family: "GT", canonical: "Ford GT",
    aliases: ["ford gt"],
    bodyNames: { coupe: "Coupe" },
    specialEditions: [/heritage/i, /carbon\s?series/i, /studio\s?collection/i, /liquid\s?carbon/i, /\bLM\b/i, /prototype/i, /\bMk\s?II\b/i, /\bMk\s?IV\b/i],
    generations: [
      { code: "2005-2006", years: [2005, 2006], prodYears: [2004, 2006], bodies: ["coupe"], gearbox: [],
        trims: [{ name: "Heritage", tag: true }] },
      { code: "2017-2022", years: [2017, 2022], bodies: ["coupe"], gearbox: [],
        trims: [{ name: "Heritage", tag: true }, { name: "Carbon Series", tag: true }, { name: "Studio Collection", tag: true }, { name: "'64 Prototype", tag: true }, { name: "LM", tag: true }] }
    ]
  },
  {
    make: "Ford", model: "GT40", family: "GT40", canonical: "Ford GT40",
    aliases: ["gt40", "gt-40", "ford gt40"],
    bodyNames: { coupe: "Coupe" },
    replicaSeparate: true,   // originals (1964-69) vs continuations/replicas are NEVER one range
    replicaExtra: [/\bholman\b/i],   // GT40-only: Holman + post-1969 is a continuation, not an original
    generations: [
      { code: "GT40", years: [1964, 1969], bodies: ["coupe"], gearbox: ["manual"],
        trims: [{ name: "Mk I" }, { name: "Mk II" }, { name: "Mk III" }, { name: "Mk IV" }] }
    ]
  },
  // ---- Dodge ------------------------------------------------------------------------------------
  {
    make: "Dodge", model: "D50", family: "D50", canonical: "Dodge D50 / Ram 50",
    aliases: ["d50", "d-50", "dodge d50", "ram 50", "ram-50", "ram50"],
    bodyNames: { truck: "Truck" },
    // Rebadged siblings pooled together, each labelled by its own title in the list (Rule 25).
    poolTerms: ["D50", "D-50", "Ram 50", "Ram-50", "Arrow Truck", "Arrow Pickup", "Mighty Max"],
    // ONE family pool, no generation question (fix 1): the D50/Ram 50/Arrow/Mighty Max are one small
    // rebadged truck family; each sale is still labelled by its own title (Rule 25).
    generations: [
      { code: "D50/Ram 50", years: [1979, 1993], bodies: ["truck"], gearbox: [] }
    ]
  },
  // ---- Porsche ----------------------------------------------------------------------------------
  {
    make: "Porsche", model: "911", family: "911", canonical: "911",
    aliases: [],
    bodyNames: { coupe: "Coupe", targa: "Targa", convertible: "Cabriolet" },
    specialEditions: [
      /\bRSR\b/i, /carrera\s?rs\b/i, /\bRS\b/i, /\bGT2\s?RS\b/i, /\bGT2\b/i, /\bGT3\s?RS\b/i, /\bGT3\s?touring\b/i, /\bGT3\b/i,
      /turbo\s?s\b/i, /sport\s?classic/i, /speedster/i, /\b911\s?R\b/i, /\bS\/T\b/i, /dakar/i, /clubsport/i
    ],
    generations: [
      { code: "901", years: [1965, 1973], bodies: ["coupe", "targa"], gearbox: ["manual", "automatic"] },       // Sportomatic from 1968
      { code: "G-Body", years: [1974, 1989], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] }, // cabrio from 1983, Sportomatic to 1980
      { code: "964", years: [1989, 1994], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] },    // Tiptronic
      { code: "993", years: [1995, 1998], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] },
      { code: "996", years: [1999, 2004], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] },
      { code: "997", years: [2005, 2012], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic", "dual_clutch"] }, // .1 Tiptronic, .2 PDK
      { code: "991", years: [2012, 2019], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "dual_clutch"] },
      { code: "992", years: [2019, 2026], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "dual_clutch"] }
    ]
  },
  // ---- Jaguar -----------------------------------------------------------------------------------
  {
    make: "Jaguar", model: "E-Type", family: "XKE", canonical: "E-Type",
    aliases: ["e-type", "etype", "e type", "xke", "xk-e"],
    bodyNames: { convertible: "Roadster", coupe: "Fixed Head Coupe" },   // 2+2 is a trim chip
    specialEditions: [/lightweight/i, /low\s?drag/i, /flat\s?floor/i, /e-?type\s?zero/i],
    generations: [
      { code: "Series 1", years: [1961, 1968], bodies: ["convertible", "coupe"], gearbox: ["manual"],
        trims: [{ name: "3.8" }, { name: "4.2" }, { name: "Series 1.5" }, { name: "2+2", years: [1966, 1968], gearbox: ["manual", "automatic"] }] },
      { code: "Series 2", years: [1969, 1971], bodies: ["convertible", "coupe"], gearbox: ["manual"],
        trims: [{ name: "4.2" }, { name: "2+2", gearbox: ["manual", "automatic"] }] },
      { code: "Series 3", years: [1971, 1974], bodies: ["convertible", "coupe"], gearbox: ["manual"],
        trims: [{ name: "V12" }, { name: "2+2", gearbox: ["manual", "automatic"] }] }   // S3: Roadster + 2+2 only
    ]
  },
  // ---- Aston Martin -----------------------------------------------------------------------------
  {
    make: "Aston Martin", model: "V8 Vantage", family: "V8 Vantage", canonical: "V8 Vantage",
    aliases: ["v8 vantage"],
    bodyNames: { coupe: "Coupe", convertible: "Roadster" },
    specialEditions: [/\bN24\b/i, /\bGT4\b/i, /\bGT2\b/i, /\bGT8\b/i, /\bGT12\b/i, /race\s?car/i],
    generations: [
      { code: "VH", years: [2006, 2017], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [{ name: "V8" }, { name: "V8 S" }, { name: "N400", tag: true }, { name: "N420", tag: true }, { name: "GT" }] }
    ]
  },
  // ---- Lamborghini ------------------------------------------------------------------------------
  {
    make: "Lamborghini", model: "Gallardo", family: "Gallardo", canonical: "Gallardo",
    aliases: ["gallardo"],
    bodyNames: { coupe: "Coupe", convertible: "Spyder" },
    specialEditions: [/superleggera/i, /performante/i, /squadra\s?corse/i, /balboni/i, /super\s?trofeo/i],
    generations: [
      { code: "Gallardo", years: [2004, 2014], prodYears: [2003, 2014], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [{ name: "LP560-4" }, { name: "LP570-4 Superleggera", bodies: ["coupe"], tag: true }, { name: "Spyder" }, { name: "Balboni", tag: true }, { name: "Squadra Corse", tag: true }] }
    ]
  }
];

// DENY MAP (Rule 5, SECOND layer; year-gating is the primary guard). Keyed by norm(make)+"|"+norm(model).
export const DENY = {
  "ford|gt": [/gt\s?-?\s?40/i, /gt\s?-?\s?350/i, /gt\s?-?\s?500/i, /mustang/i, /shelby/i, /torino/i, /fairlane/i, /falcon/i, /\bgt3\b/i, /\bgt4\b/i, /cobra/i],
  "mercedesbenz|sclass": [/\bCL\d?\d\d\b/i, /\bCLS\b/i, /\bCLS\d\d\d\b/i, /\bSL\d?\d\d\b/i, /\bSLS\b/i, /\bSLK\b/i, /\bSEC\b/i, /\bCLK\b/i, /\bCL\s?\d\d\d\b/i,
    /\bGLS\b/i, /\bGLE\b/i, /\bGLA\b/i, /\bGLB\b/i, /\bGLC\b/i, /\bGLK\b/i, /\bGL\d\d\d\b/i, /\bML\d?\d\d\b/i, /\bG\s?\d\d\d\b/i, /\bG-?Class\b/i, /\bG-?Wagen\b/i, /\bGLS\d\d\d\b/i, /\bGLE\d\d\d\b/i],   // SUVs never pool with the S-Class sedan (fix 3)
  "mercedesbenz|s65": [/\bSL\s?65\b/i, /\bCL\s?65\b/i, /\bCLS\s?65\b/i, /\bSLS\b/i],
  "bmw|m3": [/\bM4\b/i, /\bM5\b/i, /\bM2\b/i, /\bM340/i, /\bM3\s?40/i],
  "astonmartin|v8vantage": [/V12\s?Vantage/i],
  "porsche|911": [/\b912\b/i, /\b930\b/i, /\b914\b/i, /\b912E\b/i]   // only when a generation is named
};

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function rulesFor(make, model) {
  const m = norm(make), mo = norm(model);
  if (!mo) return null;
  const makeOk = r => !m || norm(r.make) === m;
  // Priority: exact model, then alias, then family (so an "S-Class" query never hits the S65 entry
  // whose family is also "S-Class"). Within each tier a matching make wins; make-agnostic as last resort.
  return MODEL_RULES.find(r => makeOk(r) && norm(r.model) === mo)
    || MODEL_RULES.find(r => makeOk(r) && (r.aliases || []).some(a => norm(a) === mo))
    || MODEL_RULES.find(r => makeOk(r) && norm(r.family) === mo && norm(r.model) === norm(r.family))
    || MODEL_RULES.find(r => norm(r.model) === mo)
    || MODEL_RULES.find(r => (r.aliases || []).some(a => norm(a) === mo))
    || null;
}

export function ruleByAlias(token) {
  const t = norm(token);
  if (!t) return null;
  return MODEL_RULES.find(r => norm(r.model) === t || norm(r.family) === t || (r.aliases || []).some(a => norm(a) === t)) || null;
}

// Generations that offered a given body and/or trim (Rule 1). Codes already uppercase; years are US.
export function generationsForRules(rule, opts = {}) {
  if (!rule) return [];
  let gens = rule.generations || [];
  if (opts.body) gens = gens.filter(g => (g.bodies || []).some(b => bodyFamilyEq(b, opts.body)));
  if (opts.trim) {
    const t = norm(opts.trim);
    const anyGenHasTrim = (rule.generations || []).some(g => (g.trims || []).some(x => norm(x.name) === t));
    if (anyGenHasTrim) gens = gens.filter(g => (g.trims || []).some(x => norm(x.name) === t));
  }
  return gens;
}

export function bodiesForGeneration(rule, genCode) {
  if (!rule || !genCode) return null;
  const g = (rule.generations || []).find(x => norm(x.code) === norm(genCode));
  return g ? (g.bodies || []) : null;
}

// Bodies a named trim was offered in, PER model+generation (Rule 1, no global keyword lock). Returns
// the union across the generations that list the trim, or null when the trim is not a curated trim.
export function bodiesForTrim(rule, trim) {
  if (!rule || !trim) return null;
  const t = norm(trim);
  const bodies = new Set();
  let found = false;
  for (const g of (rule.generations || [])) {
    for (const x of (g.trims || [])) {
      if (norm(x.name) === t) { found = true; (x.bodies || g.bodies || []).forEach(b => bodies.add(b)); }
    }
  }
  return found ? [...bodies] : null;
}

// Gearboxes offered for a generation (optionally narrowed by a trim's gearbox, and by model year
// where a gearbox was only offered for part of the generation, e.g. F355 F1 = 1997-99). Entries may
// be a plain string or { type, years:[s,e] }. Returns a flat list of gearbox_type strings valid for
// the given year (or all, when year is absent).
export function gearboxForGeneration(rule, genCode, trim, year) {
  if (!rule) return [];
  const g = (rule.generations || []).find(x => norm(x.code) === norm(genCode));
  if (!g) return [];
  let list = g.gearbox || [];
  if (trim) {
    const tr = (g.trims || []).find(x => norm(x.name) === norm(trim));
    if (tr && tr.gearbox) list = tr.gearbox;
  }
  const y = Number(year);
  return list
    .filter(e => !(typeof e === "object" && Number.isFinite(y) && e.years && (y < e.years[0] || y > e.years[1])))
    .map(e => (typeof e === "object" ? e.type : e));
}

// A generation's US model-year span, for chip display (Rule 3/5) - the variant's real years.
export function chipYears(gen) { return gen && gen.years ? gen.years : null; }

// YEAR-GATE (Rule 5 primary): is this year inside ANY generation listed for the model? The gate uses
// WORLDWIDE production years (prodYears when present, else the US years) so a Euro/grey car titled with
// its production year (an E30 M3 from 1986) is let in; chips still show the US `years` (Fix 2). Returns
// null when the sale has NO year - the caller then keeps it only if the title clearly matches the model
// (never a silent drop) and counts it.
export function yearInRuleGenerations(rule, year) {
  const y = Number(year);
  if (!rule || !Number.isFinite(y)) return null;
  return (rule.generations || []).some(g => { const r = g.prodYears || g.years; return y >= r[0] && y <= r[1]; });
}

// Restomod/replica reason for a title, or null. Whole-word; generic words are global, NAMED builders
// are make-scoped (change 2) - a builder with a `makes` set fires only when the sale's make or
// make|model is in it (Eagle->Jaguar, Singer->Porsche, Superformance/Safir/CAV/RCR->GT40+Cobra,
// Kirkham->Cobra). Also never tags a word that IS the sale's own make/model.
export function restomodReason(title, make, model) {
  const t = String(title || ""), m = norm(make), mo = norm(model), mm = m + "|" + mo;
  for (const spec of RESTOMOD_TAGS) {
    if (!spec.re.test(t)) continue;
    if (norm(spec.word) === m || norm(spec.word) === mo) continue;   // the word is the real make/model
    if (spec.makes && !spec.makes.some(x => x === m || x === mm)) continue;   // make-scoped builder, out of scope
    return spec.word;
  }
  return null;
}
// Variants that may become a QUESTION instead of a tag-out when they are a big share of the pool
// (change 1): the Competition Package / ZCP family. Everything else in specialEditions stays an
// always-aside (CS, CSL, GTS, CRT, LTW, 30 Jahre, Heritage, Scuderia, 16M, Challenge Stradale, race).
export const ASKABLE_VARIANTS = [{ re: /competition/i, label: "Competition Package", chip: "Competition Package" }, { re: /\bZCP\b/i, label: "Competition Package", chip: "Competition Package" }];
export function askableVariant(title) { for (const v of ASKABLE_VARIANTS) if (v.re.test(String(title || ""))) return v; return null; }

export function bodyLabelFor(rule, bodyFamily) {
  if (rule && rule.bodyNames && rule.bodyNames[bodyFamily]) return rule.bodyNames[bodyFamily];
  return ({ coupe: "Coupe", convertible: "Convertible", targa: "Targa", sedan: "Sedan", wagon: "Wagon", roadster: "Roadster", truck: "Truck" })[bodyFamily] || bodyFamily;
}

export function canonicalName(rule, fallback) { return (rule && rule.canonical) || fallback; }

// The model's own special-edition tag+exclude patterns (regexes). The global restomod set is applied
// SEPARATELY and collision-aware via restomodReason (so it can skip a real make/model).
export function specialEditionRes(rule) { return (rule && rule.specialEditions) || []; }

export function denyFor(make, model, opts = {}) {
  let list = DENY[norm(make) + "|" + norm(model)] || [];
  if (norm(model) === "911" && !opts.generationNamed) list = [];   // bare 911 keeps 912/930 out only when a gen is named
  return list;
}

function bodyFamilyEq(a, b) {
  const fam = x => { x = String(x || "").toLowerCase(); if (["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead"].includes(x)) return "open"; if (x === "targa") return "targa"; if (["coupe", "berlinetta", "fastback", "fixed head coupe", "fhc"].includes(x)) return "coupe"; if (["sedan", "saloon"].includes(x)) return "sedan"; if (x === "truck") return "truck"; return x; };
  return fam(a) === fam(b);
}
export { norm as _norm, bodyFamilyEq };
