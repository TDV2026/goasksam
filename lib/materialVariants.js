// Materially-different, higher-value variants of a SHARED nameplate (Sep 2026, CLK DTM /
// Blower follow-up audit). When the resolved TRIM is one of these, the evidence ladder must
// NOT drop the trim and widen to the base-model pool - that would price a rare halo off
// ordinary cars (a $50M 250 GTO read off $1M 250s, a Blower off a standard 4½ Litre tourer,
// a Boss 429 off a base Mustang). buildLadder keeps only the trim rungs + the make-context
// rung when this fires, so a thin variant lands thin on its own narrowest trim rung or falls
// to make context, honestly, never the base-model pool.
//
// Two ways a variant is protected: (1) it is folded into the MODEL at resolution time so no
// trim exists to drop (CLK DTM -> model "CLK DTM"; Blower -> model "4½ Litre Supercharged");
// (2) it stays a trim but is listed here so the ladder won't drop it. This file is #2.
//
// Scoped by make (and model where a trim word is otherwise ordinary, e.g. "Roadster" is only
// material for the 300SL). Curated + extensible. Over-flagging is SAFE: it only changes the
// THIN-trim widening path; a dense variant still lands on its own trim rung unchanged.
const F = "ferrari", C = "chevrolet", P = "porsche", MB = "mercedes-benz", D = "dodge", FO = "ford", J = "jaguar", AM = "aston martin", L = "lamborghini";

export const MATERIAL_VARIANTS = [
  // Ferrari halo/coachwork variants sit multiples above the base nameplate.
  { make: F, trimRe: /\b(gto|swb|lwb|lm|tdf|competizione|comp|speciale|aperta|monza|stradale|scaglietti)\b/i },
  // Corvette top variants (ZR1/Z06 run 2-3x base; Callaway/big-block 427 command a premium).
  { make: C, model: /corvette/i, trimRe: /\b(zr-?1|z06|z07|grand\s*sport|callaway|427|split[\s-]?window)\b/i },
  // Porsche 911 ultra-rare halos (R, S/T, Sport Classic, Speedster, GT2 sit far above base).
  { make: P, model: /911|9\d{2}/, trimRe: /\b(r|s\/?t|sport\s*classic|speedster|gt2)\b/i },
  // 300SL Roadster vs Gullwing (and alloy cars) are materially different within "300SL".
  { make: MB, model: /300\s?sl/i, trimRe: /\b(gullwing|roadster|alloy)\b/i },
  // AMG "Black Series" is the halo of its line everywhere.
  { make: MB, trimRe: /\bblack\s*series\b/i },
  // Dodge/Mopar halos (Demon, Redeye, Super Bee, Six Pack) far above the base car.
  { make: D, trimRe: /\b(demon|redeye|super\s*bee|six\s*pack|a12|hemi)\b/i },
  // Mustang halos: Boss 429/302, Shelby GT350/GT500, Cobra Jet, Mach 1 sit far above base.
  { make: FO, model: /mustang/i, trimRe: /\b(boss|shelby|gt350|gt500|cobra\s*jet|mach\s*1)\b/i },
  // Jaguar E-Type Lightweight, Aston Zagato, Lamborghini SV/SVJ halos.
  { make: J, trimRe: /\blightweight\b/i },
  { make: AM, trimRe: /\bzagato\b/i },
  { make: L, trimRe: /\b(sv|svj|superveloce|jota)\b/i }
];

export function isMaterialVariant(vehicle) {
  if (!vehicle) return false;
  const make = String(vehicle.make || "").toLowerCase();
  const model = String(vehicle.model || "");
  const trim = String(vehicle.fetchTrim || vehicle.trim || "");
  if (!trim) return false;
  return MATERIAL_VARIANTS.some(v =>
    (!v.make || v.make === make) &&
    (!v.model || v.model.test(model)) &&
    v.trimRe.test(trim));
}
