// THE ONE VIN IDENTITY STEP FOR THE DESK'S FORM (Lane D, Nov 13 2026): archive match first, then live match, then the decode, the order Market Check takes (lib/vinLiveMatch.js, api/vehicleIdentity.js, lib/sheetRead.js). The New case form asks it while the analyst types the VIN, so the form fills from the car's own last listing when the archive has one.
// ctx.decodeVin, ctx.archiveMatch and ctx.liveMatch are injected by a check; the defaults are the engine's own functions. Never throws: a step that fails is a step that found nothing.
import { ownOf, resolvedOwnVehicle, archiveLookup } from "./ownCar.js";
import { vinCheckDigitOk } from "./intake/parse.js";
import { reasonLine } from "../reasonWords.js";
// A NEAR-VIN IS REFUSED WITH ITS OWN REASON (Lane S's near-VIN run, Nov 13 2026): not 17 characters says how many there are; 17 with a wrong check digit (49 CFR 565.15, vinCheckDigitOk) says so; a 17 character string with an I, O or Q is not a VIN at all. null when the VIN passes.
export function vinRefusal(vin) {
  const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length !== 17) return v.length >= 11 ? reasonLine("case.decode.refuse_length", { n: v.length }) : reasonLine("case.new.refuse.vin_format");   // 11 or more is a near-VIN (the page sends those); shorter is not a VIN at all
  if (/[IOQ]/.test(v)) return reasonLine("case.new.refuse.vin_format");
  return null;   // a wrong check digit is a WARNING, not a refusal (vinWarning): older and European VINs often fail it
}
// A 17 character VIN whose check digit does not match is decoded all the same and carries this line (Lane S: the page prints it on the car card). null for every other VIN.
export function vinWarning(vin) {
  const v = String(vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return v.length === 17 && !/[IOQ]/.test(v) && !vinCheckDigitOk(v) ? reasonLine("case.decode.warn_check") : null;
}
export async function vinStep(ctx, vin) {
  const env = ctx.env || {};
  // THE THREE READS OF THE VIN ARE ASKED TOGETHER (Nov 13 2026): the archive match, the live match and the decode do not depend on one another; they were awaited one after the other, so the form waited for the sum
  const [{ archive }, liveMatch, facts] = await Promise.all([
    archiveLookup(ctx.archiveMatch || (async (e, o) => (await import("../_flags.js")).findVinArchiveMatch(e, o)), env, vin),
    (ctx.liveMatch || (async (e, o) => (await import("../vinLiveMatch.js")).findVinLiveMatch(e, o)))(env, { vin }).catch(() => null),
    (ctx.decodeVin || (async v => (await import("../vehicle.js")).decodeVinFacts(v)))(vin).catch(() => null)]);
  const resolve = ctx.resolveVehicle || (async (t, o) => (await import("../vehicle.js")).resolveVehicle(t, o));
  return { facts, own: ownOf(archive, liveMatch, await resolvedOwnVehicle(archive, resolve, facts)) };
}
// the fields the form fills: the car's own last listing over the bare decode, each marked where it came from
export function decodedOf(step) {
  const f = step.facts || {}, pf = (step.own && step.own.prefill) || {}, dec = { year: Number(f.year) > 0 ? Number(f.year) : null, make: f.make || null, model: f.model || null, trim: f.trim || null, body: f.bodyStyle || f.body || null, transmission: f.transmission || null };
  const keys = [...new Set([...Object.keys(dec), ...Object.keys(pf)])], out = {};
  for (const k of keys) { const fromSale = pf[k] != null && pf[k] !== "", v = fromSale ? pf[k] : dec[k]; if (v != null && v !== "") out[k] = { value: v, source: fromSale ? "last_sale" : "vin_decoded", verified: false }; }
  return out;
}
