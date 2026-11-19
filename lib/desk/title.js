// ONE TITLE FUNCTION (Lane D, Nov 16 2026; Lane C's trace on lead 17e2a09b: after Re-read filled the year, make and model the queue still said "Needs the car", because the queue card read the sheet's car_label while the header read the case's fields). The title of a case is the engine's own title (desk.titleLine), else the year, make, model and trim of the case's fields, else "Needs the car". Every queue card, every header, the report and the email subject read it here. A sheet made before cases existed (no case at all) has only its label, which is its title; a case never reads car_label first.
import { reasonLine } from "../reasonWords.js";
const fv = (c, k) => { const f = c && c.fields && c.fields[k]; return f && f.value != null && String(f.value).trim() !== "" ? String(f.value).trim() : null; };
export const titleOfCase = c => (c && c.desk && c.desk.titleLine) || [fv(c, "year"), fv(c, "make"), fv(c, "model"), fv(c, "trim")].filter(Boolean).join(" ") || null;
export const titleOfSheet = s => titleOfCase(s && s.case) || (s && !s.case && s.car_label ? s.car_label : null) || reasonLine("case.title.needs_car");
// THE VIN ROW (Lane D, Nov 16 2026; Lane C's trace: a 1961 Corvette's VIN row read "Not given" while the seller's chassis 10867S109963 was held as a lead fact): the row shows the VIN with its own tag, else the chassis the seller gave ("Chassis 10867S109963", Seller supplied, never Verified), and is empty only when neither exists. The report prints the same text.
export const vinRowOf = (c, sheet) => {
  const f = c && c.fields && c.fields.vin; if (f && f.value) return { kind: "vin", value: f.value, text: reasonLine("case.vin.vin", { vin: f.value }), source: f.source, verified: !!f.verified };
  const ch = (c && c.lead && c.lead.facts && c.lead.facts.chassis && c.lead.facts.chassis.value) || (sheet && sheet.chassis) || null;
  return ch ? { kind: "chassis", value: String(ch), text: reasonLine("case.vin.chassis", { chassis: ch }), source: "seller", verified: false } : null;
};
