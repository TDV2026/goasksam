// CURATED MODEL RULES (Part 1, Oct 2026). One file, plain data. The question engine consults this
// BEFORE offering any clarifying chip (Rule 1), before asking gearbox (Rule 2), for real names
// (Rule 3), and the pool guard reads its deny map (Rule 5). Nothing here is computed from a live
// query; it is hand-curated truth about what each car actually came with.
//
// Entry shape:
//   make            canonical make ("Mercedes-Benz", "BMW", "Ferrari", "Ford", "Porsche", "Jaguar")
//   model           the resolved model token the engine uses (may be a badge: "S65", "M3")
//   family          the archive model_family these file under (for the pool guard); often == model
//   canonical       the display name (Rule 3): "E-Type" even when the model token is "XKE"
//   aliases         extra tokens that resolve to this entry (Rule 4 nameplate/code resolution)
//   bodyNames       marque-specific body label map applied to the body CHIPS (Rule 3): Ferrari's
//                   "GTS" not "Targa", "Berlinetta" not "Coupe". Keyed by our internal body family.
//   generations[]   { code (UPPERCASE), years:[start,end] US model years, bodies:[...], trims:[...] }
//   gearbox         { types:[...] } the gearbox_type values this model was sold with (Rule 2). An
//                   empty/absent list means "do not ask gearbox" (e.g. every S65 is automatic).
//   specialEditions [RegExp] title patterns that are a pricier/distinct variant: TAGGED and excluded
//                   from the standard headline range (Rule 7), same treatment as a minority gearbox.
//
// Bodies use our internal families: sedan, coupe, convertible, targa, wagon. (classifyBody output.)
// gearbox_type values: manual, automated_manual, dual_clutch, automatic, cvt.

