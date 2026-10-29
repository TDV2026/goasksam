// THE body words (moved out of lib/onebox.js, Oct 23 2026, so the VIN/chassis match in lib/_flags.js reads a listing's body the same way the pools do:
// the title's body word wins, the stored body field is not a fact).
// Body-style buckets (targa/cabriolet/convertible/roadster checked before coupe so a
// "Targa Coupe" title reads as Targa). Chips offered dynamically from what's present.
export const BODY_BUCKETS = [
  { style: "targa", label: "Targa", words: ["targa"] },
  { style: "cabriolet", label: "Cabriolet", words: ["cabriolet", "cabrio"] },
  { style: "convertible", label: "Convertible", words: ["convertible", "drophead", "dhc", "phaeton", "tourer"] },   // an open touring body (Tourer 6 live titles, Phaeton 2)
  { style: "roadster", label: "Roadster", words: ["roadster", "spyder", "spider", "speedster", "barchetta"] },   // Oct 29 2026 (live read, bodywords): Speedster 10 live titles and Barchetta 2 were not read
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
export function bodyFromText(text) {
  const t = String(text || "").toLowerCase();
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  for (const r of BODY_WORD_RULES) if (r.re.test(t) && (!r.when || r.when(t))) return r.style;
  return null;
}
