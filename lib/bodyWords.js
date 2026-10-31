// THE body words (moved out of lib/onebox.js, Oct 23 2026, so the VIN/chassis match in lib/_flags.js reads a listing's body the same way the pools do:
// the title's body word wins, the stored body field is not a fact).
// Body-style buckets (targa/cabriolet/convertible/roadster checked before coupe so a
// "Targa Coupe" title reads as Targa). Chips offered dynamically from what's present.
export const BODY_BUCKETS = [
  { style: "targa", label: "Targa", words: ["targa"] },
  { style: "cabriolet", label: "Cabriolet", words: ["cabriolet", "cabrio"] },
  // THE CLASSIC BODIES ARE SEPARATE POOLS (Lane B, Oct 30 2026, a reader's "1930 Packard 745 Deluxe Eight Roadster" returned three Phaetons as in range): a Convertible Sedan, Phaeton (four-door open, Tourer), Speedster, Victoria and Town Car are not Roadsters or Convertibles.
  { style: "convertiblesedan", label: "Convertible Sedan", words: ["convertible sedan", "convertible saloon"] },
  { style: "towncar", label: "Town Car", words: ["town car", "towncar", "town cabriolet", "town car cabriolet"] },
  { style: "victoria", label: "Victoria", words: ["victoria"] },
  { style: "phaeton", label: "Phaeton", words: ["phaeton"] },   // four-door open
  { style: "touring", label: "Touring", words: ["tourer", "touring car"] },   // an open touring body (Tourer 6 live titles); a BMW or Alpina Touring is a wagon (BODY_WORD_RULES)
  { style: "speedster", label: "Speedster", words: ["speedster"] },   // Oct 29 2026 (live read, bodywords): Speedster 10 live titles were not read; its own body since Oct 30
  { style: "convertible", label: "Convertible", words: ["convertible", "drophead", "dhc"] },
  { style: "roadster", label: "Roadster", words: ["roadster", "spyder", "spider", "barchetta"] },
  // Fastback (e41, Sam's Job 1): on a pre-1990 car the fastback is its own body (a 1965 Mustang 2+2 is not the
  // notchback coupe); from 1990 on "Fastback" is a maker's word for the coupe (the S550 Mustang) and reads coupe.
  { style: "fastback", label: "Fastback", words: ["fastback"] },
  { style: "coupe", label: "Coupe", words: ["coupe", "coupé", "berlinetta", "hardtop", "notchback", "gullwing"] },
  { style: "sedan", label: "Sedan", words: ["sedan", "saloon", "berlina", "limousine"] }
];
// THE REST OF THE BODY WORDS (Lane B, Oct 29 2026, the 2008 BMW 3-Series: a "335i Touring M Sport" and a "328xi Sports Wagon" were counted as sales that "do not say their body"): the wagons, hatchbacks, SUVs, pickups and vans. These are matched as whole
// words (a substring test would find "van" in "Vanquish" and "advance"); "Touring" is a wagon only on a BMW or Alpina title (a Superleggera Touring body is a coachbuilder), "estate" only as a body ("estate sale" and "Estate of" are not).
export const BODY_WORD_RULES = [
  { style: "wagon", label: "Wagon", re: /\b(?:wagon|station\s+wagon|sports\s+wagon|shooting\s?brake|sportbrake|kombi|avant|(?<!from the )estate(?!\s+(?:sale|of|collection)))\b/ },
  { style: "wagon", label: "Wagon", re: /\btouring\b/, when: t => /\b(?:bmw|alpina)\b/.test(t) && !/superleggera/.test(t) },
  { style: "hatchback", label: "Hatchback", re: /\b(?:hatchback|hatch|liftback|gran\s+turismo|sportback)\b/ },
  { style: "suv", label: "SUV", re: /\b(?:suv|sport\s+utility)\b/ },
  { style: "pickup", label: "Pickup", re: /\b(?:pickup|pick-up|crew\s+cab|extended\s+cab|regular\s+cab|truck)\b/ },
  { style: "van", label: "Van", re: /\b(?:van|minivan|microbus)\b/ }
];
// A BODY WORD INSIDE A MODEL'S OWN NAME IS NOT A BODY (Lane B, Oct 29 2026, Sam's Find screen for wagons: a Ram pickup with a roof tent showed among the wagons. The Ram is a Power Wagon: the word "wagon" in its title read as the wagon body). The name is a pickup (or nothing at all), never a wagon.
// Each entry is a phrase where the body word belongs to the name: it gives that car's own body, or null (the phrase is removed and the rest of the title is read). The class is every body word that is also part of a name: Power Wagon (pickup), Traction Avant (a Citroen sedan, not an Avant wagon),
// Chuck, Paddy and Covered Wagon, Wagon Wheels, Van Diemen and Van den Plas (names, not vans), Avant Garde (a word, not a wagon).
export const BODY_NAME_PHRASES = [
  { re: /\b(?:crown|grand)\s+victoria\b/, style: "sedan" }, { re: /\b(?:lincoln\s+town\s+car|town\s+car\s+(?:signature|executive|cartier))\b/, style: "sedan" }, { re: /\b(?:volkswagen|vw)\s+phaeton\b/, style: "sedan" },
  { re: /\bpower\s+wagons?\b/, style: "pickup" }, { re: /\btraction\s+avant\b/, style: "sedan" },
  { re: /\b(?:chuck|paddy|covered|conestoga)\s+wagons?\b/, style: null }, { re: /\bwagon\s+(?:wheels?|train|master)\b/, style: null },
  { re: /\bvan\s+(?:diemen|dieman|den\s+plas|dyke|halen|hool)\b/, style: null }, { re: /\bavant[\s-]+garde\b/, style: null }
];
export function bodyFromText(text) {
  let t = String(text || "").toLowerCase();
  for (const n of BODY_NAME_PHRASES) if (n.re.test(t)) { if (n.style) return n.style; t = t.replace(n.re, " "); }
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  for (const r of BODY_WORD_RULES) if (r.re.test(t) && (!r.when || r.when(t))) return r.style;
  return null;
}
