// DESK V3 STAGE 3: THE REPORT'S WORDING, FROM THE CASE (Lane D, Nov 8 2026). Every sentence the report prints about the case is built here, from the case record and the engine's answer stored on it (case.desk, case.record), and
// every sentence is a lib/reasonWords.js line: this file picks the line from the case's state and hands it the case's own values. It computes no figure (the range, quartiles and median are the engine's; the reserve and
// assessment are the analyst's) and it types no sentence. A sentence the case cannot support is not built at all: its field is null, never a softer claim. The workspace and the PDF both read this one object.
import { reasonLine } from "../reasonWords.js";
import { TIER_LADDER } from "../conditionTier.js";
import { countNoun } from "../countNoun.js";
import { reservePosition } from "./caseWorkflow.js";

const IMS_WORDS = /\bIMS\b|intermediate shaft/i;
export function reportState(c) {
  const ev = c.desk && c.desk.evidence ? c.desk.evidence : null, f = k => c.fields[k], out = {};
  // identification as the case holds it (values, not sentences); a missing field is null and the page prints nothing for it
  out.identification = Object.fromEntries(["vin", "year", "make", "model", "trim", "body", "transmission", "generation", "colour"].map(k => [k, f(k).value]));
  // the two figures
  const a = c.assessment, r = c.reserve;
  out.rangeLine = a.low != null && a.high != null ? reasonLine("report.range", { low: a.low, high: a.high }) : null;
  out.reserveLine = r.figure != null ? reasonLine("report.reserve", { figure: r.figure }) : null;
  // the assessment against the market reference (the engine's median): one line, printed by the workspace and the report alike. The difference is the analyst's figure minus the engine's median, to the dollar; the engine's figure is never changed.
  out.differenceLine = a.figure != null && ev && !ev.insufficient && ev.median != null ? (a.figure === ev.median ? reasonLine("report.assess_same", { reference: ev.median }) : reasonLine(a.figure > ev.median ? "report.assess_above" : "report.assess_below", { diff: Math.abs(a.figure - ev.median), reference: ev.median })) : null;
  out.explanation = String(a.explanation || "").trim() || null;   // the analyst's own words
  out.rationale = String(r.rationale || "").trim() || null;
  // the engine's evidence, in the engine's own sentence
  out.populationLine = ev && ev.population ? ev.population.sentence || null : null;
  out.insufficientLine = ev && ev.insufficient ? ev.sentence || null : null;
  out.typicalLine = ev && !ev.insufficient && ev.q1 != null && ev.q3 != null ? reasonLine("report.typical", { q1: ev.q1, q3: ev.q3, median: ev.median, sales: countNoun(ev.count, "sale", { words: false }) }) : null;
  // the reserve against the typical range: the SAME comparison the workspace uses (caseWorkflow.reservePosition)
  const pos = reservePosition(c);
  out.reservePosition = pos;
  out.reservePositionLine = pos ? reasonLine("report.reserve_" + pos, { q1: ev.q1, q3: ev.q3 }) : null;
  // the seller's agreement appears only when it is true
  out.sellerLine = r.seller_agreed === true ? reasonLine("report.seller_agreed") : null;
  // mileage: verified, as stated by the seller, or not confirmed; nothing when there is none
  const m = f("mileage");
  out.mileageWords = m.value == null ? null : countNoun(m.value, "mile", { words: false });   // "61,400 miles", the one place the mileage is put in words
  out.mileageLine = m.value == null ? null : m.verified ? reasonLine("report.mileage_verified", { miles: out.mileageWords }) : m.source === "seller" ? reasonLine("report.mileage_stated", { miles: out.mileageWords }) : reasonLine("report.mileage_unconfirmed", { miles: out.mileageWords });
  // IMS: only a car whose case speaks of IMS work (the seller's service history, or a service document named for it) gets a line; the engine's factor says what the market did, never what this car had done. Seller reported with the invoices outstanding until a service document is received, then documented.
  const speaks = IMS_WORDS.test(String(f("service_history").value || "")) || c.documents.some(d => d.kind === "service" && IMS_WORDS.test(d.name));
  const received = c.documents.some(d => d.kind === "service" && d.status === "received");
  out.imsLine = !speaks ? null : received ? reasonLine("report.ims_documented") : reasonLine("report.ims_reported");
  // condition: one line per rung of the ladder, for the tier the analyst selected; the engine's suggestion is not the report's condition
  const t = c.condition && c.condition.selected && Number(c.condition.selected.tier);
  out.conditionLine = TIER_LADDER[t] ? reasonLine("report.condition", { name: TIER_LADDER[t].name, tier: t, line: TIER_LADDER[t].line }) : null;
  // limitations: every item still open, and every waived item with its reason; a done item is not a limitation
  out.limitations = c.needs_review.filter(n => n.state === "open" || n.state === "waived").map(n => n.state === "open" ? reasonLine("report.limit_open", { label: n.label }) : reasonLine("report.limit_waived", { label: n.label, reason: n.reason }));
  // next steps: the invoices step goes when the service documents are received
  const steps = [];
  if (c.documents.some(d => d.kind === "service") && !received) steps.push(reasonLine("report.next_invoices"));
  if (m.value != null && !m.verified) steps.push(reasonLine("report.next_mileage"));
  if (r.figure != null && r.seller_agreed !== true) steps.push(reasonLine("report.next_reserve"));
  out.nextSteps = steps.length ? steps : [reasonLine("report.next_none")];
  // the note on page 4: the one sentence when the VIN has no earlier auction record, and only when a VIN was read and the engine found none
  out.noteLines = f("vin").value && c.record && c.record.appearances === 0 ? [reasonLine("desk.no_prior_vin")] : [];
  return out;
}
