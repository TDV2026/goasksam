// The demonstration case for desk v3 (Lane D, Nov 8 2026): a 1999 Porsche 911 Carrera that came in as lead HM-24117. Built only through the case model's own functions, so it is a real case, not a hand-written shape.
// Lane E builds against this; the checks use it. No market figure is here: the assessment and reserve stay empty until the analyst sets them (they come from the engine's evidence, never from this file).
import { DEMO_VIN, DEMO_MILES, DEMO_PHOTO_LIST } from "./demoCar.js";
import { newCase, setField, addPhoto, addDocument, addNeed, markAsked } from "./caseModel.js";
export function demoCase(now = "2026-11-08T09:00:00.000Z") {
  let c = newCase({ org: "sam", leadRef: "HM-24117", seller: { name: "Hal Moreau", email: "hal@example.com" }, submittedAt: "2026-11-07T18:20:00.000Z", now, source: "seller", vehicle: { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", mileage: DEMO_MILES, colour: "Arctic Silver" } });
  c = setField(c, "vin", DEMO_VIN, "seller", { by: "intake", now, quiet: true });
  c = setField(c, "generation", "996", "vin_decoded", { by: "intake", now, quiet: true });
  c = setField(c, "service_history", "Seller reports the IMS bearing was replaced", "seller", { by: "intake", now, quiet: true });
  c = markAsked(c, ["accident_history"], now);
  for (const ph of DEMO_PHOTO_LIST) c = addPhoto(c, { id: ph.id, name: ph.name }, now);
  c = addDocument(c, { id: "doc_ims", name: "IMS invoice", kind: "service", status: "outstanding" });
  c = addNeed(c, { id: "mileage_unconfirmed", label: "Mileage not confirmed", material: true });
  c = addNeed(c, { id: "service_documents", label: "No service documents yet", material: false });
  c.audit = []; return c;
}
