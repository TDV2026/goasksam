// A FORWARDED LEAD BECOMES A V4 CASE (Lane D, Nov 10 2026). The intake row (lib/desk/intake/run.js) makes the sheet and its files; this makes the CASE that lives on that sheet (sheet.case), so the lead lands in New leads already filled in and the
// analyst opens a case, not a bare row. Every field the seller or the email supplied is marked seller supplied and unverified until the analyst verifies it (a VIN's decode is marked vin_decoded); nothing here makes a figure: the market read is the
// engine's, taken by the ONE road a typed case takes (caseWorkflow.openCaseRead), so the read is identical.
//   caseFromLead   the case from what the email carried (pure; no engine)
//   attachCase     writes it on the sheet, once (a second email is merged, never a second case)
//   caseReader     the background engine read for the stored case, written under the sheet's version (a case the analyst edited meanwhile is never overwritten)
import { newCase, setField, addPhoto, addDocument, logAudit, FIELD_KEYS } from "../caseModel.js";
import { syncNeeds, openCaseRead, settle } from "../caseWorkflow.js";
import { countNoun } from "../../countNoun.js";
import { reasonLine } from "../../reasonWords.js";

const iso = now => now || new Date().toISOString();
const GEAR = g => (g ? String(g) : null);

// THE HAGERTY FORM'S OTHER ANSWERS (Lane D, Nov 11 2026), each seller supplied and unverified: case.lead.facts (modified, mileageOriginal, forSaleElsewhere, titleInOwnName, titleStatus, city, state, zip, the odometer as stated, the chassis number), reserve.sellerPreference (yes, no, not_sure),
// and the three free text answers as documents in the seller's own words (kind other, sellerWords, field, title, text). Nothing here reaches the why text or any figure: the words are kept for the analyst to read.
export function applyHagertyForm(c0, form, at) {
  const c = structuredClone(c0), f = (value) => ({ value, source: "seller", verified: false });
  const facts = { modified: form.modified, mileageOriginal: form.mileageOriginal, forSaleElsewhere: form.forSaleElsewhere, titleInOwnName: form.titleInOwnName, titleStatus: form.titleStatus, city: form.city, state: form.state, zip: form.zip, chassis: form.chassis, odometerUnit: form.odometer ? form.odometer.unit : null, odometerAsStated: form.odometer ? form.odometer.value : null };
  c.lead = { source: "hagerty_form", facts: Object.fromEntries(Object.entries(facts).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, f(v)])) };
  if (form.reserve) c.reserve = { ...(c.reserve || {}), sellerPreference: form.reserve };
  let out = c;
  for (const [k, text] of [["special", form.special], ["flaws", form.flaws], ["upgrades", form.upgrades]]) if (text && /\S/.test(text)) out = addDocument(out, { id: "form-" + k, name: reasonLine("case.lead.question." + k), kind: "other", status: "received", receivedAt: at, title: reasonLine("case.lead.question." + k), sellerWords: true, field: k, text });
  logAudit(out, { at, by: "intake", what: "form answers read", field: "lead", to: "hagerty_form" });
  return out;
}

// what the sheet object holds (lib/desk/intake/toSheet.js sheetObjectOf) -> the case
export function caseFromLead({ orgId, sheet, read, car, receivedAt }) {
  const sub = sheet.submission || {}, at = iso(receivedAt), cons = read && read.consignor;
  const seller = cons || (read && (read.phone || read.asking)) ? { name: cons && cons.name, email: cons && cons.email, phone: read.phone || null, asking_price: read.asking || null } : null;
  // what the SELLER supplied: the VIN, the mileage, the gearbox, the colour and the car words they typed (source seller, unverified)
  const typed = car && car.source === "typed" ? { year: car.year, make: car.make, model: car.model, trim: car.trim, body: car.bodyStyle } : {};
  // THE HAGERTY FORM (lib/desk/intake/hagertyForm.js): the car the seller typed into the form (year, make, model, sub-model as the trim) and the odometer; every answer is the seller's and unverified
  const form = read && read.form, fromForm = form ? { year: form.year, make: form.make, model: form.model, trim: form.subModel } : {};
  const supplied = { vin: read && read.vin, mileage: read && read.mileage ? read.mileage.miles : sub.mileage, transmission: GEAR(read && read.gearbox), colour: read && read.colour, ...typed, ...Object.fromEntries(Object.entries(fromForm).filter(([, v]) => v != null && v !== "")) };
  let c = newCase({ org: orgId, leadRef: sheet.id, seller, submittedAt: sheet.created_at || at, now: at, vehicle: supplied, source: "seller", origin: "forwarded" });
  // what the VIN's decode named (source vin_decoded, unverified): only the blanks
  if (car && car.source !== "typed") for (const [k, v] of [["year", car.year], ["make", car.make], ["model", car.model], ["trim", car.trim], ["body", car.bodyStyle]]) if (v != null && v !== "" && c.fields[k].value == null) c = setField(c, k, v, "vin_decoded", { by: "intake", now: at, quiet: true });
  for (const p of sub.photos || []) c = addPhoto(c, p, at);
  for (const d of sub.documents || []) c = addDocument(c, { ...d, status: "received", receivedAt: at });
  logAudit(c, { at, by: "intake", what: "forwarded lead received", field: "origin", to: "forwarded" });
  if (form) c = applyHagertyForm(c, form, at);
  return syncNeeds(c);
}

