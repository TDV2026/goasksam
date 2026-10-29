// A VIN SEARCH IS A TYPED SEARCH OF THE CAR IT NAMES, PLUS THE CAR'S OWN FACTS (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6: the stored sample VIN of a 2001 BMW M3 read "No figures are shown because this car could not be checked" and then asked
// "Say which BMW M3 Coupe 6-Speed it is" about the car it had just named, while the typed car read $22,500 to $41,000).
// CAUSE (api/sellerDecision.js): a search whose vehicle carries a VIN or chassis never read the stored answer (wantsWarm needs no vin), ran the engine live with the VIN's own title words (and the VIN string as the search text) as a different spec, so its pool,
// its questions and its refusal were not the typed car's. NOW: the VIN names the car (year, make, model); that car goes through the SAME path a typed search of it takes (the stored answer, the questions, thin pools, the options); then the VIN car's own
// facts are put on top of that finished answer: its sales (ownSales) and the option its own words and fields name (matchedOption, the Find card's matcher). Figures, window, set-asides, questions and options come from the typed path and cannot differ.
// A VIN that names no year, make and model says so in the engine's own plain line and shows no numbers.
import { matchedOptionOf, ownSalesFor } from "./onebox.js";
import { reasonLine } from "./reasonWords.js";
export const typedWordsFor = v => [v && v.year, v && v.make, v && (v.nameModel || v.model)].filter(Boolean).join(" ");
// returns null (not a VIN search), { unresolved: true, line } (a VIN that names no car) or { vehicle, text, ctx } (the typed car and what the VIN adds)
export async function vinSearchPlan(vehicle, deps) {
  if (!vehicle || !(vehicle.vin || vehicle.chassis)) return null;
  if (!(vehicle.make && vehicle.model && Number(vehicle.year) > 0)) return { unresolved: true, line: reasonLine("vin.unresolved") };
  const text = typedWordsFor(vehicle);
  const r = await deps.resolveVehicle(text, {}).catch(() => null), tv = r && r.status === "valid" && r.vehicle && r.vehicle.model ? r.vehicle : null;
  if (!tv) return { unresolved: true, line: reasonLine("vin.unresolved") };
  const title = [vehicle.year, vehicle.make, vehicle.nameModel || vehicle.model, vehicle.trim, vehicle.bodyStyle, vehicle.transmission || vehicle.gearbox].filter(Boolean).join(" ");
  return { vehicle: tv, text, ctx: { vehicle, title, year: Number(vehicle.year), body: vehicle.bodyStyle || null, gearbox: vehicle.transmission || vehicle.gearbox || null, miles: Number(vehicle.mileage) > 0 ? Number(vehicle.mileage) : null, fields: [vehicle.transmission || vehicle.gearbox, vehicle.bodyStyle].filter(Boolean).join(" ") } };
}
// the VIN car's own facts on a finished typed answer: its sales, and the option its words and fields name. Nothing else changes.
export function applyVinOverlay(d, ctx) {
  if (!d || typeof d !== "object" || !ctx) return d;
  let out = { ...d };
  if (/^(result|thin|refusal)$/.test(String(out.tier || ""))) { const own = ownSalesFor(ctx.vehicle, out.cards, out.asideCards, out.cluster); if (own) out.ownSales = own; }
  if (/^(result|thin)$/.test(String(out.tier || ""))) { let mo = null; try { mo = matchedOptionOf(out, ctx.title, { year: ctx.year, listingMiles: ctx.miles, fields: ctx.fields, gearbox: ctx.gearbox, body: ctx.body }); } catch { mo = null; } if (mo) out = { ...out, ...mo }; }
  return out;
}
