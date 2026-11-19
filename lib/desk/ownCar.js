// THE CAR'S OWN HISTORY IN A DESK CASE (Lane D, Nov 13 2026; Lane B's one VIN identity step: archive match first, then live match, then decode). Market Check showed "Sold before, Nov 2026, $99,000, Bring a Trailer, 10,000 miles" for a VIN while the Desk case opened with none of it.
// CAUSE: the Desk's read already ran the same step (lib/sheetRead.js: findVinArchiveMatch, findVinLiveMatch, decode) but kept ONE appearance and four loose facts on the sheet, and the case took only the decode; the car's own record never reached the case.
// Pure: the match goes in, figures come out (date, venue, price or high bid, miles, link, and the car's own last listing as the prefill). No sentence is made here; caseView and reportState make every sentence at serve time with lib/reasonWords.js (own.*).
import { PORSCHE_911_CODES } from "../vehicleData.js";
import { houseName } from "../../api/_historyData.js";
import { reasonLine } from "../reasonWords.js";
import { ownLiveOf } from "../vinLiveMatch.js";
import { trimPhraseFromRecord } from "../vinAsTyped.js";
import { spellTrimWords } from "../vinDecodeTrim.js";
import { monthYearShort, lineOfOwn, lastSoldLine } from "./ownWords.js";
export { monthYearShort, lineOfOwn, lastSoldLine };
const iso = d => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(d || "")); return m ? m[1] : null; };
const pos = v => { const x = Math.round(Number(v)); return x > 0 ? x : null; };