// the sheet's own version is the writer's guard: a write that read an older version is refused whole (sheetStore.putIf)
async function putCase(sheets, orgId, row, c, extra = {}) { const next = { ...row, ...extra, case: c, version: (row.version || 0) + 1 }; return sheets.putIf(orgId, next, row.version || 0); }

// The case for a new row, once. A sheet that already has a case is never given a second.
export async function attachCase({ sheets, orgId, sheetId, read, car, receivedAt }) {
  const row = await sheets.get(orgId, sheetId); if (!row) return { made: false, reason: "no_sheet" };
  if (row.case && row.case.fields) return { made: false, reason: "has_case", case: row.case };
  const c = caseFromLead({ orgId, sheet: row, read, car, receivedAt }), ok = await putCase(sheets, orgId, row, c);
  return ok ? { made: true, case: c } : { made: false, reason: "stale" };
}

// A later email on the same lead: the new photos and documents join the case, a blank fact is filled (never one already held), the original case stays one.
export async function mergeIntoCase({ sheets, orgId, sheetId, read, receivedAt }) {
  const row = await sheets.get(orgId, sheetId); if (!row || !row.case || !row.case.fields) return { merged: false };
  const at = iso(receivedAt), sub = row.submission || {}, had = new Set(row.case.photos.items.map(p => p.id)), hadD = new Set(row.case.documents.map(d => d.id));
  let c = row.case, nP = 0, nD = 0;
  for (const p of sub.photos || []) if (!had.has(p.id)) { c = addPhoto(c, p, at); nP++; }
  for (const d of sub.documents || []) if (!hadD.has(d.id)) { c = addDocument(c, { ...d, status: "received", receivedAt: at }); nD++; }
  const fill = { vin: read && read.vin, mileage: read && read.mileage ? read.mileage.miles : null, transmission: GEAR(read && read.gearbox), colour: read && read.colour };
  let nF = 0; for (const [k, v] of Object.entries(fill)) if (v != null && v !== "" && FIELD_KEYS.includes(k) && c.fields[k].value == null) { c = setField(c, k, v, "seller", { by: "intake", now: at, quiet: true }); nF++; }
  if (!(nP || nD || nF)) return { merged: false };
  const what = [nP ? countNoun(nP, "photo", { words: false }) : null, nD ? countNoun(nD, "document", { words: false }) : null, nF ? countNoun(nF, "detail", { words: false }) : null].filter(Boolean).join(", ");
  logAudit(c, { at, by: "intake", what: "email added", field: "email", to: what });
  const ok = await putCase(sheets, orgId, row, settle(syncNeeds(c), at)); return { merged: !!ok, photos: nP, documents: nD, fields: nF };
}

// THE BACKGROUND ENGINE READ for a stored case (never awaited by the webhook). It takes the same road as a typed case. A case that has no car to ask about is left as it is (the analyst enters it); a retry answer leaves it for the first edit to read; a case the analyst changed meanwhile is never overwritten.
export function caseReader({ sheets, readSheet, now = () => new Date().toISOString() }) {
  return async function readCase(orgId, sheetId) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await sheets.get(orgId, sheetId), c = row && row.case; if (!c || !c.fields || c.desk) return { read: false };
      const f = k => c.fields[k].value; if (!(f("vin") || (f("year") && f("make") && f("model")))) return { read: false, reason: "not_identified" };
      const at = now(), o = await openCaseRead(c, readSheet, { caseDate: at.slice(0, 10), now: at });
      if (!o.recalled) return { read: false, reason: "no_answer" };
      if (await putCase(sheets, orgId, row, settle(syncNeeds(o.case), at))) return { read: true, case: o.case };
    }
    return { read: false, reason: "stale" };
  };
}

// the sheet store the checks use over the intake memory store (the real one is lib/desk/sheetStore.js on the same desk_sheets row)
export function rowSheets(intake) {
  return {
    async get(orgId, id) { const r = await intake.getSheet(orgId, id); return r && r.sheet && r.sheet.id === r.id ? structuredClone(r.sheet) : null; },
    async putIf(orgId, sheet, expected) { const r = await intake.getSheet(orgId, sheet.id); if (!r || (Number(r.sheet && r.sheet.version) || 0) !== (Number(expected) || 0)) return false; await intake.patchSheet(orgId, sheet.id, { sheet: structuredClone(sheet) }); return true; }
  };
}
