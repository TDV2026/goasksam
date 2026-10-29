// THE NAMED WARM LIST HAS NO COLD SPEC (Sam, Oct 28 2026). scripts/warm-named.json is the list warmed first in every warm run. Offline (prePush): the list is the 19 named specs Sam gave, each once, and the warm
// tooling reads it. Live (`--live`, needs PROBE_KEY and BYPASS_SECRET, run after a deploy and a warm, never inside prePush): every named spec read through the public Market Check path must return warmHit true;
// a cold spec fails the check with its reason.
//   node scripts/namedWarmCheck.mjs [--live]
import fs from "node:fs";
import { spawnSync } from "node:child_process";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const WANT = ["2004 BMW M3", "2001 BMW M3", "1994 Porsche 911 Carrera Cabriolet", "1994 Porsche 911 Carrera", "1989 Porsche 911 Carrera", "2010 Lamborghini Murcielago", "2001 Lamborghini Diablo SE Coupe", "2020 McLaren Speedtail", "1985 Land Rover Defender 110", "1957 Porsche 356 Speedster", "1963 Porsche 356 Carrera", "1971 Mercedes-Benz 280SE 3.5 Cabriolet", "2023 Porsche 911 Carrera", "1999 Porsche 911 Carrera", "1991 Acura NSX", "2005 Ford GT", "1969 Chevrolet Nova", "1972 Chevrolet K5 Blazer", "2023 Mercedes-AMG C63"];
const have = JSON.parse(fs.readFileSync("scripts/warm-named.json", "utf8")).named;
ok(have.length === WANT.length && WANT.every(q => have.includes(q)) && new Set(have).size === have.length, "the named list is exactly Sam's 19 specs, each once (" + have.length + ")");
const tool = fs.readFileSync("scripts/warmNamed.mjs", "utf8");
ok(/warm-named\.json/.test(tool) && /golden-rules\.md/.test(tool) && /buyqueries&product=market_check/.test(tool) && /task=warmHits/.test(tool), "the warm tool warms the named list, the golden table and the Market Check top 50, and confirms each stored row (ops task warmHits)");
ok(/product === "market_check"/.test(fs.readFileSync("api/usageDashboard.js", "utf8")), "the ops log task can read Market Check's own searches");
if (process.argv.includes("--live")) {
  if (!process.env.PROBE_KEY) console.log("SKIP live: no PROBE_KEY in the environment");
  else {
    const r = spawnSync("node", ["scripts/warmNamed.mjs", "--part", "named", "--no-warm", "--live-main"], { encoding: "utf8", env: process.env, timeout: 900000 });
    const out = r.stdout || "";
    const cold = out.split("\n").filter(l => /^COLD/.test(l));
    ok(cold.length === 0 && /\d+ warmHit true, 0 failed/.test(out), "live: every named spec returns warmHit true" + (cold.length ? " (cold: " + cold.map(l => l.replace(/\s+/g, " ").slice(0, 120)).join(" | ") + ")" : ""));
  }
}
console.log(`namedWarmCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
