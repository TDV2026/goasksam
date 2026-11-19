// THE BODY A MODEL CAME IN (Lane B, Nov 6 2026; Sam's call: "the engine must not trust a body the model never came in"). A listing's stored body field comes from the source and is sometimes wrong: a 2023 Subaru WRX,
// a WRX STI and a Lancer Evolution VIII (Cars & Bids) carried body "Convertible", so they drew a convertible pill and answered a convertible search. The listing's own TITLE still names a body when it can (it wins, as
// everywhere); the stored field is used only when the title names none, and only when the model was ever built in that body. When the two conflict the body is NOT STATED (never replaced by a guess), the same
// rule One Box's classifyBody already applied to the models with a curated rule (lib/modelRules.js MODEL_RULES + bodiesForYear). This file is that one rule for every consumer, plus the facts for the models
// that have no MODEL_RULES entry. Extend MODEL_BODY_FACTS from scripts/bodyAudit output (ops task=bodyaudit), one entry per nameplate, only with facts.
import { rulesFor, bodiesForYear, bodyFamilyEq, _norm } from "./modelRules.js";
const CLOSED = ["sedan", "coupe", "wagon", "hatchback", "suv"];
// make -> [{ models: [model name starts], bodies: [bodies the nameplate was built in] }]. The model field must START with the name (squashed), so "WRX STI" and "Impreza WRX" read; "A4 quattro" never reads as Quattro.
export const MODEL_BODY_FACTS = [
  { make: "subaru", models: ["impreza", "wrx", "legacy", "forester", "outback", "svx", "brz", "levorg"], bodies: CLOSED },
  { make: "mitsubishi", models: ["lancer", "evolution", "galant", "starion", "diamante"], bodies: CLOSED },
  { make: "honda", models: ["civic", "accord", "crx", "prelude", "integra", "odyssey", "fit", "insight"], bodies: CLOSED },
  { make: "honda", models: ["s2000"], bodies: ["convertible", "roadster"] },
  { make: "toyota", models: ["camry", "corolla", "avalon", "prius", "echo", "tercel", "aristo", "crown", "chaser", "mark2"], bodies: CLOSED },
  { make: "nissan", models: ["gtr", "altima", "maxima", "sentra", "stanza", "versa"], bodies: CLOSED },
  { make: "ford", models: ["focus", "fiesta", "taurus", "crownvictoria", "contour", "fusion", "sierra"], bodies: CLOSED },
  { make: "dodge", models: ["charger", "neon", "caliber", "magnum", "stealth"], bodies: CLOSED },
  { make: "volkswagen", models: ["jetta", "passat", "gti", "corrado", "scirocco"], bodies: CLOSED },
  { make: "audi", models: ["rs2", "a6", "s6", "rs6", "a8", "s8", "quattro", "sportquattro", "5000", "200"], bodies: CLOSED },
  { make: "bmw", models: ["1m", "m2", "m5", "x3", "x5", "x6", "7series", "m1"], bodies: CLOSED },
  { make: "porsche", models: ["928", "924", "959", "cayenne", "macan", "panamera"], bodies: CLOSED },
  { make: "jaguar", models: ["xj6", "xj8", "xj12", "xjr", "sovereign", "mark2", "stype", "xtype"], bodies: CLOSED },
  { make: "ferrari", models: ["288gto", "f40", "enzo", "250gto", "testarossa", "512bb", "512tr", "f512m", "laferrari"], bodies: ["coupe"] },
  { make: "lamborghini", models: ["countach", "espada", "urraco", "islero", "murcielago lp670"], bodies: ["coupe"] },
  { make: "lancia", models: ["delta", "037", "stratos"], bodies: CLOSED },
  { make: "alfaromeo", models: ["164", "75", "155", "156", "159", "gtv6"], bodies: CLOSED },
  { make: "delorean", models: ["dmc12"], bodies: ["coupe"] }
];
const squash = x => _norm(x);
// the bodies this make, model and year came in, or null when nothing is known (then the stored field is trusted as before)
export function knownBodiesFor(make, model, year) {
  const rule = rulesFor(make, model), fromRule = rule ? bodiesForYear(rule, year) : null;
  if (fromRule && fromRule.length) return fromRule;
  const mk = squash(make), mo = squash(model);
  if (!mk || !mo) return null;
  for (const e of MODEL_BODY_FACTS) if (e.make === mk && e.models.some(n => mo.startsWith(squash(n)))) return e.bodies.slice();
  return null;
}
const FAM = x => { x = String(x || "").toLowerCase().trim(); return x === "pickup" ? "truck" : x === "cabrio" ? "cabriolet" : x; };
const sameFamily = (a, b) => { a = FAM(a); b = FAM(b); const open = ["convertible", "cabriolet", "roadster", "spyder", "spider", "speedster", "drophead"]; if (open.includes(a) && open.includes(b)) return true; if ((a === "hatchback" || a === "wagon") && (b === "hatchback" || b === "wagon")) return true; return bodyFamilyEq(a, b); };
// true when the stored body is a body this model never came in
export function storedBodyConflicts(stored, make, model, year) {
  if (!stored) return false;
  const known = knownBodiesFor(make, model, year);
  if (!known || !known.length) return false;
  return !known.some(b => sameFamily(b, stored));
}
// THE BODY A LISTING'S OWN WORDS NAME WHEN ITS BODY FIELD AND TITLE NAME NONE (Lane B, Nov 11 2026, lane-b-find-paths; live Find "BMW E30 convertible": a 1989 BMW 325is, a coupe, matched with "Some of these may be a convertible. The listing doesn't say.").
// A listing that is silent on its body is the only listing that gets that line. Two readings make it less silent, both facts the listing or the nameplate carries and never a guess:
//   1. the nameplate: a BMW 3 Series trim ending "is" (318is, 320is, 323is, 325is, 328is) was only ever built as a coupe, and one ending "iC" only as a convertible;
//   2. the listing's own first sentence of its description ("This 1989 BMW 325is coupe is ..."), the sentence that says what the car is.
// A body found this way is a stated body: the typed body's filter sees it like a title's, so a coupe never matches a convertible search. Extend NAMEPLATE_BODIES one nameplate at a time, only with facts.
const NAMEPLATE_BODIES = [
  { make: "bmw", re: /\b3(?:18|20|23|25|28)is\b/i, from: 1983, to: 2000, body: "coupe" },
  { make: "bmw", re: /\b3(?:18|25|28)iC\b/i, from: 1990, to: 2000, body: "convertible" }
];
export function bodyOfNameplate(title, make, year) {
  const mk = squash(make), y = Number(year) || 0, t = String(title || "");
  for (const e of NAMEPLATE_BODIES) if (e.make === mk && e.re.test(t) && (!y || (y >= e.from && y <= e.to))) return e.body;
  return null;
}
export function bodyOfDescription(desc, bodyRes, bodies) {
  const first = String(desc || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] || "";
  if (!first || first.length > 400) return null;
  for (const b of bodies) if (bodyRes[b].test(first)) return b;
  return null;
}
