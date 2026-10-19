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
  // ENGINE SWAP (set aside like a restomod): a non-factory engine named in the title/description -
  // "swapped", "LS-powered", "6.0L V8-Powered 1995 BMW M3", "2JZ-swapped", "repowered". The
  // "<engine>-Powered"/"<engine>-Swapped" hook is a seller's swap flag (a factory car names its trim,
  // not "V8-Powered"); plain "swapped"/"engine swap"/"repowered" are unambiguous.
  { re: /\bengine[-\s]?swap(?:ped)?\b|\bswapped\b|\bre-?powered\b|\brepower\b/i, word: "engine swap" },
  { re: /\b(?:ls[0-9]?x?|lsx|coyote|[12]jz|rb2[0-9]|rb3[0-9]|hemi|godzilla|k-?series|k2[04])[-\s]?(?:swap(?:ped)?|powered|conversion)\b/i, word: "engine swap" },
  { re: /\b(?:v8|v10|v12)[-\s]?(?:powered|swapped)\b|\b\d(?:\.\d)?\s?l(?:iter)?\s*v\d+[-\s]?(?:powered|swapped)\b/i, word: "engine swap" },
  // Bare "<displacement>L-Powered" (comparable-fences job, Oct 2026): the V-count patterns above miss
  // a title like "3.6L-Powered 1987 Porsche 911 Carrera Coupe G50" (no "V6"/"V8" named). Word order
  // matters: this requires the displacement to come BEFORE "Powered" with a hyphen/space, so "Powered
  // by the original 3.2L" (the harmless factory-spec phrasing the owner named explicitly) does not
  // match - that phrase has "Powered" first and never reads as a swap flag.
  { re: /\b\d(?:\.\d)?\s?l(?:iter)?[-\s]?powered\b/i, word: "engine swap" },
  // RUF and "Turbo look" (comparable-fences job, Oct 2026): RUF builds its own Porsche-based cars on
  // a 911 shell under its own type numbers - never a comp for the base car it started from. "Turbo
  // look"/"Turbo-look" is the cosmetic wide-body appearance package on a NON-Turbo 911 (a factory
  // Turbo's own title says "Turbo", not "Turbo look"), so it reads as a different, pricier-looking car
  // than the mechanically-stock base model it actually is. Both Porsche-scoped: "RUF" and "turbo look"
  // are not generic enough words to flag on any other make.
  // RUF tightened (description-match job, Oct 2026): "RUF-style bumpers" is a cosmetic resemblance
  // (an aftermarket widebody kit inspired by RUF's look), not a genuine RUF-built car - the negative
  // lookahead keeps the word from firing when immediately followed by "style".
  { re: /\bruf\b(?!\s*-?\s*style)/i, word: "ruf", makes: ["porsche"] },
  { re: /\bturbo[-\s]?look\b/i, word: "turbo look", makes: ["porsche"] },
  // Slant-nose CONVERSION only, Porsche-scoped (comparable-fences job, Oct 2026, owner's call): Porsche
  // built a genuine factory slant-nose option (930 "Flachbau"), so a title saying "Slant-Nose" alone
  // stays in the pool - it may be the real factory car. Only "Slant-Nose Conversion" (both words) flags
  // a non-factory conversion to the look. Requires BOTH tokens anywhere in the title, not adjacent.
  { re: /(?=.*\bslant[-\s]?nose\b)(?=.*\bconversion\b).*/i, word: "slant-nose conversion", makes: ["porsche"] },
  // Bare "Modified" and related shop-build language (comparable-fences job, Oct 2026): mirrors
  // lib/live/search.js's own MODIFIED_RE (Buy's card-flag use of the identical words), so the same
  // title reads as a modification everywhere in the product, not just on a Buy card. "Twin-turbo
  // conversion" is an ENGINE conversion (adding forced induction), never a gearbox conversion, so it
  // does not collide with rule 27 (gearbox conversions stay in the pool, labelled, never set aside).
  { re: /\bmodified\b|\bmodded\b/i, word: "modified" },
  { re: /\bwide-?body\b|\bbody ?kit\b/i, word: "widebody" },
  { re: /\bbagged\b|\bair ride\b/i, word: "bagged" },
  { re: /\blift(?:ed|\s?kit)\b/i, word: "lifted" },
  { re: /\bstroker\b/i, word: "stroker" },
  { re: /\bcrate\s?engine\b/i, word: "crate engine" },
  { re: /\bbuilt engine\b/i, word: "built engine" },
  { re: /\btwin-?turbo conversion\b/i, word: "twin-turbo conversion" },
  // "Custom built" (comparable-fences job, Oct 2026): scoped to the specific phrase, not bare "custom"
  // - "custom color"/"custom wheels"/"custom order" are routine factory-personalisation language, not
  // a modification flag (the existing FACTORY OPTIONS note in lib/onebox.js makes the same distinction
  // for the 812 GTS). "Custom built" unambiguously means a one-off, non-factory car.
  { re: /\bcustom[-\s]?built\b/i, word: "custom built" },
  // make-scoped named builders
  { re: /\beagle\b/i, word: "eagle", makes: ["jaguar"] },
  { re: /\bsinger\b/i, word: "singer", makes: ["porsche"] },
  { re: /\bsuperformance\b/i, word: "superformance", makes: ["ford|gt40", "shelby", "ac", "shelby|cobra"] },
  { re: /\bsafir\b/i, word: "safir", makes: ["ford|gt40"] },
  { re: /\bCAV\b/i, word: "cav", makes: ["ford|gt40", "shelby", "ac"] },
  { re: /\bRCR\b/i, word: "rcr", makes: ["ford|gt40", "shelby", "ac"] },
  { re: /\bkirkham\b/i, word: "kirkham", makes: ["shelby", "ac", "shelby|cobra"] },
  // Cobra replica / kit builders (item 2): named builders of Cobra replicas and kit cars - never an
  // original or an official Shelby continuation. Make-scoped to Shelby/AC/Cobra so these tokens never
  // tag another marque. The generic replica/kit/-style flag catches the rest.
  { re: /\bfactory\s?five\b|\bffr\b/i, word: "factory five", makes: ["shelby", "ac", "shelby|cobra"] },
  { re: /\bbackdraft\b/i, word: "backdraft", makes: ["shelby", "ac", "shelby|cobra"] },
  { re: /\bERA\b/, word: "era", makes: ["shelby", "ac", "shelby|cobra"] },   // uppercase-only: the builder "ERA", never "era"/"modern era"
  { re: /\bshell\s?valley\b|\beverett[-\s]?morrison\b|\bunique\s?motorcars\b|\bclassic\s?roadsters?\b|\bcontemporary\s?classic\b|\bhi-?tech\b|\bwest\s?coast\s?cobra\b|\bmidstates?\b/i, word: "cobra kit builder", makes: ["shelby", "ac", "shelby|cobra"] }
];

