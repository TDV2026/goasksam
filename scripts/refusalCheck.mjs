// REFUSAL CHECK (Lane B, Oct 23 2026, after e80 refused five popular cars on live): the large-pool cars are asked through the page's own
// request (POST /api/sellerDecision, oneBox) and ANY refusal ("Sam could not verify this one") fails. A refusal is never a finished answer:
// it means an output check failed (identity_options_sum_to_pool on the 1969 Camaro, e80). READ ONLY, archive only, zero OldCarsData.
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/refusalCheck.mjs [--base https://goasksam.com] [--cars "a|b"]
// Without PROBE_KEY it SKIPS (the public path is behind the same ceilings). business_limit answers are retried after a pause, then reported
// as UNCHECKED, never as a pass.
import { crewCookie } from "./_crewCookie.mjs";
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
export const LARGE_POOL_CARS = ["1969 Chevrolet Camaro", "1965 Ford Mustang", "1966 Ford Mustang", "1972 Chevrolet Corvette", "1967 Chevrolet Corvette", "1987 Porsche 911 Carrera", "1978 Toyota Land Cruiser", "2002 BMW M3", "1970 Dodge Charger", "1957 Chevrolet Bel Air"];
const CARS = arg("cars") ? arg("cars").split("|").map(s => s.trim()).filter(Boolean) : LARGE_POOL_CARS;
const KEY = process.env.PROBE_KEY || null, BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || null;
if (!KEY) { console.log("refusalCheck: SKIP (no PROBE_KEY in the environment)."); process.exit(0); }
const CREW = await crewCookie();   // the crew cookie exempts the probe from the per-address daily car limit (Keychain, never printed)
const headers = { "content-type": "application/json", ...(CREW ? { cookie: "gas_crew=" + CREW } : {}), "x-ops-key": KEY, "x-launch-stage-test": "2", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) };
const ask = async car => {
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/sellerDecision", { method: "POST", headers, body: JSON.stringify({ oneBox: true, anonId: "ob-refusal-" + Math.random().toString(36).slice(2, 10), car: { raw: car.toLowerCase() }, asked: 0 }), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  return { ms: Date.now() - t0, http: r.status, tier: j.tier, status: j.status, refusal: j.refusal };
};
let failed = 0, unchecked = 0;
for (const car of CARS) {
  let a = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { a = await ask(car); } catch (e) { a = { tier: "error", refusal: { kind: String(e.message || e) } }; }
    if (a.tier !== "business_limit") break;
    await new Promise(r => setTimeout(r, 20000));
  }
  if (a.tier === "business_limit") { unchecked++; console.log(`UNCHECKED  ${car}  (business_limit after 3 tries)`); continue; }
  const bad = a.tier === "refusal" || a.tier === "error" || a.http >= 500;
  if (bad) failed++;
  console.log(`${bad ? "FAIL" : "PASS"}  ${car}  ${a.ms}ms  tier ${a.tier}${a.refusal ? "  " + JSON.stringify(a.refusal).slice(0, 140) : ""}`);
}
console.log(failed ? `refusalCheck: ${failed} car(s) refused or errored.` : `refusalCheck: no refusal on ${CARS.length - unchecked} car(s)${unchecked ? `, ${unchecked} unchecked` : ""}.`);
process.exit(failed ? 1 : 0);
