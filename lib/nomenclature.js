// RICK CAREY'S NOMENCLATURE LIST (docs/rick-nomenclature.csv, 589 rows; Lane B, Nov 1 2026). Four INDEPENDENT columns (Body = coachbuilder, Type = body style, Marque, Model): each is its own list, a row means nothing across columns.
// Credit line for any page or copy that uses the list: "Collector car auction data at rickcarey.com".
// This module is the one table for what the list adds: the coachbuilder names merged to one each, and every Type name mapped onto our body pools (lib/bodyWords.js BODY_BUCKETS styles) or listed as intentionally unmapped. A period name is
// understood on input and is NEVER printed back: the pool's own label (BODY_BUCKETS) is what a reader sees.
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// COACHBUILDERS: canonical name -> spelling variants found in the list. Firms that are different companies (Hibbard & Darrin and Darrin; Mulliner Park Ward and H.J. Mulliner; Ghia and Ghia Aigle; Pininfarina-Scaglietti) stay apart.
export const COACHBUILDER_MERGES = {
  "Pininfarina": ["Pinin Farina", "Pininfarina"],
  "Rollston": ["Rollson", "Rollston"],
  "H.J. Mulliner": ["Mulliner", "H.J. Mulliner"],
  "Vanden Plas": ["Van den Plas", "Vanden Plas"],
  "J.S. Inskip": ["Inskip", "J.S. Inskip"],
  "Harold Radford": ["Radford", "Harold Radford"],
  "Erdmann & Rossi": ["Erdmann & Rossi", "Erdmann & Rossi-J.Neuss"],
  "Stabilimenti Farina": ["Farina", "Stablimenti Farina", "Stabilimenti Farina"],
  "Italdesign": ["Ital Design", "Italdesign"],
  "Brunn": ["Brunn & Co.", "Brunn"]
};
// listed, not merged, and why (different firms or a factory body shop, kept as the list names them)
export const COACHBUILDER_KEPT_APART = {
  "Darrin": "Howard Darrin's own firm; Hibbard & Darrin was the earlier partnership",
  "Hibbard & Darrin": "the earlier partnership of Darrin",
  "Mulliner Park Ward": "the 1959 merger of Mulliner and Park Ward, a different firm from H.J. Mulliner",
  "Ghia Aigle": "Ghia's Swiss company, not the Turin firm",
  "Pininfarina-Scaglietti": "a joint body, not either firm alone",
  "Sindelfingen": "Mercedes-Benz's own body plant, a factory body rather than a coachbuilder",
  "Bugatti": "the factory's own bodies",
  "R-RCCW": "Rolls-Royce Custom Coachwork, written as an abbreviation in the list"
};
const CB = new Map();
for (const [canon, vs] of Object.entries(COACHBUILDER_MERGES)) for (const v of vs) CB.set(norm(v), canon);
// a coachbuilder name as the list or a reader writes it -> the one name it is printed under (a name not merged stands for itself)
export function coachbuilderName(name) { const n = norm(name); return CB.get(n) || String(name || "").trim(); }

// MARQUES: not cars. Every other marque in the list is a car marque.
export const NOT_CAR_MARQUES = ["Harley-Davidson", "Vespa", "Not Cataloged"];
export const NOT_CAR_TYPES = ["Motorcycle", "Scooter", "Child's Car"];
// marque spellings that are one make (the list repeats a marque with its partner or its replica); the make the engine knows is the left side
export const MARQUE_COLLAPSES = { "Austin-Healey": ["Healey", "Austin-Healey"], "Abarth": ["Fiat-Abarth", "Abarth"], "Jaguar": ["SS Jaguar", "Jaguar"], "Iso": ["Iso Rivolta", "Iso"], "Panhard": ["Panhard-Levassor", "Panhard"], "Sunbeam": ["Sunbeam-Talbot", "Sunbeam"], "Waverley": ["Pope-Waverley", "Waverley"], "Arnolt": ["Arnolt-Bristol", "Arnolt"], "Shelby": ["Shelby Replica", "Shelby"], "BMW": ["BMW-Isetta", "BMW"] };

