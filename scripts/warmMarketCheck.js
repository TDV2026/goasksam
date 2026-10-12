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
import { runOneBox } from "../lib/onebox.js";
import { warmAnswerKeyFor, writeWarmAnswer } from "../lib/live/search.js";
import { supabaseEnv } from "../lib/_supabase.js";

// The 15-nameplate list this round measures before/after against. 5 are the SAME cars last
// round's measurement named individually in docs/lane-notes.md (1991 BMW M3, 1969 Chevrolet
// Camaro, 1973 Volkswagen Beetle, 1995 Porsche 911 Carrera, 1967 Ford Mustang Fastback) - the
// other 10 are NOT the original list verbatim (that list was never saved as a file, only these 5
// were named individually in the report) - they are reconstructed, similarly-shaped bare
// nameplates (dense collector models, no trim), chosen to exercise the same "large raw pool
// paged before fencing" cost class. Documented here, not hidden, per the explicit ask to say so.
export const WARM_LIST = [
  "1991 BMW M3", "1969 Chevrolet Camaro", "1973 Volkswagen Beetle", "1995 Porsche 911 Carrera",
  "1967 Ford Mustang Fastback",
  "1970 Chevrolet Chevelle", "1965 Ford Mustang", "2008 Porsche 911", "1990 Chevrolet Corvette",
  "1968 Chevrolet Camaro", "1973 Porsche 911", "1966 Ford Mustang", "1972 Datsun 240Z",
  "1957 Chevrolet Bel Air", "1985 Porsche 911"
];

export async function warmMarketCheck(env, list = WARM_LIST) {
  const out = { warmed: 0, failed: 0, rows: [] };
  for (const q of list) {
    const row = { q };
    try {
      const rv = await resolveVehicle(q, {});
      const vehicle = rv && rv.vehicle;
      if (!vehicle || !vehicle.make) throw new Error("unresolved");
      if (vehicle.trim) throw new Error(`not a bare nameplate (resolved trim: ${vehicle.trim})`);
      const generation = await findGeneration(vehicle, env).catch(() => null);
      const t0 = Date.now();
      const d = await runOneBox(vehicle, generation, q, env, null);
      row.ms = Date.now() - t0;
      if (!d || !d.tier) throw new Error("engine returned no tier");
      row.tier = d.tier;
      const key = warmAnswerKeyFor(vehicle, generation);
      await writeWarmAnswer(env, key, d);
      row.key = key;
      out.warmed++;
    } catch (e) { row.error = String(e && e.message || e); out.failed++; }
    out.rows.push(row);
  }
  return out;
}

if (process.argv[1] && /warmMarketCheck\.js$/.test(process.argv[1])) {
  const env = supabaseEnv();
  if (!env) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"); process.exit(1); }
  const listArg = process.argv.find(a => a.startsWith("--list="));
  const list = listArg ? listArg.slice(7).split("|").filter(Boolean) : WARM_LIST;
  const result = await warmMarketCheck(env, list);
  for (const r of result.rows) console.log(r.error ? `FAIL  ${r.q}: ${r.error}` : `OK    ${r.q}  tier=${r.tier}  ${r.ms}ms`);
  console.log(`\nDONE. warmed=${result.warmed} failed=${result.failed} of ${list.length}.`);
  process.exit(result.failed > 0 ? 1 : 0);
}
