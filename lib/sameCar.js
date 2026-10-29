// SAME CAR, TWO NAMES (Sam's rulings, Oct 29 2026). A small hand-made table; the engine never guesses that two names are one car.
//   Previa and Estima are the same car (Toyota's minivan, sold under both names).
//   Discovery and LR4 are the same car for the 2010 to 2016 Discovery 4 only; an earlier Discovery is not an LR4 (and the LR3 is not in this table).
//   XKR is a trim of the XK: an XK pool holds the XKR sales, each card under its own title (rule 25), so an XKR card reads XKR.
//   Vanagon and Bus are different cars and stay separate (listed in SEPARATE so a check keeps them apart).
// Used in three places: the archive read (the other name's rows join the pool, inside the years), the receipts invariant (a card filed under the other name is the resolved car, inside the
// years) and nothing else. Every entry names both sides, so a change to the table is a change a reader can see.
export const SAME_CAR = [
  { make: "Toyota", names: ["Previa", "Estima"], years: null, kind: "same" },
  { make: "Land Rover", names: ["Discovery", "LR4"], years: [2010, 2016], kind: "same" },
  { make: "Jaguar", base: "XK", trims: ["XKR"], years: null, kind: "trim" }
];
export const SEPARATE = [
  { make: "Volkswagen", names: ["Vanagon", "Bus"] },
  { make: "Land Rover", names: ["Discovery", "LR3"] },   // the LR3 is a Discovery 3 abroad; Sam's ruling covers the LR4 only
  { make: "Jaguar", names: ["XK", "XK8"] }
];
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]/g, "");
const makeIs = (e, make) => { const a = norm(e.make), b = norm(make); return !!b && (a === b || a.includes(b) || b.includes(a)); };
const inYears = (e, year) => { const y = Number(year); return !e.years || !Number.isFinite(y) || (y >= e.years[0] && y <= e.years[1]); };
// the other names whose rows belong in this model's pool (never the model itself)
export function sameCarNames(make, model) {
  const m = norm(model), out = [];
  for (const e of SAME_CAR) {
    if (!makeIs(e, make)) continue;
    if (e.kind === "same") { if (e.names.some(n => norm(n) === m)) for (const n of e.names) if (norm(n) !== m) out.push(n); }
    else if (norm(e.base) === m) out.push(...e.trims);
  }
  return out;
}
// is a row filed under `rowModel` (or titled with it) the car `model`, in the row's year?
export function sameCarRowOk(make, model, rowModel, rowYear, rowTitle) {
  const ym = /\b(?:18|19|20)\d\d\b/.exec(String(rowTitle || "")); if ((rowYear == null || !Number.isFinite(Number(rowYear))) && ym) rowYear = Number(ym[0]);   // a card with no year field reads it off its title
  const m = norm(model), r = norm(rowModel), t = " " + String(rowTitle || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  for (const e of SAME_CAR) {
    if (!makeIs(e, make) || !inYears(e, rowYear)) continue;
    const mine = e.kind === "same" ? e.names.some(n => norm(n) === m) : norm(e.base) === m;
    if (!mine) continue;
    const others = e.kind === "same" ? e.names.filter(n => norm(n) !== m) : e.trims;
    if (others.some(n => norm(n) === r || (!!rowTitle && t.includes(" " + String(n).toLowerCase() + " ")))) return true;
  }
  return false;
}
// a read of the other name's rows is held to the years of the ruling (an LR4 outside 2010 to 2016 is not a Discovery 4)
export function sameCarYearOk(make, model, altName, rowYear) {
  const m = norm(model), a = norm(altName);
  for (const e of SAME_CAR) {
    if (!makeIs(e, make) || e.kind !== "same") continue;
    const names = e.names.map(norm);
    if (names.includes(m) && names.includes(a)) return inYears(e, rowYear);
  }
  return true;
}
