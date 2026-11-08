// DESK VALUATIONS: the decision rules, in one place (docs/desk-valuations-spec.md, "The one number"). The page never judges a figure: it sends the expert's draft here (through the Desk
// API) and prints what comes back, inline as they type; finalise runs the SAME function, so what is shown and what is enforced cannot differ.
//
// A draft:  { mode:"reserve"|"range"|null, reserve, low, high, reasons:[keys], otherText, line, guardLines:{prior, start}, note }
// The read: the sheetRead object (market.p25/p75 the market range, market.startingFigure, condition.tooFew).
// The org:  { threshold (default 0.15) }.   priors: earlier FINALISED valuations of the same VIN by this org: [{ reportNumber, mode, reserve, low, high, finalisedAt }].
// Returns:  { given, inRange, reasonsNeeded, guards:[{key,text,needsLine,line}], missing:[{key,text}], canFinalise }
import { REASONS, DEFAULT_THRESHOLD } from "./sheetShape.js";

const num = v => { const n = Math.round(Number(String(v == null ? "" : v).replace(/[^\d.]/g, ""))); return n > 0 ? n : null; };
const usd = n => "$" + Math.round(n).toLocaleString("en-US");

export function givenOf(draft) {
  const d = draft || {};
  if (d.mode === "reserve") { const r = num(d.reserve); return r ? { mode: "reserve", reserve: r, low: r, high: r } : null; }
  if (d.mode === "range") { const lo = num(d.low), hi = num(d.high); return lo && hi && lo <= hi ? { mode: "range", low: lo, high: hi } : null; }
  return null;
}

export function evaluateDecision({ read, draft, org = {}, priors = [] } = {}) {
  const d = draft || {}, thr = Number(org.threshold) > 0 ? Number(org.threshold) : DEFAULT_THRESHOLD, missing = [], guards = [];
  const m = (read && read.market) || {}, tooFew = !!(read && read.condition && read.condition.tooFew);
  const given = givenOf(d);
  // a pool that splits by body, gearbox, edition or year has no one figure: the option is picked before the sheet is locked
  for (const q of (Array.isArray(m.asks) ? m.asks : [])) if (q && q.selected == null) missing.push({ key: "pick_" + q.dimension, text: `Pick the ${q.noun || q.dimension}.` });
  // 1 a reserve or a range, one is required
  if (d.mode !== "reserve" && d.mode !== "range") missing.push({ key: "mode", text: "Choose a reserve or a range." });
  else if (d.mode === "reserve" && !num(d.reserve)) missing.push({ key: "reserve", text: "Enter the reserve." });
  else if (d.mode === "range" && !(num(d.low) && num(d.high))) missing.push({ key: "range", text: "Enter the low and the high of the range." });
  else if (d.mode === "range" && num(d.low) > num(d.high)) missing.push({ key: "range", text: "The low of the range is above the high." });
  // 2 outside the market range (or too few same tier sales, which leaves no range of its own): at least one reason ticked and a typed line
  const have = Number(m.p25) > 0 && Number(m.p75) > 0 && !tooFew;
  const inRange = !!given && have && (given.mode === "reserve" ? given.reserve >= m.p25 && given.reserve <= m.p75 : given.low >= m.p25 && given.high <= m.p75);
  const reasonsNeeded = !!given && !inRange;
  const ticked = (d.reasons || []).filter(k => REASONS.some(r => r.key === k));
  if (reasonsNeeded) {
    if (!ticked.length) missing.push({ key: "reasons", text: tooFew ? "Too few sales in this condition: tick at least one reason." : "The figure is outside the market range: tick at least one reason." });
    if (ticked.includes("other") && !String(d.otherText || "").trim()) missing.push({ key: "other", text: "You ticked Other: type what it is." });
    if (!String(d.line || "").trim()) missing.push({ key: "line", text: "Type the line of reasoning." });
  }
  // 3 the guards never block; each always asks for a typed line
  const mid = given ? (given.mode === "reserve" ? given.reserve : (given.low + given.high) / 2) : null;
  if (given) {
    const last = (priors || []).filter(p => p && p.finalisedAt).sort((a, b) => String(b.finalisedAt).localeCompare(String(a.finalisedAt)))[0];
    if (last) {
      const pm = last.mode === "reserve" ? Number(last.reserve) : (Number(last.low) + Number(last.high)) / 2;
      if (pm > 0 && Math.abs(mid - pm) / pm > thr) guards.push({ key: "prior", text: `This VIN was valued before by your organisation (report ${last.reportNumber}, ${usd(pm)}). This figure differs by more than ${Math.round(thr * 100)} percent. Say why.`, needsLine: true, line: String((d.guardLines || {}).prior || "") });
    }
    const sf = Number(m.startingFigure);
    if (sf > 0 && Math.abs(mid - sf) / sf > thr) guards.push({ key: "start", text: `The ${given.mode === "reserve" ? "reserve" : "middle of the range"} is more than ${Math.round(thr * 100)} percent from the starting figure of ${usd(sf)}. Say why.`, needsLine: true, line: String((d.guardLines || {}).start || "") });
  }
  for (const g of guards) if (g.needsLine && !g.line.trim()) missing.push({ key: "guard_" + g.key, text: g.key === "prior" ? "Type why this differs from the earlier valuation of this VIN." : "Type why this is away from the starting figure." });
  return { given, inRange, reasonsNeeded, guards, missing, canFinalise: missing.length === 0 };
}
