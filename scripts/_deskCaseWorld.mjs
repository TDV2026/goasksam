// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane D, Nov 2026)
// Shared by the desk v3 workflow checks: Lane B's fake archive (scripts/_deskV3World.mjs) read through the real engine path, and a case taken to ready through the real workflow functions.
import path from "node:path"; import { pathToFileURL } from "node:url";
export async function setup(root) {
  const imp = f => import(pathToFileURL(path.join(root, f)).href);
  const W = await imp("scripts/_deskV3World.mjs"), S = await imp("lib/sheetRead.js"), M = await imp("lib/desk/caseModel.js"), K = await imp("lib/desk/caseWorkflow.js");
  console.error = () => {};
  const w = W.install(), head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), calls = [];
  const read = async input => { calls.push(input); return S.sheetRead(w.env, { ...input, desk: { ...input.desk, head } }, w.deps); };
  const T = new Date().toISOString(), today = T.slice(0, 10);
  const car = { year: 1999, make: "Porsche", model: "911", trim: "Carrera", body: "Coupe", transmission: "Manual", mileage: 61400, colour: "Silver", accident_history: "None reported by the seller" };
  // a case taken to ready with the workflow's own functions
  async function readyCase() {
    let c = M.newCase({ org: "t", leadRef: "HM-24117", seller: { name: "Hal" }, submittedAt: T, now: T, vehicle: car, source: "seller" });
    c = M.addPhoto(c, { id: "ph1", name: "front.jpg" }, T); c = M.addDocument(c, { id: "d1", name: "IMS invoice", kind: "service", status: "received" });
    for (const k of ["mileage", "accident_history", "transmission"]) c = K.verify(c, k, { now: T });
    c = K.syncNeeds(c); c = (await K.refreshEvidence(c, read, { caseDate: today, now: T })).case;
    const ev = c.desk.evidence;
    c = K.selectComparables(c, c.desk.comparables.filter(x => x.inPopulation && x.url).slice(0, 2).map(x => x.id), T);   // two, each with its own listing (the report check)
    c = K.setAssessment(c, { figure: ev.median, low: ev.q1, high: ev.q3, explanation: "Manual 996 coupes in the record, near the median." }, T);
    c = K.setReserve(c, { figure: ev.q1, rationale: "Held at the lower quartile of the record." }, T);
    c = (await K.refreshEvidence(c, read, { caseDate: today, now: T })).case;   // the reserve is an input to the engine (reserveCheck), so the case is read once more for it
    return K.settle(c, T);
  }
  return { M, K, read, calls, readyCase, T, today, W, w };
}