// TYPE (body style) -> a body pool. pool: a BODY_BUCKETS / BODY_WORD_RULES style, or null with `why` (intentionally unmapped). `typed`: the typed period name is read by the resolver (periodBodyIn). The pool's own label is printed, never the period name.
//   "title": the engine already reads this word in a sale's title (lib/bodyWords.js bodyFromText) and in a typed search; "period": a period name this module adds on typed input; "none": unmapped on purpose.
const T = (pool, how, why) => ({ pool, how, why: why || null });
export const TYPE_MAP = {
  "2 + 2": T(null, "none", "a seating layout, not a body: the same car is a coupe"),
  "2-Dr. Hardtop": T("coupe", "title"), "4-Dr. Hardtop": T("coupe", "title"), "Riviera 4-Dr. Hardtop": T("coupe", "title"),
  "2-Dr. Sedan": T("sedan", "title"), "4-Dr. Sedan": T("sedan", "title"), "Club Sedan": T("sedan", "title"), "Formal Sedan": T("sedan", "title"), "Sport Sedan": T("sedan", "title"), "Pillarless sedan": T("sedan", "title"), "Sedan": T("sedan", "title"),
  "Sedan Delivery": T("sedan", "title"), "Limousine": T("sedan", "title"), "Berline": T("sedan", "period"), "Tudor": T("sedan", "period"), "Fordor": T("sedan", "period"),
  "2-Dr. Station Wagon": T("wagon", "title"), "Station Wagon": T("wagon", "title"), "Estate Wagon": T("wagon", "title"), "Kombi": T("wagon", "title"), "Shooting Brake": T("wagon", "title"),
  "Depot Hack": T(null, "none", "a period station wagon with a wooden body; sales call it a wagon already, and the word alone says nothing a reader types"),
  "Carryall": T(null, "none", "a period utility wagon, rare; left unmapped so it never pools with a wagon"),
  "3-pos. Drophead Coupe": T("convertible", "title"), "Drophead Coupe": T("convertible", "title"), "Convertible": T("convertible", "title"), "Convertible Coupe": T("convertible", "title"), "Corniche Convertible": T("convertible", "title"),
  "Decapotable": T("convertible", "period"), "Transformable": T(null, "none", "Rick's word for a convertible conversion; rare and maker specific"),
  "Convertible Sedan": T("convertiblesedan", "title"), "Convertible Victoria": T("victoria", "title"), "Victoria Coupe": T("victoria", "title"),
  "Cabriolet": T("cabriolet", "title"), "Cabriolet A": T("cabriolet", "title", "model specific (Mercedes-Benz 500K/540K cabriolet types)"), "Cabriolet B": T("cabriolet", "title", "model specific"), "Cabriolet C": T("cabriolet", "title", "model specific"), "Cabriolet D": T("cabriolet", "title", "model specific"),
  "Cabriolet Series I": T("cabriolet", "title", "model specific"), "Cabriolet Series II": T("cabriolet", "title", "model specific"), "Pf Cabriolet Se I": T("cabriolet", "title", "Ferrari Pininfarina cabriolet, series I; model specific"), "Pf Cabriolet Se II": T("cabriolet", "title", "series II; model specific"),
  "Roadster": T("roadster", "title"), "Spider": T("roadster", "title"), "Spyder": T("roadster", "title"), "California Spyder": T("roadster", "title"), "NART Spyder": T("roadster", "title"), "Barchetta": T("roadster", "title"), "Bugeye Roadster": T("roadster", "title"), "Commercial Roadster": T("roadster", "title"),
  "Competition Roadster": T("roadster", "title"), "Coupe Roadster": T("roadster", "title"), "Highboy Roadster": T("roadster", "title"), "Runabout": T("roadster", "period"),
  "Boattail": T(null, "none", "a tail style found on roadsters, speedsters and cabriolets, not a body of its own; proposed: leave unmapped"),
  "Speedster": T("speedster", "title"),
  "Phaeton": T("phaeton", "title"), "Dual Cowl Phaeton": T("phaeton", "title"), "Sport Phaeton": T("phaeton", "title"),
  "Sports Tourer": T("touring", "title"), "Touring": T(null, "none", "Touring is a wagon on a BMW or Alpina and a coachbuilder (Superleggera) elsewhere: never read as a body on its own"), "Tourster": T("touring", "period"),
  "Torpedo": T("touring", "period"), "Tonneau": T("touring", "period"), "Rear Entrance Tonneau": T("touring", "period"), "Roi-des-Belges": T("touring", "period"), "Dos-a-dos": T("touring", "period"), "Vis-a-vis": T("touring", "period"),
  "Town Car": T("towncar", "title"), "Sedanca deVille": T("towncar", "period"), "Sedanca coupe": T("coupe", "title"), "Landaulette": T("towncar", "period"),
  "Coupe": T("coupe", "title"), "Business Coupe": T("coupe", "title"), "Club Coupe": T("coupe", "title"), "Competition Coupe": T("coupe", "title"), "Corniche Coupe": T("coupe", "title"), "Fixed Head Coupe": T("coupe", "title"), "Rally Coupe": T("coupe", "title"), "Sport Coupe": T("coupe", "title"),
  "Sportsman's Coupe": T("coupe", "title"), "Berlinetta": T("coupe", "title"), "Competizione Berlinetta": T("coupe", "title"), "SWB Berlinetta": T("coupe", "title"), "Gullwing": T("coupe", "title"), "Notchback": T("coupe", "title"),
  "Fastback": T("fastback", "title"), "Hatchback": T("hatchback", "title"), "Pickup": T("pickup", "title"), "SUV": T("suv", "title"), "Targa": T("targa", "title"),
  "Skyliner": T(null, "none", "Ford's retractable hardtop; a model/trim word, proposed: leave unmapped so a Skyliner is not pooled with open cars"),
  "Brougham": T(null, "none", "a period carriage body and a Cadillac trim; ambiguous, left unmapped"), "Landau": T(null, "none", "a vinyl roof on many sedans and coupes; ambiguous"),
  "Volante": T(null, "none", "Aston Martin's name for its convertible, a model word; the resolver reads it with the model"), "Collapsible": T(null, "none", "a period word for a folding top, too rare to map"),
  "Suburban": T(null, "none", "Chevrolet Suburban is a model name"), "Town & Country": T(null, "none", "Chrysler model and trim name"), "Utility": T(null, "none", "a utility body is a pickup or a van depending on the maker"), "Taxi": T(null, "none", "a use, not a body"),
  "Bubble": T(null, "none", "a microcar type (Isetta, Messerschmitt): the model is the car"), "Camargue": T(null, "none", "a model (Rolls-Royce Camargue), not a body"), "Custom": T(null, "none", "a trim level"), "Competition": T(null, "none", "an edition word (lib/vehicleData.js SPECIAL_EDITIONS), not a body"),
  "Sports": T(null, "none", "a class, not a body"), "Two-Seater": T(null, "none", "a seating layout, not a body"), "Street Rod": T(null, "none", "a modified car; set aside of every read already (MODIFIED_TITLE_RE)"),
  "Sprint": T(null, "none", "a model/trim word (Alfa Romeo Giulietta Sprint, Sprint GT/GTV/Speciale), not a body"), "Sprint GT": T(null, "none", "an Alfa Romeo model word"), "Sprint GTV": T(null, "none", "an Alfa Romeo model word"), "Sprint Speciale": T(null, "none", "an Alfa Romeo model word"),
  "Formula 1": T(null, "none", "a racing class"), "Formula 2": T(null, "none", "a racing class"), "Formula 3": T(null, "none", "a racing class"), "Formula Jr.": T(null, "none", "a racing class"), "Formula Libre": T(null, "none", "a racing class"),
  "Indy Car": T(null, "none", "a racing class"), "Can-Am": T(null, "none", "a racing class"), "Group B Rally": T(null, "none", "a racing class"), "Le Mans": T(null, "none", "a racing class"), "Le Mans Replica": T(null, "none", "a racing class (and a replica, set aside of every read)"),
  "Grand Prix": T(null, "none", "a racing class"), "GP 2-Seater": T(null, "none", "a racing class"), "GP Monoposto": T(null, "none", "a racing class"), "Endurance racer": T(null, "none", "a racing class"), "Sports Racer": T(null, "none", "a racing class"),
  "Motorcycle": T(null, "none", "not a car"), "Scooter": T(null, "none", "not a car"), "Child's Car": T(null, "none", "not a car")
};
export const RACING_CLASSES = ["Formula 1", "Formula 2", "Formula 3", "Formula Jr.", "Formula Libre", "Indy Car", "Can-Am", "Group B Rally", "Le Mans", "Le Mans Replica", "Grand Prix", "GP 2-Seater", "GP Monoposto", "Endurance racer", "Sports Racer"];
// the period names read on typed input: each is one phrase, matched as whole words, mapped to a body pool. Only names that mean one body everywhere are listed (see TYPE_MAP "none" for the rest).
const PERIOD = Object.entries(TYPE_MAP).filter(([, v]) => v.how === "period").map(([name, v]) => ({ name, style: v.pool, re: new RegExp("(^|[^a-z0-9])" + norm(name).replace(/ /g, "[\\s-]*") + "(?=$|[^a-z0-9])", "i") }))
  .sort((a, b) => b.name.length - a.name.length);
