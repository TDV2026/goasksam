// THE ENTRY PAGE EXAMPLES, PUBLIC (Lane B, Nov 10 2026). GET /api/publicExamples?name=<one of NAMES> (find = Find's live cars with intelligence, findSales = the completed sales it falls back on) answers { name, data } where data is the stored daily pick of that example, or null (the section hides). It reads; it never builds, never calls the engine
// or OldCarsData and never writes. Behind PUBLIC_EXAMPLES=1 (default off: data is null for everyone without the crew cookie); each example keeps its own kill switch inside its reader. The build is the cron's (lib/live/publicExamples.js).
import { findExamples, findExamplesFallback } from "../lib/live/findExamples.js";
import { readFeaturedHistory } from "../lib/live/featuredHistory.js";
import { marketCheckExample, marketCheckExampleResult, marketCheckExampleSales, sellExampleCard, sellExample } from "../lib/live/marketCheckExamples.js";
import { tasksEmailExample } from "../lib/live/tasksDemo.js";
import { publicExamplesOn } from "../lib/live/publicAccess.js";
import { isCrewRequest } from "../lib/_crew.js";
import { historyEnv } from "./_historyData.js";
export const READERS = {
  find: findExamples, findSales: findExamplesFallback, featured: readFeaturedHistory,
  mcCard: marketCheckExample, mcResult: marketCheckExampleResult, mcSales: marketCheckExampleSales,
  sellCard: sellExampleCard, sellCars: sellExample, tasksEmail: tasksEmailExample
};
export const NAMES = Object.keys(READERS);
export default async function handler(req, res) {
  const name = String((req.query && req.query.name) || "");
  if (!READERS[name] || req.method !== "GET") { res.statusCode = 404; res.setHeader("Cache-Control", "no-store"); return res.end(); }
  const live = publicExamplesOn() && !isCrewRequest(req);
  // a crew request is never cached; a public one may be held at the edge for a minute (the reader already re-checked a live car and dropped an ended one)
  res.setHeader("Cache-Control", live ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60" : "private, no-store");
  const env = historyEnv();
  const data = env ? await READERS[name](env, req).catch(() => null) : null;
  return res.status(200).json({ name, data: data === undefined ? null : data });
}
