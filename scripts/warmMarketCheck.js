#!/usr/bin/env node
// Market Check bare-nameplate warm cache (Round 5 Job 3, Oct 2026). Precomputes the live engine's
// answer for a curated list of bare (year+make+model, no trim) nameplates and writes it into
// spec_market_cache under lib/live/search.js's warmAnswerKeyFor namespace ("MCWARM:" + the shared
// specKeyFor) - the SAME table Buy/Tasks already read, a distinct key so this never collides with
// or changes their own rows. api/sellerDecision.js's oneBox branch reads this cache first for a
// bare-nameplate query and falls through to its always-fresh call on any miss; see that file's
// "WARM-LIST FAST PATH" comment.
//
// WHY NOT scripts/warm-list.json: that file is make/model pairs with no year (used by
// scripts/warm.js, a different mechanism warming the OLD market_fetch_cache via a live /sell
// request - itself disabled by default since the Oct 2026 WARM_OCD cost-hardening change). A bare
// nameplate needs a SPECIFIC YEAR to be a concrete, cacheable spec, so this file carries its own
// curated list instead of forcing warm-list.json's shape to do double duty. Archive-only, zero
// OldCarsData spend - runOneBox reads sales_archive, never OCD.
//
//   node scripts/warmMarketCheck.js [--list=a|b]   warm the built-in list (or a custom pipe list)
import { resolveVehicle } from "../lib/vehicle.js";
import { findGeneration } from "../lib/generations.js";
import { oneEngineAnswer } from "../lib/onebox.js";
import { warmSellBlock } from "../lib/sell/sellBlock.js";
import { warmAnswerKeyFor, storeWarmResult } from "../lib/live/search.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { runAsCaller } from "../lib/_caller.js";

// The 15-nameplate list this round measures before/after against. 5 are the SAME cars last
// round's measurement named individually in docs/lane-notes.md (1991 BMW M3, 1969 Chevrolet
// Camaro, 1973 Volkswagen Beetle, 1995 Porsche 911 Carrera, 1967 Ford Mustang Fastback) - the
// other 10 are NOT the original list verbatim (that list was never saved as a file, only these 5
// were named individually in the report) - they are reconstructed, similarly-shaped bare
// nameplates (dense collector models, no trim), chosen to exercise the same "large raw pool
// paged before fencing" cost class. Documented here, not hidden, per the explicit ask to say so.
export const WARM_LIST = [
  "1991 BMW M3", "1969 Chevrolet Camaro", "1973 Volkswagen Beetle",
  "1970 Chevrolet Chevelle", "1965 Ford Mustang", "2008 Porsche 911", "1990 Chevrolet Corvette",
  "1968 Chevrolet Camaro", "1973 Porsche 911", "1966 Ford Mustang", "1972 Datsun 240Z",
  "1957 Chevrolet Bel Air", "1985 Porsche 911",
  // BIG POOLS (Sam, Oct 25 2026): every family whose cold read pulls more than 3,000 rows (measured over 243 specs, 12 over the
  // line in 7 families). A stored answer is per spec (year, trim, body), so each family carries its popular years, not one car.
  // 996 911 1999 to 2004 (5,687 rows), 997 911 2005 to 2011 (7,265; 2008 is above), SL R107 1972 to 1989 (4,781), Corvette C3
  // 1968 to 1982 (4,147), Camaro 1967 to 1969 (4,074; 1968 and 1969 are above), SL R230 2001 to 2005 (3,783), Bronco 1966 to 1977 (3,346).
  "1999 Porsche 911", "2001 Porsche 911", "2003 Porsche 911",
  "2006 Porsche 911", "2010 Porsche 911",
  "1972 Mercedes-Benz SL-Class", "1980 Mercedes-Benz SL-Class", "1985 Mercedes-Benz SL-Class",
  "1972 Chevrolet Corvette", "1975 Chevrolet Corvette", "1979 Chevrolet Corvette",
  "1967 Chevrolet Camaro",
  "2003 Mercedes-Benz SL", "2004 Mercedes-Benz SL-Class",
  "1970 Ford Bronco", "1974 Ford Bronco"
];

