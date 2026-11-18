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
  if (!choices.length) return { line: `No ${name} has sold. Type the model in the box.`, partial: partialCar, choices: [], typeLine: null, box: true, empty: true };
  return { line: `Which ${name}?`, partial: partialCar, choices, typeLine: TYPE_LINE, box: true, empty: false };
}
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
