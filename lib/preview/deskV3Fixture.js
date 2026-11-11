// The demonstration case for the Desk preview (Lane E, Nov 8 2026; the engine side rewritten by Lane D, Nov 11 2026): Lane D's real demonstration case (lib/desk/caseDemo.js, lead HM-24117, a 1999 Porsche 911 Carrera, a real Bring a Trailer sale)
// read by the engine. The read is the engine's own recorded answer (lib/preview/deskRecordedReads.js, through lib/preview/recordedRead.js); the old stand-in that typed twelve sample sales and an assessment of $58,500 is gone. The case takes the engine's start the way every case does
// (the assessment at the engine's median, the reserve at the engine's start, lib/desk/caseWorkflow.js adoptRead), so nothing here is typed and nothing on the page is computed.
import { demoCase } from "../desk/caseDemo.js";
import { refreshEvidence, syncNeeds, settle } from "../desk/caseWorkflow.js";
import { recordedRead } from "./recordedRead.js";
import { DEMO_PHOTO_LIST } from "../desk/demoCar.js";

export const DEMO_ID = "pv_hm";
export const DEMO_PHOTOS = DEMO_PHOTO_LIST.map(p => ({ id: p.id, name: p.name, url: p.url, from: p.from, credit: p.credit, bytes: p.bytes }));
// the case as the Desk holds it: Lane D's demonstration case with the engine's read stored on it, through the case's own road (the start, then the engine's check of the reserve it took)
export async function demoCaseRecord(now = new Date().toISOString()) {
  const c = (await refreshEvidence(demoCase(now), recordedRead, { caseDate: now.slice(0, 10), now })).case;
  return settle(syncNeeds(c), now);
}
