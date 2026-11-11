// WHAT A VISITOR GETS ON FIND (Lane E, Nov 11 2026). The two readers /api/publicExamples serves as find (the stored live cars) and findSales (the stored completed sales), read as a visitor reads them, then put into the card the page draws (fieldCompose.publicFindField).
// `read(file, fn, req)` is api/crewPage.js readField (it logs and marks a failed read). Nothing is built here: both readers only read the stored daily pick.
import { publicFindField } from "./fieldCompose.js";
export async function publicFindExamples(read, isMarker, req) {
  const [live, sales] = await Promise.all([read("../lib/live/findExamples.js", "findExamples", req), read("../lib/live/findExamples.js", "findExamplesFallback", req)]);
  return isMarker(live) ? live : isMarker(sales) ? sales : publicFindField(live, sales);
}
