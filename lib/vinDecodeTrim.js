// THE TRIM A VIN'S DECODE STANDS FOR (Lane B, Nov 11 2026). VIN WP0AF2A92GS187171 (2016 Porsche 911 GT3 RS) decodes at vPIC as Trim "RS" (and Series "Turbo/Turbo S"); lib/vehicle.js passed "RS" on as the trim, the resolver could not hold a bare "RS",
// and Market Check read a plain 2016 911 coupe: $63,000 to $85,500 on 9 sales, where the GT3 RS reads $194,000 to $248,000 on 19.
// CAUSE: vPIC's trim field is a fragment of the trim ("RS" for GT3 RS), a bundle of equipment ("Stingray 3LZ w/Z06", "Premium 2LZ w/Z06", "Preferred 2LT", "ZR1 Custom - 3ZR"), the model's body ("Shelby Coupe" for a GT350, a GT350R and a GT500 alike), or blank (a 2006 Z06),
// and the decode handed whatever it held on as the trim. SWEEP of 183 live pool VINs (Porsche, BMW M, Mercedes-AMG, Corvette, Shelby; scripts/fixtures/vinDecodeTrims.json): the trim the VIN stands for is lost or garbled on these shapes, every one of them below.
// RULE, the same for every make: (1) a VIN CODE ROW (positions 1 to 8, years, make, model; each row carries the titles it came from) names the trim the code stands for, and wins; (2) else the make's TRIM WORDS are read out of the decode string
// (the most specific one: Z06 beside Stingray, ZR1 beside Premium 3ZR) and the equipment around them is dropped; (3) else a fragment the engine cannot hold ("RS" alone on a 911) is no trim, never the fragment; (4) a list of variants stays no trim (vehicle.js vinTrimIsList).
// Better no trim than a wrong one: a code that does not tell the trim (a 997 GT3 and GT3 RS share WP0AC2A9) is not in the table, and its decode stays what vPIC says.
import { PORSCHE_911_TRIMS } from "./vehicleData.js";
// THE CODE TABLE IS DATA, one row per code, each with the evidence it came from; a code not here is never guessed. Rows come from VINs in the live pool whose own title names the trim (Nov 11 2026), checked against vPIC;
// scripts/learnVinTrimCodes.mjs prints the archive's prefixes for a person to confirm and add more.
export const VIN_CODE_TRIMS = [
  { make: "Porsche", model: "911", vin: /^WP0AF2A9/, years: [2016, 2024], trim: "GT3 RS", source: "live pool Nov 11 2026: WP0AF2A92GS187171, WP0AF2A93GS187213 (2016) and two 2024 VINs, all titled GT3 RS; vPIC says RS or GT3 RS" },
  { make: "Chevrolet", model: "Corvette", vin: /^1G1YY26E/, years: [2005, 2006], trim: "Z06", source: "live pool Nov 11 2026: 1G1YY26E965113993 titled 2006 Corvette Z06; vPIC names no trim" },
  { make: "Ford", model: "Mustang", vin: /^1FA6P8JZ/, years: [2016, 2020], trim: "Shelby GT350", source: "live pool Nov 11 2026: 1FA6P8JZ6G5521499 titled 2016 Shelby GT350; vPIC says Shelby Coupe" },
  { make: "Ford", model: "Mustang", vin: /^1FATP8JZ/, years: [2016, 2020], trim: "Shelby GT350R", source: "live pool Nov 11 2026: 1FATP8JZ9G5524660 titled 2016 Shelby GT350R; vPIC says Shelby Coupe" },
  { make: "Ford", model: "Mustang", vin: /^1ZVBP8[JK]Z/, years: [2013, 2014], trim: "Shelby GT500", source: "live pool Nov 11 2026: 1ZVBP8JZ5D5266412 (2013 coupe) and 1ZVBP8KZ2E5206832 (2014 convertible) titled Shelby GT500; vPIC says Shelby Coupe or Shelby Convertible" }
];
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function vinCodeTrim({ vin, year, make, model }) {
  const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), y = Number(year);
  if (v.length !== 17) return null;
  const r = VIN_CODE_TRIMS.find(x => norm(x.make) === norm(make) && norm(x.model) === norm(model) && y >= x.years[0] && y <= x.years[1] && x.vin.test(v));
  return r ? { trim: r.trim, source: r.source } : null;
}
// A MAKE'S TRIM WORDS, most specific first: the decode string is searched for the first of these it holds (whole words, case and punctuation aside); what surrounds it (Premium, Preferred, Custom, 3ZR, 3LZ, "w/Z51") is equipment and is dropped.
export const TRIM_WORDS = [
  { make: "Chevrolet", model: "Corvette", words: ["ZR1X", "ZR1", "Z06", "Grand Sport", "E-Ray"]   /* Stingray is the plain model name, not a trim the resolver holds ("2017 Corvette Stingray" asks a question), so it is no trim word */, dropFragments: ["stingray"], equipment: /\b(?:premium|preferred|custom|\d(?:LT|LZ|ZR)|w\/Z\d\d|1LT|2LT|3LT|1LZ|2LZ|3LZ)\b/gi },
  { make: "Ford", model: "Mustang", words: ["Shelby GT500KR", "Shelby GT500", "Shelby GT350R", "Shelby GT350", "Boss 302", "Mach 1", "Bullitt"] },
  { make: "BMW", model: /^M[2-8]$|^1M$|^X[3-6] ?M$|^Z4 ?M$/i, words: ["CSL", "CS", "GTS", "Competition"] },
  { make: "Porsche", model: "911", words: PORSCHE_911_TRIMS.filter(t => /GT[234]|RS|Turbo|Targa|Speedster|Sport Classic|Carrera/.test(t)), dropFragments: ["rs"] }
];
const esc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
const hasWords = (raw, w) => new RegExp("(^|[^a-z0-9])" + esc(w).replace(/\s+/g, "[\\s-]*") + "($|[^a-z0-9])", "i").test(raw);
// the make's trim word the decode string holds, or null (a string made only of equipment is null)
const tableFor = (make, model) => TRIM_WORDS.find(x => norm(x.make) === norm(make) && (x.model instanceof RegExp ? x.model.test(String(model || "")) : norm(x.model) === norm(model))) || null;
export function trimWordIn(raw, make, model) {
  const t = tableFor(make, model); if (!t) return null;   // no vocabulary for this make: the decode's own trim stands
  const s = String(raw || "");
  for (const w of t.words) if (hasWords(s, w)) return w;
  return null;
}
// the Mercedes-AMG decode writes the S variant as "E63 AMG-S"; the car is the "E63 S AMG" (the hyphen made the resolver read "E63 E"). The canonical text of an E-Class badge car leaves the model out ("2015 Mercedes-Benz E63 S AMG"): "E-Class E63" reads "E63 E".
export const canonicalCarWords = d => [d.year, d.make, d.make === "Mercedes-Benz" && d.model === "E-Class" && /\bE\d{2,3}\b/.test(String(d.trim || "")) ? null : d.model, d.trim].filter(Boolean).join(" ");
export const amgS = t => String(t || "").replace(/\b([A-Z]{1,3}\d{2,3})\s+AMG-S\b/i, "$1 S AMG");
// THE DECISION: { trim, via } for one decode. `raw` is vPIC's Trim, `cleaned` what lib/vehicle.js already made of it (a list of variants is null and stays null).
export function decodeTrimFor({ vin, year, make, model, raw, cleaned }) {
  const code = vinCodeTrim({ vin, year, make, model });
  if (code) return { trim: code.trim, via: "vin_code" };
  if (!cleaned) return { trim: null, via: "decode" };
  const word = trimWordIn(raw, make, model), entry = tableFor(make, model);
  if (word) return { trim: word, via: "trim_word" };
  if (entry && entry.dropFragments && entry.dropFragments.includes(norm(cleaned))) return { trim: null, via: "fragment" };   // a fragment the engine cannot hold ("RS" alone on a 911) is no trim
  if (entry && entry.equipment) { const t = String(cleaned).replace(entry.equipment, " ").replace(/\s+-\s+|\s+/g, " ").trim(); const bare = !t || (entry.dropFragments || []).includes(norm(t)); return { trim: bare ? null : t, via: bare ? "equipment_only" : "decode" }; }   // equipment only ("Preferred 2LT") is no trim
  return { trim: amgS(cleaned) || null, via: "decode" };
}
