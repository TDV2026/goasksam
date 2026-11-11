// The demonstration case for the Desk preview (Lane E, Nov 8 2026; the engine side rewritten by Lane D, Nov 11 2026): Lane D's real demonstration case (lib/desk/caseDemo.js, lead HM-24117, a 1999 Porsche 911 Carrera, a real Bring a Trailer sale)
// read by the engine. The read is the engine's own recorded answer (lib/preview/deskRecordedReads.js, through lib/preview/recordedRead.js); the old stand-in that typed twelve sample sales and an assessment of $58,500 is gone. The case takes the engine's start the way every case does
// (the assessment at the engine's median, the reserve at the engine's start, lib/desk/caseWorkflow.js adoptRead), so nothing here is typed and nothing on the page is computed.
import { demoCase } from "../desk/caseDemo.js";
import { newCase } from "../desk/caseModel.js";
import { refreshEvidence, openCaseRead, setCondition, addCasePhoto, syncNeeds, settle } from "../desk/caseWorkflow.js";
import { recordedRead } from "./recordedRead.js";
import { RECORDED } from "./deskRecordedReads.js";
import { DEMO_PHOTO_LIST, DEMO_VIN, DEMO_MILES } from "../desk/demoCar.js";

export const DEMO_ID = "pv_hm";
export const DEMO_PHOTOS = DEMO_PHOTO_LIST.map(p => ({ id: p.id, name: p.name, url: p.url, from: p.from, credit: p.credit, bytes: p.bytes }));
// the case as the Desk holds it: Lane D's demonstration case with the engine's read stored on it, through the case's own road (the start, then the engine's check of the reserve it took)
export async function demoCaseRecord(now = new Date().toISOString()) {
  const c = (await refreshEvidence(demoCase(now), recordedRead, { caseDate: now.slice(0, 10), now })).case;
  return settle(syncNeeds(c), now);
}

// THE OTHER SAMPLE CASES OF THE RAIL (Lane D, Nov 11 2026): each is a real car the engine read (its recorded answer), made the way New case makes one (the typed fields, the engine's decode, the engine's start), so each shows a state the engine really produced.
// SAMPLE_CASES names the car and the state it shows; nothing here is a figure, a sale or a sentence.
const asRead = model => RECORDED.find(r => r.spec.model === model).spec;   // the question the engine's recording answers (the car as it was read)
export const SAMPLE_CASES = [
  { id: "pv_240z", fields: { year: 1972, make: "Datsun", model: "240Z", mileage: asRead("240Z").mileage, transmission: "Manual", body: "Coupe" }, state: "open", minutesAgo: 6 },
  { id: "pv_thin", fields: { vin: DEMO_VIN, mileage: DEMO_MILES, transmission: "Manual", body: "Coupe" }, tier: { tier: 4, name: "Fair" }, state: "thin", minutesAgo: 35 },
  { id: "pv_fin", fields: { vin: DEMO_VIN, mileage: DEMO_MILES, transmission: "Manual", body: "Coupe" }, tier: { tier: 3, name: "Good" }, photos: true, state: "finalized", minutesAgo: 190 }   // a report needs the seller's own photos: only the demonstration car has them (its listing's real pictures)
];
export async function sampleCaseRecord(spec, now = new Date().toISOString()) {
  let c = newCase({ now, vehicle: spec.fields, source: "seller", seller: { name: "A Seller", email: "seller@example.com" } });
  c = (await openCaseRead(c, recordedRead, { caseDate: now.slice(0, 10), now })).case;
  if (spec.tier) c = (await refreshEvidence(setCondition(c, spec.tier, now), recordedRead, { caseDate: now.slice(0, 10), now })).case;
  if (spec.photos) for (const ph of DEMO_PHOTOS) c = addCasePhoto(c, ph, now);
  return settle(syncNeeds(c), now);
}
