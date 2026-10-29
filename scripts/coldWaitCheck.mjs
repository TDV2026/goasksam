// A MARKET CHECK ON THE COLD PATH NEVER ENDS "STILL READING" WITH NO ANSWER FOLLOWING (Lane B, Oct 29 2026). A spec with no stored answer is computed behind the first response and
// kept alive by the platform until the function's maxDuration (vercel.json); the page asks again every 2 seconds for the engine's waitMaxMs. If the page gives up before the compute
// can land (it was 45 s against a 90 s function), the visitor sees the could-not line while the answer is stored a few seconds later. This check holds, from the files:
//   1. the wait the engine sends reaches the end of the compute's life (maxDuration less five seconds), and the marker row outlives it;
//   2. every server literal for it is the one constant;
//   3. the page's own loop (public/js/onebox.js obAskUntilRead, run here on a fake clock) draws an answer that lands at 20, 60 and 80 seconds instead of the could-not line,
//      and gives the could-not line only past the wait, when nothing ever lands;
//   4. an ask while the compute runs writes no failed search_run row (one cold search used to write one row per ask, up to 22), so "still reading" rows count searches.
//   node scripts/coldWaitCheck.mjs
import fs from "node:fs";
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
let fail = 0, pass = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const rd = f => fs.readFileSync(f, "utf8");
const sd = rd("api/sellerDecision.js"), vj = rd("vercel.json"), pg = rd("public/js/onebox.js"), ls = rd("lib/live/search.js");
const maxDur = Number((/"api\/sellerDecision\.js": \{\s*"maxDuration": (\d+)/.exec(vj) || [])[1]) * 1000;
const COMPUTING_MS = Number((/export const COMPUTING_MS = ([\d.e]+)/.exec(ls) || [])[1]);
let mod = null; try { mod = await import("../api/sellerDecision.js"); } catch (e) { console.log("import: " + String(e && e.message).slice(0, 120)); }
const wait = mod && mod.COLD_WAIT_MS, payload = mod && typeof mod.computingAnswer === "function" ? mod.computingAnswer({ year: 1996, make: "Porsche", model: "911" }) : null;
// 1
ok(Number.isFinite(maxDur) && wait >= maxDur - 5000, `the wait the engine sends (${wait}) reaches the end of the compute's life (function maxDuration ${maxDur} less 5000)`);
ok(Number.isFinite(COMPUTING_MS) && COMPUTING_MS > wait, "the computing marker (" + COMPUTING_MS + ") outlives the wait, so asks never start a second compute while the first can still land");
ok(payload && payload.waitMaxMs === wait && payload.computing === true && payload.retryAfterMs === 2000, "the computing answer carries the one wait constant");
// 2
ok(!/waitMaxMs: \d/.test(sd) && !/waitMaxMs: \d/.test(ls), "no engine literal for waitMaxMs (they all read COLD_WAIT_MS)");
{ const lm = await import("../lib/live/search.js").catch(() => null), pm = lm && lm.stillReadingMarket ? lm.stillReadingMarket() : null;
  ok(pm && pm.waitMaxMs === wait && lm.COLD_WAIT_MS === wait, "the Find and Tasks pending market carries the same wait (stillReadingMarket)");
  ok(/waitMaxMs: Number\.isFinite\(d\.waitMaxMs\)/.test(rd("api/partnerAnswer.js")), "the partner answer passes the engine's waitMaxMs through"); }
// 3 the page loop on a fake clock
{
  const m = /function obAskUntilRead\(payload, t0, onComputing\) \{[\s\S]*?\n  \}\n/.exec(pg);
  ok(!!m, "the page's obAskUntilRead is found");
  if (m && payload) {
    const run = async landAtMs => {
      let now = 1e9; const t0 = now;
      const win = { GAS_WAIT_SCALE: 1 };
      const obFetch = () => Promise.resolve({ json: () => Promise.resolve(now - t0 >= landAtMs ? { status: "one_box", tier: "result", cluster: { low: 1, high: 2 } } : payload) });
      const fn = new Function("window", "obFetch", "API_ORIGIN", "Date", "setTimeout", m[0] + "\nreturn obAskUntilRead;")(win, obFetch, "", { now: () => now }, (f, ms) => { now += ms; Promise.resolve().then(f); });
      return fn({}, t0, () => {});
    };
    for (const at of [20000, 60000, 80000]) { const r = await run(at); ok(r && r.tier === "result", `an answer stored at ${at / 1000} s is drawn, not the could-not line`); }
    const never = await run(1e12); ok(never && never.couldNot === true, "an answer that never lands ends in the could-not line, once, past the wait");
  }
}
// 4
{
  const i = sd.indexOf("await readComputing({ supabaseUrl, supabaseKey }, warmKey)"); const branch = i < 0 ? "" : sd.slice(i, i + 700);
  ok(i > 0 && /computingAnswer\(vehicle\)/.test(branch) && !/mcRun\(/.test(branch.split("computingAnswer(vehicle)")[0]), "an ask while the compute runs writes no failed search_run row");
}
console.log(fail ? `coldWaitCheck: ${fail} failure(s)` : `coldWaitCheck: ${pass} checks pass`);
process.exit(fail ? 1 : 0);
