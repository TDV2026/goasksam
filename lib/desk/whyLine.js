// WHY THIS SALE (Lane D, Nov 15 2026, order 2318 item 3). One line per closest sale, built from what the sale DIFFERS in from the case car, never from what it matches: the engine's own `differences`
// ({ miles (sale minus car, signed, null if unstated), gearbox, body, year (signed), spec, condition }, lib/deskV3.js differsOf) and nothing else. Pure: no sentence lives here, every word comes from lib/reasonWords.js.
import { reasonLine, deskMilesWords, deskYearWords, deskTierWords } from "../reasonWords.js";
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const boxWord = w => { const t = String(w || "").toLowerCase(); return /manual|stick|speed/.test(t) && !/auto/.test(t) ? "manual" : /auto|tiptronic|dsg|pdk|dual|cvt/.test(t) ? "automatic" : null; };
export function whyLineOf(row, carBox) {
  const d = row && row.differences; if (!d || typeof d !== "object") return null;
  const parts = []; let lead = null;
  if (d.miles == null) parts.push(reasonLine("case.why.nomiles"));
  else if (Math.abs(d.miles) >= 1000) parts.push(lower(deskMilesWords(d.miles)));
  else lead = reasonLine("case.why.lead_band");
  if (Number(d.year) !== 0 && Number.isFinite(Number(d.year))) parts.push(lower(deskYearWords(Number(d.year))));
  if (d.gearbox === "other") { const a = boxWord(row.transmission), b = boxWord(carBox); parts.push(a && b && a !== b ? reasonLine("case.why.box_both", { sale: a, car: b }) : reasonLine("case.why.box_other")); }
  if (d.body === "other") parts.push(reasonLine("case.why.body_other"));
  if (d.condition === "other" && Number(row.tier) && Number(row.carTier)) parts.push(lower(deskTierWords(Number(row.tier) - Number(row.carTier))));
  const all = lead ? [lead, ...parts] : parts, same = d.spec === "same";
  if (!all.length) return reasonLine("case.why.line_only", { head: reasonLine(same ? "case.why.none_spec" : "case.why.none") });
  const head = cap(all.length < 2 ? all[0] : all.slice(0, -1).join(", ") + " and " + all[all.length - 1]);
  const clean = d.gearbox !== "other" && d.body !== "other" && !(d.condition === "other");
  return clean && same ? reasonLine("case.why.line", { head, tail: reasonLine("case.why.tail_spec") }) : reasonLine("case.why.line_only", { head });
}