// every prior sale and no-sale of the VIN, newest first, as figures
export function ownHistoryOf(archive) {
  if (!archive || !Array.isArray(archive.history)) return [];
  return archive.history.filter(h => h && (h.kind === "sale" || h.kind === "attempt")).map(h => h.kind === "sale"
    ? { kind: "sale", date: iso(h.date), venue: houseName(h.platform) || null, price: pos(h.price), miles: pos(h.mileage), url: h.url || null }
    : { kind: "no_sale", date: iso(h.date), venue: houseName(h.platform) || null, highBid: pos(h.highBid), result: h.status || null, url: h.url || null }).filter(x => x.date || x.price || x.highBid);
}
// WHAT THE CAR'S OWN LAST LISTING NAMES, TO PREFILL THE CASE (Nov 13 2026, Lane C's live read: VIN WP0AA2995XS626785 prefilled the trim "22-Years-Owned 911 Carrera 6-Speed").
// CAUSE: the archive match's `trim` is the listing TITLE with year, make and model struck out (lib/_flags.js), not a trim; the first version copied it into the case. Every text field of the match is a title word or a free column, so the same hole was open for body, gearbox and colour.
// RULE (the one Market Check takes, lib/vinAsTyped.js vinSearchPlan): a trim is the resolver's trim for that car, taken only when the resolver accepts the listing's words and returns the same trim; make, model and body are the resolver's; gearbox, body and colour pass a closed vocabulary or are left blank. Mileage and year are numbers.
const norm = x => String(x == null ? "" : x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BODY_WORDS = { coupe: "Coupe", convertible: "Convertible", cabriolet: "Cabriolet", roadster: "Roadster", spyder: "Spyder", spider: "Spider", targa: "Targa", sedan: "Sedan", saloon: "Saloon", wagon: "Wagon", estate: "Estate", hatchback: "Hatchback", fastback: "Fastback" };
export const cleanBody = s => BODY_WORDS[norm(s)] || null;
export const cleanGearbox = s => { const w = norm(s); return !w ? null : /\b(manual|stick|dog ?leg)\b/.test(w) ? "Manual" : /\b(automatic|auto|tiptronic|steptronic|pdk|dct|dsg|smg|cvt)\b/.test(w) ? "Automatic" : null; };
export const cleanColour = s => { const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return t && t.length <= 30 && /^[A-Za-z][A-Za-z '\-]*$/.test(t) && t.split(" ").length <= 3 ? t : null; };
export function lastSaleFacts(archive, resolved = null) {
  if (!archive || !(Number(archive.price) > 0 || archive.soldDate)) return null;
  const r = resolved || {}, f = { year: Number(archive.year) > 0 ? Number(archive.year) : null, make: r.make || archive.make || null, model: r.model || archive.model || null, trim: r.trim || null, body: cleanBody(r.bodyStyle) || cleanBody(archive.bodyStyle), transmission: cleanGearbox(archive.transmission), colour: cleanColour(archive.colour), mileage: pos(archive.mileage) };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== ""));
}
// THE CAR'S NAMEPLATE IS THE DECODE'S, NOT THE ARCHIVE'S CHASSIS CODE (Nov 13 2026, Lane C's live read: VIN WP0AA2995XS626785 filled Model "996" and no trim; the engine's own head reads "1999 Porsche 911 Carrera Coupe").
// CAUSE: the archive files modern Porsches under their chassis code (996, 997, 991; OCD, memory ocd-chassis-code-models), and the prefill resolved "1999 Porsche 996", whose model IS 996; the title's trim words were then dropped as the model's, and the resolver's "Carrera" was refused because it was not the title's whole phrase.
// RULE (vinSearchPlan's): the typed words are year, make and the DECODE's model (the archive's only when the decode names none, a 911 chassis code read as 911); the trim is the resolver's, taken when every word of it is in the listing's words (junk words around it never count); make, model and body are the resolver's.
export const nameplateOf = (make, model) => /^porsche$/i.test(String(make || "")) && PORSCHE_911_CODES.includes(norm(model)) ? "911" : model;
// the resolver's vehicle for the listing: the same words Market Check types ("1999 Porsche 911 <trim words of the title>"), the trim accepted only when the resolver returns one whose words are all in the listing's. null when it cannot say. The two resolver calls are asked together.
export async function resolvedOwnVehicle(archive, resolveVehicle, facts = null) {
  if (!archive || !resolveVehicle || !(Number(archive.year) > 0 && archive.make)) return null;
  const f = facts && facts.make && facts.model && norm(facts.make) === norm(archive.make) ? facts : null, model = f ? f.model : nameplateOf(archive.make, archive.model);
  if (!model) return null;
  const base = [archive.year, archive.make, model].join(" "), words = spellTrimWords(trimPhraseFromRecord({ make: archive.make, model: [model, archive.model].filter(Boolean).join(" "), archiveTitle: archive.displayName || null }) || "", archive.make) || null;
  const ok = r => r && r.status === "valid" && r.vehicle && r.vehicle.model ? r.vehicle : null, ask = t => Promise.resolve(resolveVehicle(t, {})).catch(() => null);
  const [withWords, bare] = await Promise.all([words ? ask(base + " " + words) : null, ask(base)]);
  const t = ok(withWords), have = new Set(norm(words).split(" ").filter(Boolean));
  if (t && t.trim && norm(t.trim).split(" ").every(x => have.has(x))) return t;
  const v = ok(bare);
  return v ? { ...v, trim: null } : null;   // the bare car: the trim is the decode's to give, never the title's
}
// the sale the engine's own-sale lines speak of: the newest recorded sale
export const lastSaleOf = history => (history || []).find(h => h.kind === "sale" && h.price > 0) || null;
// THE ARCHIVE LOOKUP, TOLD APART FROM "NO RECORD" (Nov 13 2026, Lane C: JN1AR5EF1EM271253 showed no own sale though Market Check does). The match returns null both for a car with no sale and for a lookup that timed out; the Desk read kept that null for ten minutes (VIN_MEMO) and the case opened without the car's own record.
// RULE: a failed lookup is asked once more, and a lookup that failed twice is never remembered (the caller gets failed: true and does not store it). `match(env, { vin, status })` is findVinArchiveMatch.
export async function archiveLookup(match, env, vin) {
  let st = {}, a = await match(env, { vin, status: st }).catch(() => { st.failed = true; return null; });
  if (!a && st.failed) { st = {}; a = await match(env, { vin, status: st }).catch(() => { st.failed = true; return null; }); }
  return { archive: a || null, failed: !a && st.failed === true };
}
// the whole of the VIN step for a case
export function ownOf(archive, liveMatch, resolved = null) {
  const history = ownHistoryOf(archive), last = lastSaleOf(history), facts = lastSaleFacts(archive, resolved);
  if (!history.length && !facts && !liveMatch) return null;
  return { history, last, prefill: facts, vinLiveMatch: liveMatch || null };
}
export function ownView(vehicle, now = null) {
  const v = vehicle || {}, hist = Array.isArray(v.ownHistory) ? v.ownHistory : [];
  const rows = hist.map(h => ({ ...h, line: lineOfOwn(h) })), last = lastSaleOf(hist);
  const live = v.vinLiveMatch ? ownLiveOf(v.vinLiveMatch, now ? Date.parse(now) : Date.now()) : null;   // listed NOW: a listing that has ended is no match (lib/vinLiveMatch.js)
  return { ownHistory: rows, vinLiveMatch: live ? v.vinLiveMatch : null, ownLive: live,
    ownBlock: rows.length ? { heading: reasonLine("own.heading"), latestLine: (rows[0] || {}).line, lastSaleLine: lastSoldLine(last), rows } : null };
}
