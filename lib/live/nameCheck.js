// Name check (Lane C, Oct 2026): every make, model, generation and body style a reply states must appear
// in that turn's tool results or in the buyer's own words, the same way an unsupported number is caught.
// A name counts as supported only as a whole token ("XJ" is not supported by "XJS" or "XJ-S"), plurals
// allowed ("Carreras" by "Carrera", "coupes" by "coupe"). Used by the Tasks writer (research, the opening
// update, match updates; task emails send that same text) through the shared guard's extraCheck hook.
import { MAKE_ALIASES, EXTRA_MAKES, PREWAR_MAKES } from "../vehicleData.js";
import { BODIES } from "./search.js";

const CORE_MAKES = ["Acura", "Alfa Romeo", "Alpine", "AMC", "Aston Martin", "Audi", "Austin-Healey", "Austin", "Bentley", "BMW", "Bugatti", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Citroen", "Datsun", "De Tomaso", "DeLorean", "Dodge", "Ferrari", "Fiat", "Ford", "GMC", "Honda", "Hudson", "Hummer", "Infiniti", "International", "Iso", "Jaguar", "Jeep", "Jensen", "Lamborghini", "Lancia", "Land Rover", "Lexus", "Lincoln", "Lotus", "Maserati", "Mazda", "McLaren", "Mercedes-Benz", "Mercedes", "Mercury", "MG", "Mini", "Mitsubishi", "Morgan", "Nash", "Nissan", "Oldsmobile", "Opel", "Pagani", "Plymouth", "Pontiac", "Porsche", "Range Rover", "Renault", "Rolls-Royce", "Saab", "Shelby", "Studebaker", "Subaru", "Sunbeam", "Suzuki", "Toyota", "Triumph", "TVR", "Volkswagen", "Volvo", "Willys"];
const MAKES = [...new Set([...CORE_MAKES, ...MAKE_ALIASES.map(a => a.make), ...EXTRA_MAKES, ...PREWAR_MAKES])].sort((a, b) => b.length - a.length);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAKE_RE = new RegExp(`\\b(${MAKES.map(esc).join("|")})\\b`, "g");
// Two-letter state codes and other capitals that are not car names.
const NOT_NAMES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC US USA UK EU VIN USD AI OK TV".split(" "));
// Words that end a model phrase after a make ("Porsche 911 in Scottsdale").
const STOP = new Set("in on at the a an with from for and or of is was has had sold listed ending closing came one this that its".split(" "));
const BODY_WORDS = [...new Set([...BODIES, "fastback", "hardtop", "cabrio", "estate", "saloon", "truck"])];

function supported(token, corpus) {
  const t = token.toLowerCase().replace(/[’']s$/, "");
  const forms = new Set([t]);
  if (/[a-z]s$/.test(t)) forms.add(t.slice(0, -1));
  if (/es$/.test(t)) forms.add(t.slice(0, -2));
  if (/\ds$/.test(t)) forms.add(t.slice(0, -1));           // "997s"
  for (const f of forms) if (f && new RegExp(`(^|[^a-z0-9-])${esc(f)}($|[^a-z0-9-])`).test(corpus)) return true;
  return false;
}

// The names a reply states that the corpus (tool results + the buyer's words) does not carry.
export function unsupportedNames(reply, corpusParts) {
  const corpus = (Array.isArray(corpusParts) ? corpusParts : [corpusParts]).map(x => typeof x === "string" ? x : JSON.stringify(x || "")).join(" \n ").toLowerCase();
  const text = String(reply || "");
  const bad = new Set();
  // 1. A make and the model words that follow it ("Jaguar XJ", "Porsche 911 Carrera S").
  for (const m of text.matchAll(MAKE_RE)) {
    if (!supported(m[1], corpus)) bad.add(m[1]);
    const rest = text.slice(m.index + m[0].length).split(/\s+/).filter(Boolean);
    for (let i = 0; i < Math.min(4, rest.length); i++) {
      const tok = rest[i].replace(/[,.;:!?)"]+$/, "");
      if (!tok || STOP.has(tok.toLowerCase()) || !/^[A-Z0-9]/.test(tok) || /^(19|20)\d{2}$/.test(tok)) break;
      if (!supported(tok, corpus)) bad.add(`${m[1]} ${tok}`);
      if (/[,.;:!?]$/.test(rest[i])) break;
    }
  }
  // 2. Model codes anywhere ("XJ", "V12", "GTS", "DTM") and generation numbers with a plural ("997s").
  for (const m of text.matchAll(/(?<![A-Za-z0-9-])([A-Z][A-Z0-9]*[A-Z0-9](?:-[A-Z0-9]+)?)(?![A-Za-z0-9-])/g)) {
    const tok = m[1];
    if (NOT_NAMES.has(tok) || !/[A-Z]{2}|[A-Z]\d|\d[A-Z]/.test(tok) || MAKES.includes(tok)) continue;
    if (!supported(tok, corpus)) bad.add(tok);
  }
  for (const m of text.matchAll(/(?<![\d,.$])(\d{3})s\b/g)) if (!supported(m[1], corpus)) bad.add(m[1] + "s");
  // 3. Body styles ("coupes" for a car the tools call a cabriolet).
  for (const w of BODY_WORDS) for (const m of text.matchAll(new RegExp(`\\b${esc(w)}(?:e?s)?\\b`, "gi"))) if (!supported(m[0], corpus)) bad.add(m[0].toLowerCase());
  return [...bad];
}