export const MODEL_RULES = [
  // ---- Mazda (e66, the 1989 Miata Roadster read): the NA and NB MX-5 were built only as roadsters (a hardtop is an
  // accessory), so a plain "1990 Mazda MX-5 Miata" title is the roadster. NC and later add the retractable hardtop and stay open.
  {
    make: "Mazda", model: "MX-5", family: "MX-5", canonical: "MX-5 Miata",
    defaultBody: "roadster",
    aliases: ["miata", "mx5", "mx 5", "mx-5 miata"],
    bodyNames: { roadster: "Roadster" },
    generations: [
      { code: "NA", years: [1989, 1997], bodies: ["roadster"], gearbox: [] },
      { code: "NB", years: [1999, 2005], bodies: ["roadster"], gearbox: [] }
    ]
  },
  // ---- Mercedes-Benz ----------------------------------------------------------------------------
  {
    make: "Mercedes-Benz", model: "S65", family: "S-Class", canonical: "S65 AMG",
    defaultBody: "sedan",
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
    defaultBody: "sedan",
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
      { code: "E36", years: [1995, 1999], prodYears: [1992, 1999], bodies: ["coupe", "convertible", "sedan"], defaultBody: "coupe", gearbox: ["manual", "automatic"],
        trims: [{ name: "Lightweight", bodies: ["coupe"], tag: true }, { name: "GT", bodies: ["coupe"], tag: true }] },
      { code: "E46", years: [2001, 2006], prodYears: [2000, 2006], bodies: ["coupe", "convertible"], gearbox: ["manual", "automated_manual"],
        trims: [{ name: "CSL", bodies: ["coupe"], tag: true }, { name: "CS", bodies: ["coupe"], tag: true }] },
      { code: "E9X", years: [2008, 2013], prodYears: [2007, 2013], bodies: ["coupe", "convertible", "sedan"], defaultBody: "coupe", gearbox: ["manual", "dual_clutch"],
        trims: [{ name: "GTS", bodies: ["coupe"], tag: true }, { name: "CRT", bodies: ["sedan"], tag: true }, { name: "Lime Rock Park", tag: true }] },
      { code: "F80", years: [2015, 2018], prodYears: [2014, 2018], bodies: ["sedan"], defaultBody: "sedan", gearbox: ["manual", "dual_clutch"],
        trims: [{ name: "Competition", tag: true }, { name: "CS", tag: true }, { name: "30 Jahre", tag: true }] },
      { code: "G80", years: [2021, 2026], bodies: ["sedan"], defaultBody: "sedan", gearbox: ["manual", "automatic"],
        trims: [{ name: "Competition", tag: true }, { name: "CS", tag: true }] }
    ]
  },
  // ---- Ferrari ----------------------------------------------------------------------------------
  {
    make: "Ferrari", model: "355", family: "355", canonical: "F355",
    defaultBody: "coupe",
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
    defaultBody: "coupe",
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
    defaultBody: "coupe",
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
  {
    // 550 Maranello (1996-2002 worldwide; US 1997-2001). A model-YEAR search widens to the full
    // production run before it could ever widen past the model (so a 2000 reads 1996-2002, not
    // just 1998-2002). Manual-only (no gearbox question). The 550 Barchetta is a limited open-top
    // special set aside from the Maranello base (also in lib/onebox.js HALO_PATTERNS).
    make: "Ferrari", model: "550", family: "550", canonical: "550 Maranello",
    defaultBody: "coupe",
    aliases: ["550", "550 maranello", "550m"],
    specialEditions: [/barchetta/i],
    generations: [
      { code: "550 Maranello", years: [1997, 2001], prodYears: [1996, 2002], bodies: ["coupe"], gearbox: ["manual"] }
    ]
  },
  // ---- Ford -------------------------------------------------------------------------------------
  {
    make: "Ford", model: "GT", family: "GT", canonical: "Ford GT",
    defaultBody: "coupe",
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
    defaultBody: "coupe",
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
    defaultBody: "truck",
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
    defaultBody: "coupe",
    aliases: [],
    bodyNames: { coupe: "Coupe", targa: "Targa", convertible: "Cabriolet" },
    specialEditions: [
      /\bRSR\b/i, /carrera\s?rs\b/i, /\bRS\b/i, /\bGT2\s?RS\b/i, /\bGT2\b/i, /\bGT3\s?RS\b/i, /\bGT3\s?touring\b/i, /\bGT3\b/i,
      /turbo\s?s\b/i, /sport\s?classic/i, /speedster/i, /\b911\s?R\b/i, /\bS\/T\b/i, /dakar/i, /clubsport/i,
      // Limited editions (bug 2, this pass): the Carrera T Club and other low-volume editions are halos,
      // never in the base or widened Carrera pools.
      /\bclub\b/i, /50\s*years?\b|\b50th\b/i, /\bheritage\b/i, /\bamerica\b/i, /\bexclusive\b/i, /anniversary/i
    ],
    generations: [
      { code: "901", years: [1965, 1973], bodies: ["coupe", "targa"], gearbox: ["manual", "automatic"] },       // Sportomatic from 1968
      // cabrio from 1983, Sportomatic to 1980. 930 is the G-body TURBO (bug 1): a named Turbo in this era
      // reads "930" (trimCode), not the base G-body/911SC/3.2 Carrera label.
      { code: "G-Body", years: [1974, 1989], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"],
        trimYears: { "Turbo": [1975, 1989], "Turbo S": [1986, 1989] }, trimCode: { "Turbo": "930", "Turbo S": "930" } },
      { code: "964", years: [1989, 1994], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] },    // Tiptronic
      { code: "993", years: [1995, 1998], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"] },
      // trimYears (bug 1): the Turbo / GT2 / GT3 cross generations at DIFFERENT years than the base car.
      // The 996 Turbo ran through 2006 (the 997 Turbo did not arrive until 2007), so a 2005-2006 Turbo /
      // GT2 / GT3 is a 996, not a 997. generationForTrimYear uses these when a matching trim is named.
      { code: "996", years: [1999, 2004], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic"],
        trimYears: { "Turbo": [2001, 2006], "Turbo S": [2003, 2006], "GT2": [2002, 2006], "GT3": [2000, 2006] } },
      { code: "997", years: [2005, 2012], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "automatic", "dual_clutch"], // .1 Tiptronic, .2 PDK
        trimYears: { "Turbo": [2007, 2013], "Turbo S": [2010, 2013], "GT2": [2008, 2009], "GT2 RS": [2011, 2012], "GT3": [2007, 2011], "GT3 RS": [2007, 2011] } },
      { code: "991", years: [2012, 2019], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "dual_clutch"],
        trimYears: { "Turbo": [2014, 2019], "Turbo S": [2014, 2019], "GT2 RS": [2018, 2019], "GT3": [2014, 2019], "GT3 RS": [2015, 2019] } },
      { code: "992", years: [2019, 2026], bodies: ["coupe", "targa", "convertible"], gearbox: ["manual", "dual_clutch"], noManualTrims: ["Carrera", "Carrera 4"],
        trimYears: { "Turbo": [2021, 2026], "Turbo S": [2021, 2026], "GT3": [2022, 2026], "GT3 RS": [2023, 2026] } }
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
    defaultBody: "coupe",
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
    defaultBody: "coupe",
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

// MODEL FAMILIES (Oct 2026): some nameplates are several genuinely distinct markets sharing one model
// name, with NO generation/body axis to split them - the split is by displacement/series. They must
// NEVER share a pool (a 289 Cobra at $1.1m and a Daytona at $39m are not one market). Each family is a
// pool defined by a title matcher; a query names one, or it is ambiguous and we ask. HALO families are
// set aside like Ferrari halos (never in another family's pool); CONTINUATION cars are their own family.
//   detect  - tested against the QUERY text to pick the family the user named.
//   include - a sale's title must match this to be IN the family pool.
//   exclude - a sale's title matching this is dropped (cross-family contamination).
// askFamilies = the families a clarify offers as chips (halo/continuation are reached by naming them).
export const MODEL_FAMILIES = [
  {
    make: /shelby|^ac$/i, model: /^cobra$/i, canonical: "Shelby Cobra",
    families: [
      { name: "289", label: "260/289 Cobra", chip: "289",
        detect: /\b(289|260)\b|\bmark\s?ii\b/i,
        include: /\b(289|260)\b|\bmark\s?ii\b/i,
        exclude: /\b427\b|daytona|\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i },
      // 427 S/C (semi-competition): a distinct, pricier family of its own, reached by naming it. Must
      // precede the base 427 (familyForText takes the first matching detect) and the base 427 excludes
      // it, so a street 427 pool never mixes in an S/C and vice versa.
      { name: "427 S/C", label: "427 S/C (semi-competition)", chip: "427 S/C",
        detect: /\bs\/c\b|\b427\s*sc\b|semi[-\s]?competition/i,
        include: /\bs\/c\b|\b427\s*sc\b|semi[-\s]?competition/i,
        exclude: /daytona|\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation|\b(289|260)\b|\bmark\s?ii\b/i },
      { name: "427", label: "427 Cobra", chip: "427",
        detect: /\b427\b/i,
        include: /\b427\b/i,
        exclude: /daytona|\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation|\b(289|260)\b|\bmark\s?ii\b|\bs\/c\b|semi[-\s]?competition/i },
      { name: "Daytona", label: "Daytona Coupe", chip: "Daytona Coupe", halo: true,
        detect: /daytona/i,
        include: /daytona/i,
        exclude: /\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i },
      { name: "CSX", label: "continuation (CSX4000-series)", chip: "Continuation (CSX)", continuation: true,
        detect: /\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i,
        include: /\bcsx\s?-?\s?[46789]\d{3}\b|\b[46789]000[-\s]?series\b|continuation/i,
        exclude: null }
    ],
    askFamilies: ["289", "427"]
  },
  {
    // Ferrari 812 (Fix 3): Superfast (coupe) / GTS (convertible) / Competizione (coupe) /
    // Competizione A = Aperta (convertible) never share one market. BaT files the whole family as
    // model "812" with the variant only in the title, so the split is by TITLE. `body` scopes the
    // pool to the variant's real body (the GTS convertible was being priced as a coupe and emptied).
    // Order matters: familyForText takes the first matching detect, so Competizione A precedes
    // Competizione, and both precede GTS/Superfast.
    make: /ferrari/i, model: /^8(?:10\/)?12\b/i, canonical: "Ferrari 812", base: "812",
    families: [
      { name: "Competizione A", label: "812 Competizione A", chip: "Competizione A", halo: true, body: "convertible",
        detect: /competizione\s*a\b|competizione\s*aperta|\baperta\b/i,
        include: /competizione\s*a\b|competizione\s*aperta|\baperta\b/i,
        exclude: null },
      { name: "Competizione", label: "812 Competizione", chip: "Competizione", halo: true, body: "coupe",
        detect: /competizione/i,
        include: /competizione/i,
        exclude: /competizione\s*a\b|competizione\s*aperta|\baperta\b/i },
      { name: "GTS", label: "812 GTS", chip: "GTS", body: "convertible",
        detect: /\bgts\b/i,
        include: /\bgts\b/i,
        exclude: /competizione|aperta/i },
      { name: "Superfast", label: "812 Superfast", chip: "Superfast", body: "coupe",
        detect: /superf(?:ast|arst)?\b/i,
        include: /superf(?:ast|arst)?\b/i,
        exclude: /\bgts\b|competizione|aperta/i }
    ],
    askFamilies: ["Superfast", "GTS"]
  }
];
export function modelFamilyGroup(make, model) {
  return MODEL_FAMILIES.find(g => g.make.test(make || "") && g.model.test(String(model || "").trim())) || null;
}
// Which family a query names (from its text), or ambiguity. Returns { family, group } when a family is
// named, { ambiguous:true, group } when the model HAS families but the text names none (ask), else null.
export function familyForText(make, model, text) {
  const g = modelFamilyGroup(make, model);
  if (!g) return null;
  const t = String(text || "");
  const fam = g.families.find(f => f.detect.test(t));
  return fam ? { family: fam, group: g } : { ambiguous: true, group: g };
}

// RACE / TRACK variants that SHARE A BADGE with a road car (item 2, Oct 2026). Pool discipline:
// comparables must match the trim FAMILY. A race version (GT2 R, GT2 Evo, GT3 R, GT3 RSR, Cup car,
// M3 GTR, Viper ACR-X) is NEVER pooled with the road car wearing the same badge, and vice versa.
// Each entry: make (regex), optional model (regex), base (the road badge token), family (the race
// family NAME - two entries with the same family string are ONE pool, e.g. GT2 R and GT2 Evo), and
// re (the title matcher for THIS race family). The road badge (a bare "GT2" / "GT3") matches no race
// re, so it fences the race families OUT. GT2 RS and GT3 RS are ROAD halos (the r-boundary stops the
// race re from catching them), so they stay road, not race.
export const RACE_VARIANTS = [
  { make: /porsche/i, base: "gt2", family: "GT2 R",         re: /\bgt2\s*(?:r\b|evo)/i },
  { make: /porsche/i, base: "gt2", family: "GT2 Clubsport", re: /\bgt2\s*clubsport\b/i },
  { make: /porsche/i, base: "gt3", family: "GT3 R",         re: /\bgt3\s*(?:r\b|rsr\b)/i },
  { make: /porsche/i, base: "gt3", family: "GT3 Cup",       re: /\bgt3\s*cup\b/i },
  { make: /porsche/i, base: "gt3", family: "GT3 Clubsport", re: /\bgt3\s*clubsport\b/i },
  { make: /^bmw$/i,   model: /^m3$/i,   base: "m3",  family: "M3 GTR",      re: /\bm3\s*gtr\b/i },
  { make: /dodge/i,   model: /viper/i,  base: "acr", family: "Viper ACR-X", re: /\bacr[-\s]?x\b/i }
];

const escReLocal = s => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unionRe = res => res.length ? new RegExp(res.map(r => r.source).join("|"), "i") : null;

// The trim-family fence for a named trim. Returns:
//   { onlyRe }    the trim NAMES a race family -> scope the pool to that family ONLY (its own
//                 siblings included: a GT2 R pool carries GT2 R + GT2 Evo), fencing the road car
//                 and every other race family out.
//   { excludeRe } the trim is the ROAD badge of a car that HAS race siblings -> drop every race
//                 family of that badge from the pool (a road "GT2" never pools GT2 R / Clubsport).
//   null          no race family shares this car's badge -> no fence.
export function trimFamilyFence(make, model, trim) {
  const t = String(trim || "").toLowerCase().trim();
  if (!t) return null;
  const mo = norm(model);
  const pool = RACE_VARIANTS.filter(v => v.make.test(make || "") && (!v.model || v.model.test(model || "") || v.model.test(mo)));
  if (!pool.length) return null;
  // Classify against model+trim ("M3 GTR", "Viper ACR-X", "911 GT2 R"), so a race re that carries
  // the model token (M3 GTR) still matches when the model and trim are separate fields.
  const ctx = `${String(model || "")} ${t}`.toLowerCase();
  const named = pool.find(v => v.re.test(ctx));
  if (named) return { onlyRe: unionRe(pool.filter(v => v.family === named.family).map(v => v.re)), family: named.family };
  for (const b of new Set(pool.map(v => v.base))) {
    if (new RegExp(`\\b${escReLocal(b)}\\b`, "i").test(ctx)) return { excludeRe: unionRe(pool.filter(v => v.base === b).map(v => v.re)), base: b };
  }
  return null;
}

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
// Does this curated model have an ASKABLE trim (one that forks price and is worth a question)?
// A tagged trim (tag:true) is a set-aside halo/special, not an askable choice. Returns true (ask),
// false (single-trim - skip the trim question, e.g. the 550 Maranello, manual only, Barchetta aside),
// or null (uncovered model - caller keeps its default behaviour). Mirrors One Box's trim handling.
export function hasAskableTrim(make, model) {
  const rule = rulesFor(make, model);
  if (!rule) return null;
  for (const g of (rule.generations || [])) for (const t of (g.trims || [])) if (!t.tag) return true;
  return false;
}
export function bodiesForTrim(rule, trim, genCode) {
  if (!rule || !trim) return null;
  const t = norm(trim);
  const bodies = new Set();
  let found = false;
  // e58 (Oct 16 2026): when the car's generation is known, only THAT generation's trims can body-lock it. The old
  // all-generation union read "Competition" on a 2012 (E9X) M3 as the F80/G80 sedan trim and silently fenced the pool
  // to sedans ("M3 Competition Sedan", zero coupes). A generation that does not list the trim returns null: the trim is
  // a title word for that car, not a body lock.
  const gens = genCode ? (rule.generations || []).filter(g => norm(g.code) === norm(genCode)) : (rule.generations || []);
  if (genCode && !gens.length) return null;
  for (const g of gens) {
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
// GENERATION BY YEAR AND TRIM (bug 1): a trim that crosses generations at a different year than the base
// car (911 Turbo/GT2/GT3) is placed by the generation whose trim-specific year range (g.trimYears)
// contains the year - so a 2005 Turbo S is a 996, not a 997. Returns { code, yearStart, yearEnd } (the
// trim-specific range, for scoping) or null when no trim-specific boundary applies (then the default
// year binding stands). Matches the longest trimYears key the trim contains ("Turbo S" before "Turbo").
export function generationForTrimYear(rule, trim, year) {
  if (!rule || !trim || !(Number(year) > 1900)) return null;
  const t = norm(trim), y = Number(year);
  let applies = false;
  for (const g of (rule.generations || [])) {
    if (!g.trimYears) continue;
    const key = Object.keys(g.trimYears).sort((a, b) => b.length - a.length).find(k => t.includes(norm(k)));
    if (!key) continue;
    applies = true;
    const [lo, hi] = g.trimYears[key];
    // trimCode lets a trim read a DIFFERENT generation code than the base car (the G-body Turbo is 930,
    // not G-Body/911SC/3.2 Carrera). Falls back to the generation's own code.
    if (y >= lo && y <= hi) return { code: (g.trimCode && g.trimCode[key]) || g.code, yearStart: lo, yearEnd: hi };
  }
  return applies ? { code: null } : null;   // the trim has trim-specific years but the year fits none
}
export function gearboxForGeneration(rule, genCode, trim, year) {
  if (!rule) return [];
  const g = (rule.generations || []).find(x => norm(x.code) === norm(genCode));
  if (!g) return [];
  let list = g.gearbox || [];
  if (trim) {
    const tr = (g.trims || []).find(x => norm(x.name) === norm(trim));
    if (tr && tr.gearbox) list = tr.gearbox;
    // noManualTrims (Part 3 item 1): base trims a generation offered ONLY with an automatic/PDK, even
    // though the generation as a whole also offered a manual on pricier trims (the 992 base Carrera is
    // PDK-only; manual is a Carrera S/T/GTS option). Kept OUT of the `trims` array on purpose, because
    // a trims entry would make generationsForRules filter cross-generation resolution to this one gen.
    else if ((g.noManualTrims || []).some(t => norm(t) === norm(trim))) list = list.filter(e => (typeof e === "object" ? e.type : e) !== "manual");
  }
  // A missing year means no window constraint: keep the whole generation's gearbox set so a
  // year-less query still sees every box the generation offered (Number(null) is 0, which is
  // finite and would wrongly filter out a windowed entry like F355 F1 = 1997-99).
  const yNum = Number(year);
  const yValid = Number.isFinite(yNum) && yNum > 1900;
  return list
    .filter(e => !(typeof e === "object" && yValid && e.years && (yNum < e.years[0] || yNum > e.years[1])))
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
// NEGATION GUARD (description-match job, Oct 2026): a seller stating the car is NOT modified must
// never be read as a modification flag. Scoped to the bare "modified"/"modded" tag only - the
// generic tag a plain negation phrase would actually collide with ("the engine has never been
// modified", "all original, no modifications"). The more specific tags (RUF, restomod, a named
// conversion, an engine-swap phrase) describe something PRESENT, not naturally negated in seller
// prose, and are left alone.
const MODIFIED_NEGATION_RE = /\bunmodified\b|\bun-modified\b|\bnot\s+(?:been\s+)?modified\b|\bnever\s+(?:been\s+)?modified\b|\bno\s+modifications?\b|\bnon-?modified\b|\ball[\s-]original\b/i;
// DESCRIPTION-ELIGIBLE WORDS ONLY (description-match job follow-up, Oct 2026, owner's call): a live
// sample of 16 real description matches found genuine engine-swap language every time EXCEPT the
// bare "modified"/"modded" tag, which also caught trivial or period-correct description mentions
// ("modified with a JVC head unit", "modified with an Edelbrock four-barrel carburetor" - a period
// hot-rod tune, not a reason to exclude a comp) - never set a car aside on a guess. Restricted to an
// unambiguous short list; every OTHER tag (modified, modded, widebody, bagged, lifted, custom built,
// turbo look, RUF, slant-nose conversion, replica/tribute/etc.) is now TITLE-ONLY - a seller's own
// headline word is a deliberate claim, a buried description mention of ordinary period-correct work
// is not grounds to exclude a comp.
const DESCRIPTION_ELIGIBLE_WORDS = new Set(["engine swap", "restomod", "crate engine", "backdate", "backdated", "stroker"]);
export function restomodReason(title, make, model, description) {
  const t = String(title || ""), d = String(description || ""), m = norm(make), mo = norm(model), mm = m + "|" + mo;
  for (const spec of RESTOMOD_TAGS) {
    const hitTitle = spec.re.test(t);
    const hitDesc = !hitTitle && d && DESCRIPTION_ELIGIBLE_WORDS.has(spec.word) && spec.re.test(d);
    if (!hitTitle && !hitDesc) continue;
    if (norm(spec.word) === m || norm(spec.word) === mo) continue;   // the word is the real make/model
    if (spec.makes && !spec.makes.some(x => x === m || x === mm)) continue;   // make-scoped builder, out of scope
    if (spec.word === "modified" && MODIFIED_NEGATION_RE.test(t)) continue;   // "all original", "never been modified", etc.
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

// A sale whose title names NO body counts as this body (per-generation override, else model-level).
// Null = no default (ask / treat as unspecified). Sedan titles rarely say "Sedan", so without this
// the body split only ever sees the coupe/cabriolet cars and omits the sedan chip.
export function defaultBodyFor(rule, genCode) {
  if (!rule) return null;
  if (genCode) { const g = (rule.generations || []).find(x => norm(x.code) === norm(genCode)); if (g && g.defaultBody) return g.defaultBody; }
  return rule.defaultBody || null;
}

// The model's own special-edition tag+exclude patterns (regexes). The global restomod set is applied
// SEPARATELY and collision-aware via restomodReason (so it can skip a real make/model).
export function specialEditionRes(rule) { return (rule && rule.specialEditions) || []; }

export function denyFor(make, model, opts = {}) {
  let list = DENY[norm(make) + "|" + norm(model)] || [];
  if (norm(model) === "911" && !opts.generationNamed) list = [];   // bare 911 keeps 912/930 out only when a gen is named
  return list;
}

// SIBLING MODELS (Round 5 Lane B job, Oct 2026, Part 1 rung 5 "named sibling"). A curated, explicit
// pointer from a thin model/trim to the CLOSEST comparable car in the same family/era - used ONLY as
// the second-to-last ladder rung, after same-model (exact/year-widened/generation/any-year) all come
// up thin. Keyed norm(make)+"|"+norm(model)+"|"+norm(trim||"") - TRIM is part of the key because the
// shared resolver files a trimmed nameplate (lib/vehicle.js: "SL55 AMG" resolves to model "SL-Class",
// trim "SL55 AMG") differently from a standalone model (CLK DTM resolves to model "CLK DTM", trim
// null) - matching on model alone would either miss the trimmed case or over-match every bare
// "SL-Class" query. Deliberately a SHORT, hand-picked list (never a computed "similar cars" feature)
// so every entry is a real product decision, not a guess - add an entry only when a genuine, named
// sibling exists; a model/trim with none is skipped (rung 5 falls through to not_enough_data).
export const SIBLING_MODELS = {
  // CLK DTM (2004-2006, ~100 units, essentially its own micro-market): the closest comparable car is
  // the CLK55 AMG, the mainstream performance CLK of the same era - same platform, same AMG V8
  // heritage, a real buyer's next-closest look, never a different body style or a non-AMG CLK.
  "mercedesbenz|clkdtm|": { make: "Mercedes-Benz", model: "CLK55 AMG", trim: null, label: "CLK 55 AMG" },
  // SL55 AMG (R230, 2003-2008): the closest comparable is the rest of the R230 SL line (SL500/SL600/
  // SL65 AMG) - same chassis/era, a genuine cross-shop, not a different SL generation. Model stays
  // "SL-Class" (the resolver's own family model for every R230 SL) with the trim DROPPED, since the
  // sibling IS "the rest of the line", not one more narrowly-trimmed SL.
  "mercedesbenz|slclass|sl55amg": { make: "Mercedes-Benz", model: "SL-Class", trim: null, label: "other R230 SLs" }
};
export function siblingFor(make, model, trim) {
  return SIBLING_MODELS[norm(make) + "|" + norm(model) + "|" + norm(trim || "")] || null;
}

// GEARBOX DEFINES MARKET (Round 5 Lane B job, Oct 2026, Part 3). A short, curated list of specific
// GENERATIONS (never a whole model - "M3" alone would wrongly catch the E30/E92/F80/G80 M3s too,
// which do not share the E46's famous SMG-vs-manual divide) where manual vs non-manual is not just a
// refinement after the fact - it is a DIFFERENT CAR a buyer is shopping for, so the gearbox question
// is asked BEFORE the first range (not after, the Round 4 default) when both sides independently
// meet THIN. Keyed norm(make)+"|"+norm(model)+"|"+norm(genCode). A model/generation with no entry
// here keeps the Round 4 after-the-range default; this stays hand-curated, never inferred from a
// price gap alone - adding one is a real product decision about WHEN to ask, not just whether to.
export const GEARBOX_DEFINES_MARKET = new Set([
  // E46 M3 (2001-2006): the SMG (automated manual) vs true 6-speed manual divide is a famously
  // different ownership proposition for this specific car, not a minor price variance.
  "bmw|m3|e46"
]);
export function gearboxDefinesMarketFor(make, model, genCode) {
  return GEARBOX_DEFINES_MARKET.has(norm(make) + "|" + norm(model) + "|" + norm(genCode));
}

function bodyFamilyEq(a, b) {
  const fam = x => { x = String(x || "").toLowerCase(); if (["convertible", "cabriolet", "cabrio", "spyder", "spider", "roadster", "drophead"].includes(x)) return "open"; if (x === "targa") return "targa"; if (["coupe", "berlinetta", "fastback", "fixed head coupe", "fhc"].includes(x)) return "coupe"; if (["sedan", "saloon"].includes(x)) return "sedan"; if (x === "truck") return "truck"; return x; };
  return fam(a) === fam(b);
}
export { norm as _norm, bodyFamilyEq };

// bodiesForYear (Lane B, Oct 15 2026, Job 1b): the bodies this model was offered in for a given model
// year, the union across every curated generation whose production years hold that year. Null when
// the rule has no generation for the year (the caller then keeps the stored body).
export function bodiesForYear(rule, year) {
  const y = Number(year);
  if (!rule || !Number.isFinite(y)) return null;
  const out = new Set();
  let hit = false;
  for (const g of (rule.generations || [])) {
    const r = g.prodYears || g.years;
    if (!r || y < r[0] || y > r[1]) continue;
    hit = true;
    for (const b of (g.bodies || [])) out.add(String(b).toLowerCase());
  }
  if (!hit) return (rule.bodies || []).length ? (rule.bodies || []).map(b => String(b).toLowerCase()) : null;
  return [...out];
}

// VARIANT MARKETS (Lane B, Oct 15 2026, Sam's Job 4): variants the ladder treats as a separate market
// inside one nameplate and trim - engine families, GT and competition versions - named by the
// LISTING'S OWN words, never a price guess. The engine asks "Which {car}?" when both the variant and the
// rest hold eight or more sales and their middle points sit 25 percent or more apart; with fewer
// variant sales the variant is set aside and the scope line names what the range is (lib/onebox.js
// runOneBox, the variant-market block). Extend with facts, one entry per nameplate.
export const VARIANT_MARKETS = [
  { make: /porsche/i, model: /^356/i, key: "carrera", label: "Carrera four-cam", base: "pushrod", re: /\bcarrera\b|\bgs\s*\/?\s*gt\b|\b1500\s*gs\b|\b1600\s*gs\b/i },
  // 1973 Carrera RS 2.7: the Lightweight (M471) and the homologation cars sell about twice the Touring; RSR and RS 3.0 are race cars above both.
  { make: /porsche/i, model: /^911$|^9\d\d$/i, trim: /carrera\s*rs\b/i, key: "lightweight", label: "Lightweight or homologation", base: "Touring", re: /\blightweight\b|\bm471\b|\bhomologation\b|\brsr\b|\brs\s*3\.0\b/i },
  { make: /ferrari/i, model: /^275/i, key: "competizione", label: "Competizione", base: "road", re: /gtb\s*\/\s*c\b|\bcompetizione\b|\bgtb\/c\b/i },
  { make: /jaguar/i, model: /e-?type|xke/i, key: "lightweight", label: "Lightweight or Low Drag", base: "production", re: /\blightweight\b|low[\s-]?drag/i },
  { make: /alfa/i, model: /giulia|gtv|\bgt\b|sprint/i, key: "gta", label: "GTA or TZ", base: "production", re: /\bgta\b|\btz\d?\b/i },
  // PROFESSIONAL RESTORATION (Sam's item 9, Oct 15 2026): restoration named in the listing's own words is a set-aside
  // reason handled like any variant (eight or more on both sides and 25 percent apart asks; otherwise the SMALLER side
  // is set aside and named), never a question that asks the owner to grade their car. Every nameplate; generic, so it
  // sits last and a nameplate's own variant entry is read first. Title words only.
  { make: /./, model: /./, key: "restoration", nonKey: "unrestored", label: "professional restoration", base: "unrestored", smallerSide: true, generic: true,
    re: /\b(?:restored by|restoration by|nut[\s-]?and[\s-]?bolt|concours restoration|rebuilt by|body[\s-]?off|fully restored|freshly restored|professionally restored|rotisserie)\b/i }
];
export function variantMarketsFor(make, model, trim) {
  const mk = String(make || ""), mo = String(model || ""), tr = String(trim || "");
  return VARIANT_MARKETS.filter(v => v.make.test(mk) && v.model.test(mo) && (!v.trim || v.trim.test(tr)));
}
// The nameplate's own (non-generic) variant entry, or null.
export function variantMarketFor(make, model, trim) {
  return variantMarketsFor(make, model, trim).find(v => !v.generic) || null;
}
