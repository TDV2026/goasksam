// SPEC-PAGE LIVE COUNT ABROAD CHECK (Lane B, Oct 25 2026), no network: liveCount (lib/specPages.js, which refreshLiveCounts also calls) leaves out a
// listing abroad through isAbroadRow (lib/live/search.js), the one definition Find and Tasks use. A Canadian listing stays in; no country stays in.
import { liveCount } from "../lib/specPages.js";
import { isAbroadRow } from "../lib/live/search.js";
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
const rows = [
  { id: 1, listing_title: "1987 Porsche 911 Carrera Coupe", country: "US" }, { id: 2, listing_title: "1987 Porsche 911 Carrera Coupe", country: "CA" },
  { id: 3, listing_title: "1987 Porsche 911 Carrera Coupe", country: "GB" }, { id: 4, listing_title: "1987 Porsche 911 Carrera Coupe", country: "DE" },
  { id: 5, listing_title: "1987 Porsche 911 Carrera Targa", country: null }, { id: 6, listing_title: "1987 Porsche 911 Carrera Coupe", country: "us" },
];
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows), headers: { get: () => null } });
const env = { supabaseUrl: "http://x.invalid", supabaseKey: "k" };
const gen = { y: [1984, 1989] };
const all = await liveCount(gen, null, null, env), coupe = await liveCount(gen, null, "coupe", env);
globalThis.fetch = realFetch;
ok(all === rows.filter(r => !isAbroadRow(r)).length && all === 4, `abroad (GB, DE) left out of the generation count: ${all} of ${rows.length}`);
ok(coupe === 3, `a body narrows the same cars: ${coupe}`);
console.log(failed ? `specLiveAbroadCheck: ${failed} FAILED.` : "specLiveAbroadCheck: all passed.");
process.exit(failed ? 1 : 0);