export const MODEL_RULES = [
  // ---- Mercedes-Benz ----------------------------------------------------------------------------
  {
    make: "Mercedes-Benz", model: "S65", family: "S-Class", canonical: "S65 AMG",
    aliases: ["s65", "s 65", "s65 amg"],
    generations: [
      { code: "W220", years: [2000, 2006], bodies: ["sedan"], trims: [] },
      { code: "W221", years: [2007, 2013], bodies: ["sedan"], trims: [] },
      { code: "W222", years: [2014, 2020], bodies: ["sedan", "coupe", "convertible"], trims: [] }
    ],
    gearbox: { types: [] },   // every S65 is automatic: never ask
    specialEditions: [/final\s?edition/i]
  },
  {
    make: "Mercedes-Benz", model: "S-Class", family: "S-Class", canonical: "S-Class",
    aliases: [],
    generations: [
      { code: "W116", years: [1973, 1980], bodies: ["sedan"], trims: [] },
      { code: "W126", years: [1981, 1991], bodies: ["sedan", "coupe"], trims: [] },   // W126 SEC coupe
      { code: "W140", years: [1992, 1999], bodies: ["sedan", "coupe"], trims: [] },   // W140 coupe -> later CL
      { code: "W220", years: [2000, 2006], bodies: ["sedan"], trims: [] },            // sedan ONLY (CL/CLS/SL are separate models)
      { code: "W221", years: [2007, 2013], bodies: ["sedan"], trims: [] },
      { code: "W222", years: [2014, 2020], bodies: ["sedan"], trims: [] }
    ],
    gearbox: { types: [] }
  },
  // ---- BMW --------------------------------------------------------------------------------------
  {
    make: "BMW", model: "M3", family: "M3", canonical: "M3",
    aliases: [],
    generations: [
      { code: "E30", years: [1986, 1991], bodies: ["coupe", "convertible"], trims: ["Sport Evolution", "Evolution"] },
      { code: "E36", years: [1992, 1999], bodies: ["coupe", "convertible", "sedan"], trims: [] },
      { code: "E46", years: [2000, 2006], bodies: ["coupe", "convertible"], trims: ["CSL"] },
      { code: "E92", years: [2007, 2013], bodies: ["coupe", "convertible", "sedan"], trims: ["GTS", "CRT"] },
      { code: "F80", years: [2014, 2018], bodies: ["sedan"], trims: ["Competition", "CS"] },       // coupe became the M4
      { code: "G80", years: [2021, 2026], bodies: ["sedan"], trims: ["Competition", "CS"] }
    ],
    // E46 = manual or SMG (automated_manual); E90/E92 = manual or DCT; F80/G80 = manual or DCT.
    gearbox: { types: ["manual", "automated_manual", "dual_clutch"] },
    specialEditions: [/\bCSL\b/i, /\bGTS\b/i, /\bCRT\b/i, /competition/i, /\bCS\b/i]
  },
  // ---- Ferrari ----------------------------------------------------------------------------------
  {
    make: "Ferrari", model: "355", family: "355", canonical: "F355",
    aliases: ["f355", "355"],
    // Ferrari body names on the chips (Rule 3): our internal families map to Ferrari's names.
    bodyNames: { coupe: "Berlinetta", targa: "GTS", convertible: "Spider" },
    generations: [
      { code: "F355", years: [1994, 1999], bodies: ["coupe", "targa", "convertible"], trims: ["Berlinetta", "GTS", "Spider", "Serie Fiorano"] }
    ],
    gearbox: { types: ["manual", "automated_manual"] },   // 6-speed manual vs F1
    specialEditions: [/conversion/i, /serie\s?fiorano/i]
  },
  {
    make: "Ferrari", model: "360", family: "360", canonical: "360",
    aliases: ["360 modena", "360 spider", "360 challenge stradale"],
    bodyNames: { coupe: "Modena", convertible: "Spider" },
    generations: [
      { code: "360", years: [1999, 2005], bodies: ["coupe", "convertible"], trims: ["Modena", "Spider", "Challenge Stradale"] }
    ],
    gearbox: { types: ["manual", "automated_manual"] },
    specialEditions: [/challenge\s?stradale/i, /\bCS\b/i]
  },
  {
    make: "Ferrari", model: "F430", family: "430", canonical: "F430",
    aliases: ["f430", "430", "430 scuderia", "f430 spider"],
    bodyNames: { coupe: "Berlinetta", convertible: "Spider" },
    generations: [
      { code: "F430", years: [2005, 2009], bodies: ["coupe", "convertible"], trims: ["Berlinetta", "Spider", "Scuderia", "16M"] }
    ],
    gearbox: { types: ["manual", "automated_manual"] },
    specialEditions: [/scuderia/i, /\b16M\b/i]
  },
  // ---- Ford -------------------------------------------------------------------------------------
  {
    make: "Ford", model: "GT", family: "GT", canonical: "Ford GT",
    aliases: ["ford gt"],
    generations: [
      { code: "2005-2006", years: [2005, 2006], bodies: ["coupe"], trims: [] },
      { code: "2017-2022", years: [2017, 2022], bodies: ["coupe"], trims: ["Heritage", "Carbon Series", "Studio Series", "'64 Prototype", "LM"] }
    ],
    gearbox: { types: [] },   // 2005-06 manual only, 2017+ DCT only: within a generation there is one, so never a within-gen question
    specialEditions: [/heritage/i, /carbon\s?series/i, /studio\s?series/i, /liquid\s?carbon/i, /\bLM\b/i, /'?\d2\s?heritage/i, /prototype/i]
  },
  {
    make: "Ford", model: "GT40", family: "GT40", canonical: "Ford GT40",
    aliases: ["gt40", "gt-40", "ford gt40"],
    generations: [
      { code: "GT40", years: [1964, 1969], bodies: ["coupe"], trims: ["Mk I", "Mk II", "Mk III", "Mk IV"] }
    ],
    gearbox: { types: [] }
  },
  // ---- Dodge ------------------------------------------------------------------------------------
  {
    make: "Dodge", model: "D50", family: "D50", canonical: "Dodge D50",
    aliases: ["d50", "d-50", "dodge d50", "ram 50", "ram-50", "ram50"],
    generations: [
      { code: "D50", years: [1979, 1986], bodies: ["truck"], trims: ["Sport", "Royal", "Custom"] }
    ],
    gearbox: { types: [] }
  },
  // ---- Porsche ----------------------------------------------------------------------------------
  {
    make: "Porsche", model: "911", family: "911", canonical: "911",
    aliases: [],
    generations: [
      { code: "901", years: [1965, 1973], bodies: ["coupe", "targa"], trims: ["T", "E", "S", "Carrera RS"] },
      { code: "G-Body", years: [1974, 1989], bodies: ["coupe", "targa", "convertible"], trims: ["SC", "Carrera", "Turbo"] },
      { code: "964", years: [1989, 1994], bodies: ["coupe", "targa", "convertible"], trims: ["Carrera 2", "Carrera 4", "Turbo", "RS"] },
      { code: "993", years: [1995, 1998], bodies: ["coupe", "targa", "convertible"], trims: ["Carrera", "Carrera S", "Turbo", "GT2"] },
      { code: "996", years: [1999, 2004], bodies: ["coupe", "cabriolet", "targa"], trims: ["Carrera", "Carrera S", "Turbo", "GT3", "GT2"] },
      { code: "997", years: [2005, 2012], bodies: ["coupe", "cabriolet", "targa"], trims: ["Carrera", "Carrera S", "Turbo", "GT3", "GT3 RS", "GT2"] },
      { code: "991", years: [2012, 2019], bodies: ["coupe", "cabriolet", "targa"], trims: ["Carrera", "Carrera S", "Turbo", "GT3", "GT3 RS", "GT2 RS"] },
      { code: "992", years: [2019, 2026], bodies: ["coupe", "cabriolet", "targa"], trims: ["Carrera", "Carrera S", "Turbo", "GT3"] }
    ],
    // 996/997/991/992 = manual or PDK/Tiptronic; older = manual. Ask only when both sides present.
    gearbox: { types: ["manual", "automated_manual", "dual_clutch", "automatic"] }
  },
  // ---- Jaguar -----------------------------------------------------------------------------------
  {
    make: "Jaguar", model: "E-Type", family: "XKE", canonical: "E-Type",
    aliases: ["e-type", "etype", "e type", "xke", "xk-e"],
    generations: [
      { code: "Series 1", years: [1961, 1968], bodies: ["coupe", "convertible"], trims: ["3.8", "4.2", "2+2"] },
      { code: "Series 2", years: [1969, 1971], bodies: ["coupe", "convertible"], trims: ["4.2", "2+2"] },
      { code: "Series 3", years: [1971, 1974], bodies: ["coupe", "convertible"], trims: ["V12", "2+2"] }
    ],
    gearbox: { types: ["manual", "automatic"] }
  },
  // ---- Aston Martin -----------------------------------------------------------------------------
  {
    make: "Aston Martin", model: "V8 Vantage", family: "V8 Vantage", canonical: "V8 Vantage",
    aliases: ["v8 vantage"],
    generations: [
      { code: "VH", years: [2005, 2017], bodies: ["coupe", "convertible"], trims: ["V8", "V8 S", "N400", "N420", "GT"] }
    ],
    gearbox: { types: ["manual", "automated_manual"] }   // 6-speed manual vs Sportshift
  },
  // ---- Lamborghini ------------------------------------------------------------------------------
  {
    make: "Lamborghini", model: "Gallardo", family: "Gallardo", canonical: "Gallardo",
    aliases: ["gallardo"],
    generations: [
      { code: "Gallardo", years: [2004, 2014], bodies: ["coupe", "convertible"], trims: ["LP560-4", "LP570-4", "Superleggera", "Spyder", "Performante"] }
    ],
    gearbox: { types: ["manual", "automated_manual"] },   // gated manual vs E-gear
    specialEditions: [/superleggera/i, /performante/i, /super\s?trofeo/i, /\bLP570/i]
  }
];

// DENY MAP (Rule 5): known collisions where a substring/family match pulls the WRONG model in.
// Keyed by the resolved (make|model). A sale is rejected if its title matches any deny pattern,
// even when its make/model_family otherwise looks right. Patterns are matched case-insensitively
// against the full listing title.
// Keyed by norm(make)+"|"+norm(model) (norm strips non-alnum, so "S-Class" -> "sclass").
export const DENY = {
  "ford|gt": [/gt\s?-?\s?40/i, /gt\s?-?\s?350/i, /gt\s?-?\s?500/i, /mustang/i, /shelby/i, /torino/i, /fairlane/i, /falcon/i, /\bgt3\b/i, /\bgt4\b/i, /cobra/i],
  "mercedesbenz|sclass": [/\bCL\d?\d\d\b/i, /\bCLS\b/i, /\bCLS\d\d\d\b/i, /\bSL\d?\d\d\b/i, /\bSLS\b/i, /\bSLK\b/i, /\bSEC\b/i, /\bCLK\b/i, /\bCL\s?\d\d\d\b/i],
  "mercedesbenz|s65": [/\bSL\s?65\b/i, /\bCL\s?65\b/i, /\bCLS\s?65\b/i, /\bSLS\b/i],
  "bmw|m3": [/\bM4\b/i, /\bM5\b/i, /\bM2\b/i, /\bM340/i, /\bM3\s?40/i],
  "porsche|911": [/\b912\b/i, /\b930\b/i, /\b914\b/i, /\b912E\b/i]   // applied only when a specific generation is named
};

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Find the curated rule for a resolved (make, model). Matches model OR any alias, make-scoped.
export function rulesFor(make, model) {
  const m = norm(make), mo = norm(model);
  if (!mo) return null;
  return MODEL_RULES.find(r =>
    norm(r.make) === m && (norm(r.model) === mo || (r.aliases || []).some(a => norm(a) === mo) || norm(r.family) === mo)
  ) || MODEL_RULES.find(r =>
    (norm(r.model) === mo || (r.aliases || []).some(a => norm(a) === mo)) && (!m || norm(r.make) === m)
  ) || null;
}

// Resolve a bare typed token ("gt40", "d50", "e-type") to a rule via alias, for Rule 4. Make-agnostic.
export function ruleByAlias(token) {
  const t = norm(token);
  if (!t) return null;
  return MODEL_RULES.find(r => norm(r.model) === t || norm(r.family) === t || (r.aliases || []).some(a => norm(a) === t)) || null;
}

// Generations available for the model, optionally filtered to those that offered a given body
// and/or trim (Rule 1). Codes are already uppercase in the table.
export function generationsForRules(rule, opts = {}) {
  if (!rule) return [];
  let gens = rule.generations || [];
  if (opts.body) gens = gens.filter(g => (g.bodies || []).some(b => bodyFamilyEq(b, opts.body)));
  if (opts.trim) { const t = norm(opts.trim); gens = gens.filter(g => (g.trims || []).some(x => norm(x) === t) || !(rule.generations || []).some(gg => (gg.trims || []).some(x => norm(x) === t))); }
  return gens;
}

// The bodies a specific generation (by code) offered, for the body-chip gate (Rule 1).
export function bodiesForGeneration(rule, genCode) {
  if (!rule || !genCode) return null;
  const g = (rule.generations || []).find(x => norm(x.code) === norm(genCode));
  return g ? (g.bodies || []) : null;
}

// The bodies a trim was offered in (e.g. CSL = coupe only), across all generations (Rule 1).
export function bodiesForTrim(rule, trim) {
  if (!rule || !trim) return null;
  const t = norm(trim);
  const bodies = new Set();
  let found = false;
  for (const g of (rule.generations || [])) {
    if ((g.trims || []).some(x => norm(x) === t)) { found = true; (g.bodies || []).forEach(b => bodies.add(b)); }
  }
  // A trim-specific body restriction: a named trim like CSL that lives on one gen may still be
  // coupe-only even though the gen offered a convertible. Hard-code the known body-locked trims.
  const LOCKED = { csl: ["coupe"], "sport evolution": ["coupe"], gts: ["coupe"], crt: ["sedan"], scuderia: ["coupe"], "challenge stradale": ["coupe"] };
  if (LOCKED[t]) return LOCKED[t];
  return found ? [...bodies] : null;
}

// Marque body label for a chip (Rule 3): Ferrari coupe -> "Berlinetta", targa -> "GTS", etc.
export function bodyLabelFor(rule, bodyFamily) {
  if (rule && rule.bodyNames && rule.bodyNames[bodyFamily]) return rule.bodyNames[bodyFamily];
  return ({ coupe: "Coupe", convertible: "Convertible", targa: "Targa", sedan: "Sedan", wagon: "Wagon", roadster: "Roadster" })[bodyFamily] || bodyFamily;
}

export function canonicalName(rule, fallback) { return (rule && rule.canonical) || fallback; }

export function gearboxTypesFor(rule) { return (rule && rule.gearbox && rule.gearbox.types) || []; }

export function specialEditionRes(rule) { return (rule && rule.specialEditions) || []; }

// Deny patterns for a resolved (make, model). For 911 the code-collision deny (912/930/914) applies
// ONLY when a specific generation is named (a bare "911" pool legitimately spans them as trims).
export function denyFor(make, model, opts = {}) {
  let list = DENY[norm(make) + "|" + norm(model)] || [];
  if (norm(model) === "911" && !opts.generationNamed) list = [];   // bare 911 keeps 912/930 out only when a gen is named
  return list;
}

function bodyFamilyEq(a, b) {
  const fam = x => { x = String(x || "").toLowerCase(); if (["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead"].includes(x)) return "open"; if (x === "targa") return "targa"; if (x === "coupe" || x === "berlinetta" || x === "fastback") return "coupe"; if (x === "sedan" || x === "saloon") return "sedan"; return x; };
  return fam(a) === fam(b);
}
export { norm as _norm, bodyFamilyEq };
