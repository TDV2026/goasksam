// Shared helpers for the GoAskSam tool handlers (market_check / car_history / where_to_sell), extracted
// verbatim from api/mcp.js so BOTH the MCP server and Lane C's /buy conversation import one copy.
// No behaviour change: the functions are identical to the originals.
import { resolveVehicle, sanitizeResolvedVehicle } from "../vehicle.js";

export const SITE = "https://goasksam.com";
export const MAX_RESULTS = 20;

// ---------- Sam's voice (third person; no dashes; banned words; never a live-bid verdict / source count) ----------
const BANNED = /\b(valuation|valued|worth|estimate[sd]?|apprais\w*|AI\b)\b/gi;
export function sam(s) {
  return String(s || "")
    .replace(/[‒-―−]/g, ", ").replace(/ -- /g, ", ").replace(/ - /g, ", ")
    .replace(BANNED, m => ({ valuation: "market read", valued: "sold", worth: "sold for", estimate: "record", estimates: "records", estimated: "recorded", appraisal: "record", appraised: "recorded", AI: "GoAskSam" }[m.toLowerCase()] || "record"))
    .replace(/\s+/g, " ").trim();
}
export const usd = n => (Number.isFinite(Number(n)) && Number(n) > 0 ? "$" + Math.round(Number(n)).toLocaleString() : null);
// Dates in copy read "October 2025", never "2025-10-16".
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function monthYear(d) { const m = /^(\d{4})-(\d{2})/.exec(String(d || "")); return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (d ? String(d) : ""); }

// ---------- shared: resolve plain text to a vehicle, archive-only ----------
export async function resolveSpec(text) {
  const resolution = await resolveVehicle(text).catch(() => null);
  const v = resolution && resolution.vehicle;
  if (!v || !v.make) return { question: (resolution && resolution.clarification && resolution.clarification.question) || "Which car is it? A year, make and model works best." };
  if (!v.model) return { question: `Which ${v.make} model is it?` };
  const vehicle = sanitizeResolvedVehicle(v) || v;
  vehicle.raw = vehicle.raw || text;
  return { vehicle };
}

export function specLabel(rc) { return rc ? [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle].filter(Boolean).join(" ") : null; }
export function pageLink(rc) {
  const q = specLabel(rc) || "";
  return `${SITE}/onebox?q=${encodeURIComponent(q)}`;
}

// ---------- Sam's-voice one-liner summaries per tool ----------
export function summarize(tool, out) {
  if (out.kind === "question") return sam(out.question);
  if (out.kind === "refusal") return sam(out.reason + (out.closestSale && out.closestSale.hammerUsd ? ` The closest recorded sale is ${out.closestSale.title}, hammer ${out.closestSale.hammerUsd}.` : ""));
  if (tool === "market_check") {
    const r = out.soldRangeHammerUsd;
    let s = `Cars like the ${out.spec} have sold between ${r.low} and ${r.high} at the hammer`;
    if (out.period) s += ` over ${out.period.toLowerCase()}`;
    s += ".";
    if (out.closestSale && out.closestSale.hammerUsd) s += ` The closest recorded sale is the ${out.closestSale.title}, hammer ${out.closestSale.hammerUsd}.`;
    return sam(s);
  }
  if (tool === "car_history") {
    const sold = out.appearances.filter(a => a.result === "sold");
    const last = sold[0] || out.appearances[0];
    if (sold.length) {
      const subject = out.car ? `This ${out.car}` : "This car";
      let s = `${subject} has sold at auction ${sold.length === 1 ? "once" : sold.length + " times"}`;
      if (last && last.result === "sold") s += `, most recently for ${last.hammerUsd || "an undisclosed amount"} at the hammer${last.house ? " at " + last.house : ""}${last.date ? " in " + monthYear(last.date) : ""}`;
      return sam(s + ".");
    }
    // no sale on record: name the car (or "It"), the venue, and the month, in plain past tense.
    const subj = out.car ? `This ${out.car}` : "It";
    return sam(last ? `${subj} was last offered${last.house ? " at " + last.house : " at auction"}${last.date ? " in " + monthYear(last.date) : ""} and didn't sell.` : `${out.car ? "This " + out.car : "This car"} has no recorded auction sale.`);
  }
  if (tool === "where_to_sell") {
    const top = out.platforms[0];
    return sam(top ? `Cars like the ${out.spec} have sold most on ${top.platform}${top.medianHammerUsd ? `, where the median hammer was ${top.medianHammerUsd}` : ""}.` : `GoAskSam cannot yet say where the ${out.spec} sells best.`);
  }
  return "";
}
