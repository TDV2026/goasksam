// THE MODEL CHOICE FOR A PARTIAL CAR (Lane D, Nov 17 2026, lane-d-car-bar-partial; Sam's rule: any search that names at least a make carries through all four pills).
// Market Check and Sell cannot answer for a car with no model, and never guess one. When either receives a partial car (a make, with whichever of year, year range and typed mileage were given) the engine serves THIS instead of an answer:
//   { line: "Which 2009 BMW?", partial: { token, line, short }, choices: [{ label: "M3", token, words: "2009 BMW M3", address: "/market-check?car=<token>" }, ...], typeLine: "Not here? Type the model.", box: true, empty: false }
// choices: each model of that make and year (or years) that has SOLD, most sold first, at most 12, each with its own FULL car token (the car the resolver gives for those words, with the typed mileage), its words and its address in the tool that asked.
// No count, no range, no number of sources and no blended number for the make is ever in it. Nothing sold for that make and year: { line: "No 2009 BMW has sold. Type the model in the box.", choices: [], typeLine: null, box: true, empty: true }.
// Choosing a model opens the full car, and everything from there is as today (variant rows included). A page prints these words and builds none.
import { encodeCar, decodeCar, carWords, carStamp, partialOf, yearsWords } from "./carToken.js";
import { CAR_TOOLS } from "./carBar.js";
export const CHOICE_MAX = 12;
export const TYPE_LINE = "Not here? Type the model.";
const PATH = Object.fromEntries(CAR_TOOLS.map(t => [t[0], t[1]]));
export const addressOf = (tool, token) => `${PATH[tool] || PATH.mc}?car=${encodeURIComponent(token)}`;
// the words of the partial car without its mileage: "2009 BMW", "BMW", "1960s Porsche"
export const nameOf = partial => [yearsWords(partial), partial && partial.make].filter(Boolean).join(" ");
// deps.topModels(env, make, n, { min, max } | null) -> [{ model, n }] most sold first (the archive's own list: lib/onebox.js topModelCountsForMake); deps.resolve(words) -> the resolver's answer (optional: a choice is then the car the resolver gives for its words)
export async function modelChoiceFor(partialIn, env, deps, tool) {
  const partial = partialOf(partialIn); if (!partial) return null;
  const name = nameOf(partial), stamp = carStamp(partial);
  const yr = partial.year ? { min: partial.year, max: partial.year } : partial.yearRange ? { min: partial.yearRange.start, max: partial.yearRange.end } : null;
  let top = []; try { top = await deps.topModels(env, partial.make, CHOICE_MAX, yr); } catch { top = []; }
  const seen = new Set();
  const models = (Array.isArray(top) ? top : []).map(x => String(x && x.model || "").trim()).filter(m => m && !seen.has(m.toLowerCase()) && seen.add(m.toLowerCase())).slice(0, CHOICE_MAX);
  const years = yearsWords(partial);
  const one = async model => {
    const words = [years, partial.make, model].filter(Boolean).join(" ");
    let car = null;
    if (deps.resolve) { try { const r = await deps.resolve(words); const v = r && r.vehicle; if (v && v.make && v.model && String(v.make).toLowerCase() === partial.make.toLowerCase() && (!partial.year || !v.year || Number(v.year) === partial.year)) car = { ...v, raw: words }; } catch { car = null; } }
    if (!car) car = { raw: words, ...(partial.year ? { year: partial.year } : {}), ...(partial.yearRange ? { yearRange: partial.yearRange } : {}), make: partial.make, model };
    if (!car.year && partial.year) car.year = partial.year;
    if (!car.yearRange && partial.yearRange && !car.year) car.yearRange = partial.yearRange;
    if (partial.mileage && !(Number(car.mileage) > 0)) car.mileage = partial.mileage;
    const token = encodeCar(car); if (!token) return null;
    const w = carWords(decodeCar(token)); if (!w) return null;
    return { label: model, token, words: w.label, address: addressOf(tool, token) };
  };
  const got = (await Promise.all(models.map(one))).filter(Boolean), tokens = new Set(), choices = got.filter(c => !tokens.has(c.token) && tokens.add(c.token));
  const partialCar = stamp ? { token: stamp.token, line: stamp.line, short: stamp.short } : null;
  if (!choices.length) return { line: `No ${name} has sold. Type the model in the box.`, partial: partialCar, choices: [], typeLine: null, box: true, empty: true, complete: true };
  return { line: `Which ${name}?`, partial: partialCar, choices, typeLine: TYPE_LINE, box: true, empty: false, complete: true };
}
// THE REPLY THAT CARRIES A MODEL CHOICE (Lane D, lane-d-car-bar-partial-2): the choice is a COMPLETE reply (modelChoice.complete and complete on the reply: the shared page draws no fallback line and no older question for it, and the engine's words are the only words), and the partial car rides as the
// same car field every answer carries (car.token, car.line, car.short), so the car bar, which reads car and nothing else, shows it. Every reply that serves a modelChoice is built here.
export const choiceReply = (reply, mc) => mc ? { ...reply, ...(mc.partial ? { car: mc.partial } : {}), complete: true, modelChoice: mc } : reply;
// the real dependencies: the archive's model list and the shared resolver
export async function liveChoiceDeps() {
  const [ob, vh] = await Promise.all([import("./onebox.js"), import("./vehicle.js")]);
  return { topModels: ob.topModelCountsForMake, resolve: words => vh.resolveVehicle(words, {}) };
}
// the model choice for a resolver vehicle that has a make and no model (null for a full car, a group term or no make), on the live archive: what Market Check and Sell serve instead of an answer
export async function partialChoiceAnswer(vehicle, env, tool, deps) {
  if (!partialOf(vehicle) || (vehicle && Array.isArray(vehicle.group) && vehicle.group.length)) return null;
  try { return await modelChoiceFor(vehicle, env, deps || await liveChoiceDeps(), tool); } catch { return null; }
}
// typed words that name a make and a year or years and nothing else ("2009 BMW", "1960s Porsche", "BMW 2009 38,400 miles"): a partial car with years. The title read that gives a make-only search its one model (Fix 7) must not give THIS one a model:
// the titles cannot say a model sold in that year, and Sam's rule is that Market Check and Sell serve the model choice. A bare make ("Audi") keeps today's path.
export function makeWithYearsOnly(raw, vehicle) {
  const v = partialOf(vehicle); if (!v || !(v.year || v.yearRange)) return false;
  const mk = v.make.toLowerCase().split(/[\s-]+/), left = String(raw || "").toLowerCase().replace(/\+/g, " ").replace(/\b\d{1,3}(?:,\d{3})+\b(?:\s*(?:miles?|mi|km)\b)?|\b\d+(?:\.\d+)?k?\s*(?:miles?|mi|km)\b|\b(?:18|19|20)\d\d\s*s?\b|\b\d0s\b|\b(?:to|and|or|through|thru)\b|[-\u2013,]/g, " ").split(/[^a-z0-9]+/).filter(Boolean).filter(w => !mk.includes(w));
  return left.length === 0;
}