// "Sedanca deVille" is written many ways; the phrase list above already tolerates hyphens and spaces
const EXTRA = [{ style: "towncar", re: /(^|[^a-z0-9])sedanca[\s-]*de[\s-]*ville(?=$|[^a-z0-9])/i }, { style: "touring", re: /(^|[^a-z0-9])(?:dos[\s-]*[aà][\s-]*dos|vis[\s-]*[aà][\s-]*vis|roi[\s-]*des[\s-]*belges)(?=$|[^a-z0-9])/i }];
// typed text -> { style, word, clean } when it carries ONE period body name, else null. clean has the period name taken out so it is never read as a trim or a model.
export function periodBodyIn(text) {
  const t = String(text || ""); let hit = null;
  for (const p of [...PERIOD, ...EXTRA]) { const m = p.re.exec(t.normalize("NFC")); if (m) { if (hit && hit.style !== p.style) return null; if (!hit || (m[0].length > hit.word.length)) hit = { style: p.style, word: m[0].replace(/^[^a-z0-9]/i, "") }; } }
  if (!hit) return null;
  const clean = [...PERIOD, ...EXTRA].reduce((s, p) => s.replace(p.re, "$1 "), t).replace(/\s+/g, " ").trim();
  return { style: hit.style, word: hit.word, clean };
}
