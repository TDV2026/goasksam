// DELTA READ CHECK (Lane B, Oct 23 2026, the 1966 Mustang speed job): no network. A fake PostgREST holds synthetic sales; the five-year
// window read AFTER the two-year window (same request, same diag) reads only the older sales and must return exactly the rows, in exactly
// the order, that a fresh full five-year read returns. Also: a failed delta falls back to the full read; no earlier read = a full read.
import { fetchQualifying } from "../lib/onebox.js";
const DAY = 864e5, now = Date.now(), iso = d => new Date(now - d * DAY).toISOString().slice(0, 10);
const ROWS = [];
for (let i = 0; i < 2600; i++) {   // many sales share a date, so the id tiebreaker matters
  const age = 5 + Math.floor((i * 37) % 1700);
  ROWS.push({ id: "id" + String(i).padStart(5, "0"), source_id: "s" + i, price: 30000 + (i % 40) * 500, auction_end_date: iso(age), source: "bringatrailer", raw_title: `1966 Ford Mustang GT ${i}`, year: 1966, make: "Ford", model: "Mustang", vin_norm: null, image: "https://x/" + i + ".jpg", mileage: "40000", body: null, mods: null, rtitle: `1966 Ford Mustang ${i}`, currency: "USD" });
}
let calls = [], failDelta = false;
globalThis.fetch = async (url, init) => {
  const u = new URL(url); calls.push(u.search);
  const gte = u.searchParams.getAll("sale_date").filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = u.searchParams.getAll("sale_date").filter(v => v.startsWith("lt.")).map(v => v.slice(3));
  if (failDelta && lt.length) return new Response("boom", { status: 500 });
  let rows = ROWS.filter(r => (!gte.length || r.auction_end_date >= gte[0]) && (!lt.length || r.auction_end_date < lt[0]));
  rows = rows.sort((a, b) => a.auction_end_date < b.auction_end_date ? 1 : a.auction_end_date > b.auction_end_date ? -1 : (a.id < b.id ? -1 : 1));
  const [from, to] = String(init.headers.Range).split("-").map(Number);
  const page = rows.slice(from, to + 1).map(r => ({ ...r, auction_end_date: r.auction_end_date, sale_date: r.auction_end_date }));
  return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
};
const env = { supabaseUrl: "http://fake", supabaseKey: "k" };
const spec = { make: "Ford", model: "Mustang", year: 1966, yearMin: 1965, yearMax: 1973, trim: "", excludeVariants: [], subject: "1966 Mustang" };
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
const ids = rs => rs.map(r => r.id || r.source_id).join(",");

const diagA = {}; await fetchQualifying(spec, new Date(now - 730 * DAY).toISOString(), env, diagA);
calls = []; const withDelta = await fetchQualifying(spec, new Date(now - 1826 * DAY).toISOString(), env, diagA);
const deltaCalls = calls.filter(c => /sale_date=lt\./.test(c)).length;
const full = await fetchQualifying(spec, new Date(now - 1826 * DAY).toISOString(), env, {});
ok(deltaCalls > 0 && diagA.deltaReads >= 1, `the five-year read after the two-year read used a delta read (${diagA.deltaReads} delta, ${deltaCalls} request(s) with an upper bound)`);
ok(withDelta.length > 0 && ids(withDelta) === ids(full), `the delta pool equals the fresh full pool, same rows in the same order (${withDelta.length} rows)`);
failDelta = true; const diagB = {}; await fetchQualifying(spec, new Date(now - 730 * DAY).toISOString(), env, diagB);
const fb = await fetchQualifying(spec, new Date(now - 1826 * DAY).toISOString(), env, diagB);
ok(ids(fb) === ids(full) && !diagB.deltaReads, "a failed delta read falls back to the full read and returns the same pool");
failDelta = false; calls = []; const diagC = {}; const lone = await fetchQualifying(spec, new Date(now - 1826 * DAY).toISOString(), env, diagC);
ok(ids(lone) === ids(full) && !calls.some(c => /sale_date=lt\./.test(c)), "with no earlier read in the request, the read is the full read, unchanged");
console.log(failed ? `deltaReadCheck: ${failed} FAILED.` : "deltaReadCheck: all passed.");
process.exit(failed ? 1 : 0);
