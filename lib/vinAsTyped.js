// A VIN SEARCH IS A TYPED SEARCH OF THE CAR IT NAMES, PLUS THE CAR'S OWN FACTS (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6: the stored sample VIN of a 2001 BMW M3 read "No figures are shown because this car could not be checked" and then asked
// "Say which BMW M3 Coupe 6-Speed it is" about the car it had just named, while the typed car read $22,500 to $41,000).
// CAUSE (api/sellerDecision.js): a search whose vehicle carries a VIN or chassis never read the stored answer (wantsWarm needs no vin), ran the engine live with the VIN's own title words (and the VIN string as the search text) as a different spec, so its pool,
// its questions and its refusal were not the typed car's. NOW: the VIN names the car (year, make, model); that car goes through the SAME path a typed search of it takes (the stored answer, the questions, thin pools, the options); then the VIN car's own
// facts are put on top of that finished answer: its sales (ownSales) and the option its own words and fields name (matchedOption, the Find card's matcher). Figures, window, set-asides, questions and options come from the typed path and cannot differ.
// A VIN that names no year, make and model says so in the engine's own plain line and shows no numbers.
import { matchedOptionOf, ownSalesFor, settleQuestionFromVin, narrowQuestionByVin } from "./onebox.js";
import { reasonLine } from "./reasonWords.js";
// WHAT THE VIN SAYS (Lane B, Nov 2 2026): the decode's own trim, body and gearbox (the vehicle the page sends carries them) and what the archive holds for this exact VIN (findVinArchiveMatch: the listing's title words, its trim words and gearbox)
export function vinFactsOf(vehicle, archive, live) {
  const v = vehicle || {}, a = archive || {}, l = live || {};
  return { make: v.make || null, model: v.model || null, liveTitle: l.title || null, liveMiles: Number(l.mileage) > 0 ? Number(l.mileage) : null, year: Number(v.year) || null, decodeTrim: v.trim || null, decodeBody: v.bodyStyle || null, decodeTx: v.transmission || v.gearbox || null,
    archiveTrim: a.trim || null, archiveTitle: a.displayName || null, archiveTx: a.transmission || null };
}
export const typedWordsFor = v => [v && v.year, v && v.make, v && (v.nameModel || v.model)].filter(Boolean).join(" ");
// returns null (not a VIN search), { unresolved: true, line } (a VIN that names no car) or { vehicle, text, ctx } (the typed car and what the VIN adds)
export async function vinSearchPlan(vehicle, deps) {
  if (!vehicle || !(vehicle.vin || vehicle.chassis)) return null;
  if (!(vehicle.make && vehicle.model && Number(vehicle.year) > 0)) return { unresolved: true, line: reasonLine("vin.unresolved") };
  const text = typedWordsFor(vehicle);
  const r = await deps.resolveVehicle(text, {}).catch(() => null), tv = r && r.status === "valid" && r.vehicle && r.vehicle.model ? r.vehicle : null;
  // THE VIN'S OWN CAR IS ALREADY RESOLVED (Lane B, Oct 29 2026, vintypedlive: the 1985 Jaguar XJ12 Vanden Plas and the 2002 Ferrari 550 Maranello VINs read "This VIN does not name a car whose sales can be read" while the typed search of the same words gave a car or a plain
  // 'not a valid year' answer). The re-read of the car's words can ask a question (which XJ) or object to a year the VIN itself proves exists (a 550 Maranello registered as a 2002); the car the VIN named has already been through the resolver, so when the re-read does not come back
  // valid the VIN's own year, make and model stand and the typed path runs on them. A VIN that names no year, make and model still says so.
  let car = tv;
  if (!car) { const { vin, chassis, raw, mileage, transmission, gearbox, ...rest } = vehicle; car = { ...rest, year: Number(vehicle.year), make: vehicle.make, model: vehicle.model }; }
  if (!car) return { unresolved: true, line: reasonLine("vin.unresolved") };
  const title = [vehicle.year, vehicle.make, vehicle.nameModel || vehicle.model, vehicle.trim, vehicle.bodyStyle, vehicle.transmission || vehicle.gearbox].filter(Boolean).join(" ");
  return { vehicle: car, text, ctx: { vehicle, vf: vinFactsOf(vehicle, deps && deps.archive, deps && deps.live), title, year: Number(vehicle.year), body: vehicle.bodyStyle || null, gearbox: vehicle.transmission || vehicle.gearbox || null, miles: Number(vehicle.mileage) > 0 ? Number(vehicle.mileage) : null, fields: [vehicle.transmission || vehicle.gearbox, vehicle.bodyStyle].filter(Boolean).join(" ") } };
}
// the VIN car's own facts on a finished typed answer: its sales, and the option its words and fields name. Nothing else changes.
export function applyVinOverlay(d, ctx) {
  if (!d || typeof d !== "object" || !ctx) return d;
  let out = { ...d };
  if (/^(result|thin|refusal)$/.test(String(out.tier || ""))) { const own = ownSalesFor(ctx.vehicle, out.cards, out.asideCards, out.cluster); if (own) out.ownSales = own; }
  if (/^(result|thin)$/.test(String(out.tier || ""))) { let mo = null; try { mo = matchedOptionOf(out, ctx.title, { year: ctx.year, listingMiles: ctx.miles, fields: ctx.fields, gearbox: ctx.gearbox, body: ctx.body }); } catch { mo = null; } if (mo) out = { ...out, ...mo }; }
  return out;
}

// A VIN NEVER ASKS WHAT IT ALREADY ANSWERS (Lane B, Nov 2 2026): the typed path may come back with a question (trim, body, gearbox). Each one is read against what the VIN says (vinFactsOf) and, when the decode or the archive settles it, the question is answered with that option
// (the same refine its chip sends) and the engine runs again; vinSettled names the attributes settled and where from. A question the VIN does not settle is asked about that one attribute only, narrowed to the options the VIN leaves, with the engine's plain line saying why
// (vinAskLine). A VIN that names an attribute no option carries opens the whole car with no question. rerun(refine, opts) runs the engine again with the refine and returns the answer.
export async function settleVinAnswer(d, ctx, rerun) {
  if (!d || !ctx || !ctx.vf || typeof rerun !== "function") return d;
  let cur = d, refine = {}; const settled = [];
  for (let i = 0; i < 4; i++) {
    if (!/_choice$/.test(String(cur && cur.tier || ""))) break;
    const s = settleQuestionFromVin(cur, ctx.vf);
    if (!s) break;
    if (s.settled) { refine = { ...refine, ...s.refine }; settled.push({ dimension: s.dimension, label: s.label, source: s.source }); cur = await rerun(refine, {}); continue; }
    if (Array.isArray(s.keep) && s.keep.length === 0) { cur = await rerun(refine, { openWhole: true }); settled.push({ dimension: s.dimension, label: null, source: "named_no_option" }); break; }
    cur = narrowQuestionByVin(cur, s); break;
  }
  return settled.length && cur && typeof cur === "object" ? { ...cur, vinSettled: settled } : cur;
}
