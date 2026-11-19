// A MODEL NAME WITH NO MAKE, AND A MAKE AND MODEL THE RESOLVER'S TAXONOMY DOES NOT HOLD, NEVER READ AS NOTHING (Lane B, Nov 1 2026; a reader typed "Capri" and "Mercury Capri" and got nothing).
// CAUSE: the resolver knows a model only through the seeded taxonomy; "Capri" has no make there (or sits under one make only), so a bare "Capri" resolved to no car on Find, Market Check, Tasks and the chat,
// and "Ford Capri" resolved to the make with no model. The generation table (lib/generations.js) and the badge twin table (lib/badgeAliases.js) already hold these cars; this step reads them.
// It runs after the resolver and only fills what the resolver left empty: a model the resolver found is never replaced. A model name that sits under two makes (BADGE_TWINS: Capri under Ford and Mercury)
// with no make typed reads as the first make with twinMakes set, so every surface reads every badge; a typed make keeps the typed make.
import { CURATED_GENERATIONS } from "./generations.js";
import { BADGE_TWINS } from "./badgeAliases.js";
import { genPhraseOf } from "./genPhrase.js";

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const words = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
// Words that describe the search and name no model ("cheap", "for sale", "live").
const FILLER = new Set(("a an the any some and or of for in on to from up my me i we you with near live sale selling buy buying want looking find show classic vintage old antique cheap nice good great best rare original " +
  "project clean fast fun cool weekend daily driver car cars truck trucks under over about around what whats how is are it its this that these those have has own need please thanks").split(" "));

let TABLE = null;
// Every (make, model) the repo knows: the generation table, plus each twin group's makes. { makes: [..], model, key }.
export function knownModels() {
  if (TABLE) return TABLE;
  const by = new Map();
  const add = (make, model) => { const k = norm(model); if (!by.has(k)) by.set(k, { model, makes: [] }); const e = by.get(k); if (!e.makes.some(m => norm(m) === norm(make))) e.makes.push(make); };
  for (const g of CURATED_GENERATIONS) add(g.make, g.model);
  for (const t of BADGE_TWINS) for (const mk of t.makes) add(mk, t.model);
  // a twin group reads with its own first make first
  for (const t of BADGE_TWINS) { const e = by.get(norm(t.model)); if (e) e.makes = t.makes.concat(e.makes.filter(m => !t.makes.some(x => norm(x) === norm(m)))); }
  TABLE = [...by.values()].sort((a, b) => words(b.model).length - words(a.model).length);
  return TABLE;
}
export function twinMakesOf(make, model) {
  const t = BADGE_TWINS.find(g => norm(g.model) === norm(model));
  return t && t.makes.some(m => norm(m) === norm(make)) ? t.makes.filter(m => norm(m) !== norm(make)) : [];
}
// The car the words name from the tables: { make, model, bare, twinMakes, left } or null. Years and a generation phrase are taken out first; what is left must be the model name (plus at most
// two short words, which are returned as `left`: a trim the reader typed). A make the reader typed must be one of the model's makes.
export function bareModelIn(raw, typedMake) {
  let t = String(raw || "").replace(/\b(?:18|19|20)\d\d\b/g, " ");
  const gp = genPhraseOf(t); if (gp) t = t.replace(gp.text, " ");
  const all = words(t).filter(w => !FILLER.has(w));
  if (!all.length) return null;
  const tm = words(typedMake);
  const cut = (arr, sub) => { const j = (" " + arr.join(" ") + " ").indexOf(" " + sub.join(" ") + " "); if (j < 0) return null; const k = (" " + arr.join(" ") + " ").replace(" " + sub.join(" ") + " ", " ").split(/\s+/).filter(Boolean); return k; };
  for (const e of knownModels()) {
    const mw = words(e.model);
    const rest = cut(all, mw); if (!rest) continue;                          // the model name is in the words (its own words may be a make's too: "Range Rover" under Land Rover)
    // the make the reader typed: the resolver's, or one of this model's makes named in the words ("mercury capri")
    let tmk = tm.length ? typedMake : "";
    if (!tmk) { const m = e.makes.find(mk => words(mk).every(w => rest.includes(w))); if (m) tmk = m; }
    const left = rest.filter(w => !words(tmk).includes(w));
    if (left.length > 2 || left.some(w => w.length > 4)) continue;
    let make;
    if (tmk) { make = e.makes.find(m => norm(m) === norm(tmk)); if (!make) continue; }
    else make = e.makes[0];
    const bare = !tmk;
    return { make, model: e.model, bare, twinMakes: bare ? e.makes.filter(m => norm(m) !== norm(make)) : [], left };
  }
  return null;
}
// After the resolver: fill a missing make or model from the tables, or widen a bare model to its twins. The resolver's own year question is kept in its own words ("Got it, a Ford Capri. What year is it?"); a lookup that
// timed out, and a car the resolver already read (make and model both found), are left exactly as they were.
export function bareModelStep(r, rawInput) {
  if (!r || r.status === "lookup_timeout" || r.error) return r;
  const v = r.vehicle || {};
  if (v.make && v.model && !v.modelUnconfirmed) return r;                  // the resolver read a make and a model: untouched
  const typedMake = v.make && r.status !== "needs_confirmation" && words(rawInput).includes(words(v.make)[0]) ? v.make : "";   // a make the resolver only guessed at ("Mercury" read as "Mercer") is not a typed make
  const hit = bareModelIn(rawInput, typedMake);
  if (!hit) return r;
  const car = { ...v, make: hit.make, model: hit.model, confidence: v.confidence === "high" ? "high" : "medium" };
  if (hit.bare) { car.bareModel = true; car.twinMakes = hit.twinMakes; }
  // A GENERATION CODE IS THE GENERATION, NEVER A TITLE FENCE (lane-b-find-gens, Nov 11 2026; "BMW 3 Series E30" found nothing: the left-over word "E30" was held as a word every listing had to print, but a live 325i is dated into the E30 by the generation table, not titled with it,
  // and the noun printed it twice, "E30 E30 convertibles"). The words that are this car's generation codes (lib/generations.js) set the generation; only what is left over stays a fence.
  const sq = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const rows = CURATED_GENERATIONS.filter(g => sq(g.make) === sq(hit.make) && (sq(g.model) === sq(hit.model) || sq(g.model).startsWith(sq(hit.model))));
  const genRow = hit.left.length ? rows.find(g => sq(g.code) === sq(hit.left.join(""))) || rows.find(g => hit.left.length === 1 && sq(g.code) === sq(hit.left[0])) : null;
  if (genRow) { car.genCode = genRow.code; car.generation = car.generation || genRow.code; }
  else if (hit.left.length) car.trimFence = hit.left.join(" ").toUpperCase();
  const hasYear = !!(car.year || car.yearRange);
  const clar = hasYear ? null : { kind: "year", question: `Got it, a ${hit.make} ${hit.model}. What year is it?`, chips: ["Change car", "Not sure"], suggestion: null, baseVehicle: "" };
  return { ...r, status: hasYear ? "valid" : "needs_clarification", vehicle: car, clarification: clar, corrections: [] };
}
