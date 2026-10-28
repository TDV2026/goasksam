// e99: the live feed matches the launch scope: no listing from an excluded platform or outside the US and Canada reaches Find, and a card is never an empty Sam box.
//   node scripts/liveScopeCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { SPEC_V } from "../lib/live/search.js";   // the stored core's version comes from the engine, never a number of this file's own
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const live = (id, source, title, location, country, currency) => ({ id, source, source_listing_id: "s" + id, url: "https://x/" + id, listing_title: title, make: "Porsche", model: "911", year: 2005, vin_norm: null, mileage: 50000, body: null, transmission: null, location, country, currency, current_bid: 40000, current_bid_usd: 40000, end_time: new Date(Date.now() + 864e5 * 3).toISOString(), photo_url: "https://x/p.jpg", last_seen: new Date().toISOString(), first_seen: new Date().toISOString(), status: "live" });
const ROWS = [
  live(1, "collectingcars", "2005 Porsche 997 Carrera S", "Presov, Slovakia", null, "EUR"),
  live(2, "collectingcars", "2006 Porsche 997 Carrera 4S", null, "SK", "EUR"),
  live(3, "bonhams", "2004 Porsche 996 Carrera", "London", "GB", "GBP"),
  live(4, "carandclassic", "2003 Porsche 996 Turbo", "Leeds", null, "GBP"),
  live(5, "bringatrailer", "2005 Porsche 911 Carrera S", "Austin, TX", "US", "USD"),
  live(6, "mecum", "2005 Porsche 911 Carrera", null, null, "USD"),
  live(7, "bringatrailer", "2005 Porsche 911 Carrera", "Toronto, Ontario, Canada", null, "CAD"),
  live(8, "hagerty", "2005 Porsche 911 Carrera S", null, null, null),
  live(9, "gooding", "2005 Porsche 911 Carrera", null, null, "USD"),
  live(11, "gooding", "2005 Porsche 911 Carrera S", null, null, null),
  live(10, "collectingcars", "2005 Porsche 911 Carrera S", "Dallas, TX", "US", "USD")
];
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/live_listings")) return new Response(JSON.stringify(ROWS), { status: 200 });
  if (u.pathname.endsWith("/spec_market_cache")) {
    const q = decodeURIComponent(u.search);
    if ((init && init.method) === "POST" || (init && init.method) === "PATCH") return new Response("[]", { status: 201 });
    if (STORED) return new Response(JSON.stringify([{ spec_key: STORED.key, market: STORED.market, computed_at: new Date().toISOString() }]), { status: 200 });
    return new Response("[]", { status: 200 });
  }
  return new Response("[]", { status: 200 });
};
let STORED = null;
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// 1. the feed read: nothing out of scope reaches any caller
const rows = await S.liveRows(env, "id=gt.0");
const ids = rows.map(r => r.id).sort((a, b) => a - b);
ok("the feed read drops the Slovakia car, the other excluded-platform cars and the British cars", [1, 2, 3, 4, 10].every(i => !ids.includes(i)), JSON.stringify(ids));
ok("the US and Canadian cars stay (a US venue with no place stays); a row with no place at all (11) stays in, as before", [5, 6, 7, 8, 9, 11].every(i => ids.includes(i)), JSON.stringify(ids));
ok("the count a header prints is the count of the cards drawn", rows.length === ids.length && rows.length === 6);
ok("isAbroadRow is the same fence", typeof S.liveScopeOf === "function" && S.isAbroadRow(ROWS[0]) && S.isAbroadRow(ROWS[3]) && !S.isAbroadRow(ROWS[4]), "");
ok("an ops read can still see all of them (allScope), for the sweep", (await S.liveRows(env, "id=gt.0", { allScope: true })).length === 11);
// 2. no card whose Sam box is empty: an in-scope car whose stored read holds nothing prints the engine's own line
const lrow = ROWS[4], facts = S.listingFacts(lrow);
const vehicle = { make: "Porsche", model: "911", trim: "Carrera S", year: 2005, bodyStyle: null };
const spec = await S.specOf(env, lrow, facts, vehicle);
STORED = { key: spec.key, market: { v: SPEC_V, engineVersion: E.ENGINE_VERSION, kind: "none", notTrackedLine: null } };
const m = await S.listingMarket(env, lrow, facts, { noBlock: true, notTracked: true, vehicle });
ok("a car with no read prints the engine's own no-sales line, not nothing", m && m.kind === "not_tracked" && /^No sales of an? .+ are on record in the last five years, so there is no range to show\.$/.test(String(m.notTrackedLine)), JSON.stringify(m));
ok("and never the page wording for a failed check", !/could not be checked|Sam could not/i.test(JSON.stringify(m)));
process.exit(failed ? 1 : 0);
