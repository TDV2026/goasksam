// THE CAR'S OWN HISTORY IN A DESK CASE (Lane D, Nov 13 2026; Lane B's one VIN identity step: archive match first, then live match, then decode). Market Check showed "Sold before, Nov 2026, $99,000, Bring a Trailer, 10,000 miles" for a VIN while the Desk case opened with none of it.
// CAUSE: the Desk's read already ran the same step (lib/sheetRead.js: findVinArchiveMatch, findVinLiveMatch, decode) but kept ONE appearance and four loose facts on the sheet, and the case took only the decode; the car's own record never reached the case.
// Pure: the match goes in, figures come out (date, venue, price or high bid, miles, link, and the car's own last listing as the prefill). No sentence is made here; caseView and reportState make every sentence at serve time with lib/reasonWords.js (own.*).
import { houseName } from "../../api/_historyData.js";
import { reasonLine } from "../reasonWords.js";
import { ownLiveOf } from "../vinLiveMatch.js";
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
// what the car's own last listing names, to prefill the case over the bare decode: only what the listing states
export function lastSaleFacts(archive) {
  if (!archive || !(Number(archive.price) > 0 || archive.soldDate)) return null;
  const f = { year: Number(archive.year) > 0 ? Number(archive.year) : null, make: archive.make || null, model: archive.model || null, trim: archive.trim || null, body: archive.bodyStyle || null, transmission: archive.transmission || null, colour: archive.colour || null, mileage: pos(archive.mileage) };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== ""));
}
// the sale the engine's own-sale lines speak of: the newest recorded sale
export const lastSaleOf = history => (history || []).find(h => h.kind === "sale" && h.price > 0) || null;
// the whole of the VIN step for a case
export function ownOf(archive, liveMatch) {
  const history = ownHistoryOf(archive), last = lastSaleOf(history), facts = lastSaleFacts(archive);
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