export async function warmMarketCheck(env, list = WARM_LIST) {
  const out = { warmed: 0, refused: 0, failed: 0, rows: [] };
  for (const q of list) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {});
      const vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      // A name that resolves to a trim is not a bare nameplate: the warm correctly declines it (the engine answers it as a trim car, not a nameplate). That is a pass, counted apart.
      if (vehicle.trim) { row.refused = `not a bare nameplate (resolved trim: ${vehicle.trim})`; out.refused++; out.rows.push(row); continue; }
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const t0 = Date.now();
      let d = (await oneEngineAnswer(vehicle, generation, q, { ...env, asked: 0 }, null)).raw;   // the whole engine path a visitor's read takes: the stored row carries every e96 field
      row.ms = Date.now() - t0;
      if (!d || !d.tier) throw new Error("engine returned no tier");
      row.tier = d.tier;
      const key = warmAnswerKeyFor(vehicle, generation);
      { const sw = await storeWarmResult(env, key, d); row.stored = sw.stored; if (!sw.stored) row.notStored = sw.why; }
      row.key = key;
      if (/^(result|thin|refusal|not_tracked)$/.test(String(d.tier))) { const sb = await warmSellBlock(env, q, d, key); row.sellBlock = sb.stored ? "stored" : sb.why; }   // the car-only Sell block beside it
      out.warmed++;
    } catch (e) { row.error = String(e && e.message || e); out.failed++; }
    out.rows.push(row);
  }
  return out;
}

// --verify=FILE (the nightly's last warm step): reads the log the warm step wrote and fails LOUDLY unless it ended with a DONE line whose warmed plus refused is the whole list.
// A step the runner killed at its timeout writes no DONE line, and a partial list is a stale tail: both end red here, never read as success.
export function verifyWarmLog(text, listLength) {
  const m = String(text || "").match(/DONE\. warmed=(\d+) refused=(\d+) failed=(\d+) of (\d+)\./);
  if (!m) return { ok: false, why: "no DONE line: the warm step did not finish (killed at its timeout, or it died)" };
  const warmed = +m[1], refused = +m[2], failed = +m[3], of = +m[4];
  if (of !== listLength) return { ok: false, why: `the warm ran a list of ${of}, the built-in list is ${listLength}` };
  if (warmed + refused < listLength) return { ok: false, why: `warmed ${warmed} plus refused ${refused} is ${warmed + refused}, below the list length ${listLength} (${failed} failed)` };
  return { ok: true, warmed, refused, failed, of };
}
const verifyArg = process.argv.find(a => a.startsWith("--verify="));
if (verifyArg && process.argv[1] && /warmMarketCheck\.js$/.test(process.argv[1])) {
  const fsm = await import("node:fs"); let text = ""; try { text = fsm.readFileSync(verifyArg.slice(9), "utf8"); } catch {}
  const v = verifyWarmLog(text, WARM_LIST.length);
  if (!v.ok) { console.error(`::error::Market Check warm cache: ${v.why}. Stored rows from the head of the list are warm, the rest are not on the current stamp.`); process.exit(1); }
  console.log(`Market Check warm cache: warmed=${v.warmed} refused=${v.refused} failed=${v.failed} of ${v.of}.`); process.exit(0);
}

if (!verifyArg && process.argv[1] && /warmMarketCheck\.js$/.test(process.argv[1])) {
  const env = supabaseEnv();
  if (!env) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
  const listArg = process.argv.find(a => a.startsWith("--list="));
  const list = listArg ? listArg.slice(7).split("|").filter(Boolean) : WARM_LIST;
  const result = await runAsCaller("warm", () => warmMarketCheck(env, list));   // caller attribution (lane-b-archiveread step e)
  for (const r of result.rows) console.log(r.error ? `FAIL  ${r.q}: ${r.error}` : r.refused ? `OK    ${r.q}  refused: ${r.refused}` : `OK    ${r.q}  tier=${r.tier}  ${r.ms}ms`);
  console.log(`\nDONE. warmed=${result.warmed} refused=${result.refused} failed=${result.failed} of ${list.length}.`);
  process.exit(result.failed > 0 || result.warmed + result.refused < list.length ? 1 : 0);
}
