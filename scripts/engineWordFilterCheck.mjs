// Engine-word filter check (Lane B, Nov 4 2026, job lane-b-rick point 2, Rick Carey's launch-day feedback: a "Mustang V8" search printed "Sam didn't use 'v8' in this search"). THE CLASS: the live
// search (Find, Buy, Tasks) took a gearbox word out of the text and filtered on it, but left every engine word (V8, V6, V10, V12, flat-six, straight-six, four-cylinder, turbo, supercharged, diesel) and the
// N-speed word in the text, where the leftover-words line named it as unused. ONE table (lib/typedAttributes.js) now serves the engine's stored sales and the live listings. Must hold:
//  (1) EVERY engine word and N-speed word the parser knows is taken out of the text into filters.attrWords, and no applied word is ever named in the "didn't use" line;
//  (2) EVERY gearbox word the parser knows is a filter (gearbox) and is never named unused;
//  (3) a car whose own name carries the word (a V8 Vantage, a 911 Turbo) keeps it as the car, not a filter;
//  (4) searchLive keeps a V8 listing, drops a listing that says V6, and keeps (marked "engine" not stated) a listing that says nothing; the same for an N-speed word;
//  (5) the stored sales read the same words (typedAttributesIn) - one table.
//   node scripts/engineWordFilterCheck.mjs          (ROOT=<tree> runs it against another tree to show it fails)
import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const S = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href), U = await import(pathToFileURL(path.join(ROOT, "lib/live/unusedWords.js")).href), T = await import(pathToFileURL(path.join(ROOT, "lib/typedAttributes.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const mustang = { make: "Ford", model: "Mustang", year: 2017, raw: "" };
// every engine / speed word as a reader types it -> the key it must become
const ENGINE = [["V8", "v8"], ["V-8", "v8"], ["v6", "v6"], ["V10", "v10"], ["V12", "v12"], ["flat-six", "flat6"], ["flat 6", "flat6"], ["boxer six", "flat6"], ["straight-six", "inline6"], ["inline 6", "inline6"], ["four-cylinder", "four"], ["4 cylinder", "four"],
  ["turbo", "turbo"], ["turbocharged", "turbo"], ["supercharged", "supercharged"], ["supercharger", "supercharged"], ["diesel", "diesel"], ["TDI", "diesel"], ["6-speed", "speed6"], ["six speed", "speed6"], ["5 speed", "speed5"], ["4-spd", "speed4"]];
for (const [w, key] of ENGINE) {
  const q = "Mustang " + w, x = S.parseQuery(q), a = (x.filters && x.filters.attrWords) || [];
  const u = U.unusedWordsOf(q, { ...mustang, raw: q }, null);
  ok(`"${w}" is an applied filter (${key}) and out of the text`, a.includes(key) && !new RegExp(w.replace(/[-\s]/g, "[-\\s]?"), "i").test(x.text), JSON.stringify({ attrWords: a, text: x.text }));
  ok(`"${w}" is never named in "Sam didn't use ..."`, !(u.unused || []).some(t => String(w).toLowerCase().split(/[^a-z0-9]+/).includes(t) || t === String(w).toLowerCase()), JSON.stringify(u.unused));
}
// every gearbox word
for (const w of ["manual", "stick", "stick shift", "three pedals", "automatic", "auto", "PDK", "tiptronic", "DCT", "DSG", "SMG", "e-gear", "paddle shift"]) {
  const q = "Mustang " + w, x = S.parseQuery(q), u = U.unusedWordsOf(q, { ...mustang, raw: q }, null);
  ok(`gearbox word "${w}" is a filter and never unused`, !!x.filters.gearbox && !(u.unused || []).length, JSON.stringify({ gearbox: x.filters.gearbox, unused: u.unused }));
}
// the car's own name keeps its word
{ const own = new Set(["vantage", "v8", "turbo", "911"]);
  ok("a V8 Vantage keeps V8 as the car's own word", (S.parseQuery("Aston Martin Vantage V8", own).filters.attrWords || []).length === 0);
  ok("a 911 Turbo keeps Turbo as the car's own word", (S.parseQuery("Porsche 911 Turbo", own).filters.attrWords || []).length === 0); }
// searchLive on a fake feed
const live = (id, title, desc, tx) => ({ id, source: "bringatrailer", source_listing_id: "s" + id, url: "https://x/" + id, listing_title: title, make: "Ford", model: "Mustang", year: 2017, vin_norm: null, mileage: 30000, body: null, transmission: tx || null, description: desc || null,
  location: "Austin, TX", country: "US", currency: "USD", current_bid: 30000, current_bid_usd: 30000, end_time: new Date(Date.now() + 864e5 * id).toISOString(), photo_url: "https://img.example/" + id + ".jpg", last_seen_at: new Date().toISOString(), first_seen_at: new Date().toISOString() });
const ROWS = [live(1, "2017 Ford Mustang GT 5.0L V8", null, "6-Speed Manual"), live(2, "2017 Ford Mustang V6 Coupe", null, "6-Speed Manual"), live(3, "2017 Ford Mustang Coupe", "A clean example", null), live(4, "2017 Ford Mustang GT", "Coyote V8 with a 5-speed", "Manual (5-speed)")];
globalThis.fetch = async (url) => { const u = new URL(String(url)); return new Response(u.pathname.endsWith("/live_listings") ? JSON.stringify(ROWS) : "[]", { status: 200 }); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const veh = { make: "Ford", model: "Mustang", year: 2017, raw: "2017 Mustang V8" };
const run = async text => { const { filters } = S.parseQuery(text); try { const r = await S.searchLive(env, veh, filters, text, {}); return r.rows || []; } catch (e) { console.log("  searchLive threw: " + e.message); return null; } };
{ const rows = await run("2017 Mustang V8");
  ok("searchLive: a V8 search keeps the listing that says V8 and drops the one that says V6", !!rows && rows.some(x => x.r.id === 1) && !rows.some(x => x.r.id === 2), rows && JSON.stringify(rows.map(x => x.r.id)));
  ok("... and a listing that says nothing about its engine stays, marked engine not stated", !!rows && (rows.find(x => x.r.id === 3) || { unknown: [] }).unknown.includes("engine") && !(rows.find(x => x.r.id === 1) || { unknown: ["engine"] }).unknown.includes("engine")); }
{ const rows = await run("2017 Mustang 5-speed");
  ok("searchLive: a 5-speed search drops the 6-speed listings and keeps the 5-speed one", !!rows && rows.some(x => x.r.id === 4) && !rows.some(x => x.r.id === 1 || x.r.id === 2), rows && JSON.stringify(rows.map(x => x.r.id))); }
// the stored sales read the same words
for (const [w, key] of ENGINE.filter(e => !/speed|spd/.test(e[0]))) ok(`stored sales: typedAttributesIn reads "${w}"`, T.typedAttributesIn("Mustang " + w, mustang).some(a => a.key === key));
console.log(failed ? `\n${failed} FAILED` : "\nengineWordFilterCheck: all pass"); process.exit(failed ? 1 : 0);
