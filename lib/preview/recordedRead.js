// THE PREVIEW'S READ WHEN NO ARCHIVE IS REACHABLE (Lane D, Nov 11 2026; it replaces the stand-in engine of lib/preview/deskV3Fixture.js, which typed twelve sample sales). It returns the engine's own recorded answer (lib/preview/deskRecordedReads.js)
// for exactly the question that was recorded: the same car, mileage, gearbox, body, condition rung, the 12 month period and no sale set aside. Any other question returns null (not read), never a nearby answer, so the preview cannot print a figure the engine did not read.
// Nothing here makes a figure or a sentence: the answer is returned as the engine gave it. The one addition is the engine's check of a reserve the case has taken (desk.reserveCheck): the recorded read was asked with no reserve, so the check is made by the engine's own function
// (lib/deskV3.js reserveCheckOf) over the engine's own recorded sales and range, exactly as the engine makes it for a read that carries a reserve, and only when those sales are the whole population the range was read from (the count agrees).
import { RECORDED } from "./deskRecordedReads.js";
import { reserveCheckOf } from "../deskV3.js";
const low = s => String(s == null ? "" : s).trim().toLowerCase();
export function recordedRead(input = {}) {
  const d = input.desk || {}, tier = [1, 2, 3, 4].includes(Number(input.tier)) ? Number(input.tier) : null;
  if (d.windowMonths != null && Number(d.windowMonths) !== 12) return null;
  if ((d.exclusions || []).length) return null;
  const hit = RECORDED.find(r => {
    const s = r.spec; if (r.tier !== tier) return false;
    const same = input.vin ? low(input.vin) === low(s.vin) : s.year === Number(input.year) && low(s.make) === low(input.make) && low(s.model) === low(input.model);
    return same && Number(input.mileage) === s.mileage && low(d.transmission) === low(s.transmission) && low(input.bodyStyle) === low(s.body);
  });
  if (!hit) return null;
  const out = structuredClone(hit.answer), k = out.desk, ev = k && k.evidence, fig = Number(d.reserve);
  if (k && ev && fig > 0 && Array.isArray(k.sales) && k.sales.length === ev.count) k.reserveCheck = reserveCheckOf(k.sales, ev, fig, ev.windowMonths);
  return out;
}
export const RECORDED_QUESTIONS = RECORDED.map(r => ({ ...r.spec, tier: r.tier }));
