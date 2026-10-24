// THE body words (moved out of lib/onebox.js, Oct 23 2026, so the VIN/chassis match in lib/_flags.js reads a listing's body the same way the pools do:
// the title's body word wins, the stored body field is not a fact).
// Body-style buckets (targa/cabriolet/convertible/roadster checked before coupe so a
// "Targa Coupe" title reads as Targa). Chips offered dynamically from what's present.
export const BODY_BUCKETS = [
  { style: "targa", label: "Targa", words: ["targa"] },
  { style: "cabriolet", label: "Cabriolet", words: ["cabriolet", "cabrio"] },
  { style: "convertible", label: "Convertible", words: ["convertible", "drophead", "dhc"] },
  { style: "roadster", label: "Roadster", words: ["roadster", "spyder", "spider"] },
  // Fastback (e41, Sam's Job 1): on a pre-1990 car the fastback is its own body (a 1965 Mustang 2+2 is not the
  // notchback coupe); from 1990 on "Fastback" is a maker's word for the coupe (the S550 Mustang) and reads coupe.
  { style: "fastback", label: "Fastback", words: ["fastback"] },
  { style: "coupe", label: "Coupe", words: ["coupe", "coupé", "berlinetta", "hardtop", "notchback", "gullwing"] },
  { style: "sedan", label: "Sedan", words: ["sedan", "saloon", "berlina"] }
];
export function bodyFromText(text) {
  const t = String(text || "").toLowerCase();
  for (const b of BODY_BUCKETS) if (b.words.some(w => t.includes(w))) return b.style;
  return null;
}
