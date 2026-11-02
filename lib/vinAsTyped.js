// A VIN SEARCH IS A TYPED SEARCH OF THE CAR IT NAMES, PLUS THE CAR'S OWN FACTS (Lane B, Oct 29 2026, Lane F's live rerun on bee760b6: the stored sample VIN of a 2001 BMW M3 read "No figures are shown because this car could not be checked" and then asked
// "Say which BMW M3 Coupe 6-Speed it is" about the car it had just named, while the typed car read $22,500 to $41,000).
// CAUSE (api/sellerDecision.js): a search whose vehicle carries a VIN or chassis never read the stored answer (wantsWarm needs no vin), ran the engine live with the VIN's own title words (and the VIN string as the search text) as a different spec, so its pool,
// its questions and its refusal were not the typed car's. NOW: the VIN names the car (year, make, model); that car goes through the SAME path a typed search of it takes (the stored answer, the questions, thin pools, the options); then the VIN car's own
// facts are put on top of that finished answer: its sales (ownSales) and the option its own words and fields name (matchedOption, the Find card's matcher). Figures, window, set-asides, questions and options come from the typed path and cannot differ.
// A VIN that names no year, make and model says so in the engine's own plain line and shows no numbers.
import { matchedOptionOf, ownSalesFor, settleQuestionFromVin, narrowQuestionByVin, mileageBasisOf, nearestSalesOf } from "./onebox.js";
import { reasonLine } from "./reasonWords.js";
// WHAT THE VIN SAYS (Lane B, Nov 2 2026): the decode's own trim, body and gearbox (the vehicle the page sends carries them) and what the archive holds for this exact VIN (findVinArchiveMatch: the listing's title words, its trim words and gearbox)
export function vinFactsOf(vehicle, archive, live) {
  const v = vehicle || {}, a = archive || {}, l = live || {};
  return { make: v.make || null, model: v.model || null, liveTitle: l.title || null, liveMiles: Number(l.mileage) > 0 ? Number(l.mileage) : null, year: Number(v.year) || null, decodeTrim: v.trim || null, decodeBody: v.bodyStyle || null, decodeTx: v.transmission || v.gearbox || null,
    archiveTrim: a.trim || null, archiveTitle: a.displayName || null, archiveTx: a.transmission || null };
}
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const GEAR_BODY = /\b(?:\d{1,2}[-\s]?speed|manual|automatic|auto|tiptronic|steptronic|pdk|smg|dct|dsg|stick|coupe|convertible|cabriolet|roadster|spyder|spider|sedan|hatchback|wagon|targa|fastback)\b/ig;
// the trim words of the VIN's own record: the title with its year, make, model, mileage prefix, body and gearbox words taken out ("2002 Porsche 911 Carrera 4S Coupe 6-Speed" -> "Carrera 4S"); null when nothing is left
export function trimPhraseFromRecord(vf) {
  const t = vf && (vf.archiveTitle || vf.liveTitle); if (!t) return null;
  const drop = [vf.make, vf.model].filter(Boolean).flatMap(x => String(x).toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean);
  const words = String(t).replace(/^\s*[\d,.]+\s*k?\s*-?\s*miles?\b/i, " ").replace(GEAR_BODY, " ").split(/\s+/).filter(w => w && !/^(19|20)\d\d$/.test(w) && !drop.includes(w.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const out = words.join(" ").trim();
  return out && out.length <= 40 ? out : null;
}
export const typedWordsFor = v => [v && v.year, v && v.make, v && (v.nameModel || v.model)].filter(Boolean).join(" ");
// returns null (not a VIN search), { unresolved: true, line } (a VIN that names no car) or { vehicle, text, ctx } (the typed car and what the VIN adds)
export async function vinSearchPlan(vehicle, deps) {
  if (!vehicle || !(vehicle.vin || vehicle.chassis)) return null;
  if (!(vehicle.make && vehicle.model && Number(vehicle.year) > 0)) return { unresolved: true, line: reasonLine("vin.unresolved") };
  let text = typedWordsFor(vehicle);
  // THE CAR'S OWN TRIM WORDS GO IN WITH THE TYPED WORDS (Lane B, Nov 2 2026, Sam's slow 4S read): when this VIN's own sale or live listing names a trim, the typed search is of THAT car ("2002 Porsche 911 Carrera 4S"), so it reads the stored answer a typed search of the
  // trim reads (no bare-911 question computed first, no cold compute when the row exists). The resolver must accept the words and return that same trim, else the plain words stand and the settle step runs after the question.
  const own = trimPhraseFromRecord(vinFactsOf(vehicle, deps && deps.archive, deps && deps.live));
  let trimmed = null;
  if (own) { const rt = await deps.resolveVehicle(`${text} ${own}`, {}).catch(() => null), tv2 = rt && rt.status === "valid" && rt.vehicle && rt.vehicle.model ? rt.vehicle : null; if (tv2 && tv2.trim && norm(tv2.trim) === norm(own)) { trimmed = tv2; text = `${text} ${own}`; } }
  const r = trimmed ? { status: "valid", vehicle: trimmed } : await deps.resolveVehicle(text, {}).catch(() => null), tv = r && r.status === "valid" && r.vehicle && r.vehicle.model ? r.vehicle : null;
  // THE VIN'S OWN CAR IS ALREADY RESOLVED (Lane B, Oct 29 2026, vintypedlive: the 1985 Jaguar XJ12 Vanden Plas and the 2002 Ferrari 550 Maranello VINs read "This VIN does not name a car whose sales can be read" while the typed search of the same words gave a car or a plain
  // 'not a valid year' answer). The re-read of the car's words can ask a question (which XJ) or object to a year the VIN itself proves exists (a 550 Maranello registered as a 2002); the car the VIN named has already been through the resolver, so when the re-read does not come back
  // valid the VIN's own year, make and model stand and the typed path runs on them. A VIN that names no year, make and model still says so.
  let car = tv;
  if (!car) { const { vin, chassis, raw, mileage, transmission, gearbox, ...rest } = vehicle; car = { ...rest, year: Number(vehicle.year), make: vehicle.make, model: vehicle.model }; }
  if (!car) return { unresolved: true, line: reasonLine("vin.unresolved") };
  const title = [vehicle.year, vehicle.make, vehicle.nameModel || vehicle.model, vehicle.trim, vehicle.bodyStyle, vehicle.transmission || vehicle.gearbox].filter(Boolean).join(" ");
  return { vehicle: car, text, ctx: { vehicle, recordTrim: trimmed ? own : null, vf: vinFactsOf(vehicle, deps && deps.archive, deps && deps.live), title, year: Number(vehicle.year), body: vehicle.bodyStyle || null, gearbox: vehicle.transmission || vehicle.gearbox || null, miles: Number(vehicle.mileage) > 0 ? Number(vehicle.mileage) : null, fields: [vehicle.transmission || vehicle.gearbox, vehicle.bodyStyle].filter(Boolean).join(" ") } };
}
// the VIN car's own facts on a finished typed answer: its sales, and the option its words and fields name. Nothing else changes.
export function applyVinOverlay(d, ctx) {
  if (!d || typeof d !== "object" || !ctx) return d;
  let out = { ...d };
  if (ctx.recordTrim && !(Array.isArray(out.vinSettled) && out.vinSettled.some(x => x.dimension === "trim"))) out.vinSettled = [...(out.vinSettled || []), { dimension: "trim", label: ctx.recordTrim, source: "record" }];   // the trim came with the typed words, from the VIN's own sale or listing
  if (/^(result|thin|refusal)$/.test(String(out.tier || ""))) { const own = ownSalesFor(ctx.vehicle, out.cards, out.asideCards, out.cluster); if (own) out.ownSales = own; }
  if (/^(result|thin)$/.test(String(out.tier || ""))) {   // ONE MILEAGE (Nov 2 2026): this VIN's live listing and its last sale record each carry miles; the engine names the one it reads the sales at
    const ls = out.ownSales && out.ownSales.lastSale, mb = mileageBasisOf(out, { live: ctx.vf && ctx.vf.liveMiles, record: ls && ls.miles, recordDate: ls && ls.date });
    if (mb) { out.rangeMileage = mb; out.nearestSales = nearestSalesOf(out, mb.miles); out.nearestSalesHeading = out.nearestSales.length ? reasonLine("miles.nearest", { miles: mb.miles.toLocaleString("en-US") }) : null; }
  }
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
