// A BROWSER CHECK THAT DRIVES A TASKS OR WATCH CONTROL MUST NOT READ LIVE DATA (Oct 29 2026). standingDrawerCheck went red twice in one day with no code
// change: first the real SL65 listing it opened came inside the toggle's two hours, then the live engine's first card was a different car from the
// fixture's VIN. Both times the page was right and the check read the live engine through a pass-through. The cure is a complete stub of the answer.
// Class: a check that drives data-watch, the before-it-ends switch, a Stop, the limit card or the Tasks page and takes the car, its listings, its end
// times or its counts from the live site changes verdict with the data and the hour. Rules, for every scripts/*.mjs that uses puppeteer and drives one:
//   1. it holds no live credential and makes no call to the site (no crew cookie, probe key, PROBE_KEY, fetch of goasksam.com or SITE; the robots.txt
//      reach test and the protection-bypass header for static assets are allowed: they carry no data)
//   2. it answers every /api/ request itself (a respond for /api/ and no request passed through with headers, the live pass-through form)
//   3. unless its first line says "// LIVE:" (then it is a gap-only script and must not be in scripts/prePush.mjs)
//   node scripts/liveStubCheck.mjs      (offline)
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const dir = new URL(".", import.meta.url), pre = fs.readFileSync(new URL("prePush.mjs", dir), "utf8");
const DRIVES = /data-watch|data-alertsw|mw-stop|limitbox|data-limit|data-stop|data-pause|\.limitbox|data-lk-stop|data-discard|data-limit-keep/;
const CRED = /crewCookie|_crewCookie|goasksam-probe|GAS_CREW_COOKIE|PROBE_KEY|x-ops-key|fetch\(\s*(`|"|')?https:\/\/goasksam\.com(?!\/robots\.txt)|fetch\(\s*(SITE|BASE)\b/;
const PASSES_API_LIVE = /rq\.continue\(\s*\{\s*headers|request\.continue\(\s*\{\s*headers/;
const files = fs.readdirSync(dir).filter(f => /\.mjs$/.test(f) && f !== "liveStubCheck.mjs");
let seen = [];
export function judge(name, s, inPre) {
  const out = [];
  if (!/(from |import\()\s*"puppeteer|node_modules\/puppeteer-core/.test(s) || !DRIVES.test(s)) return null;
  if (/^\s*\/\/\s*LIVE:/.test(s.split("\n")[0]) || /^\s*\/\/\s*LIVE:/m.test(s.split("\n").slice(0, 3).join("\n"))) { if (inPre) out.push(name + ": headed LIVE but run by prePush (a live check is gap-only)"); return out; }
  if (CRED.test(s)) out.push(name + ": drives a Tasks or watch control and holds a live credential or calls the site");
  if (PASSES_API_LIVE.test(s)) out.push(name + ": passes a request to the live site with its headers (the live pass-through form)");
  if (!/\/api/.test(s) || !/respond\(/.test(s)) out.push(name + ": does not answer /api/ requests itself");
  return out;
}
for (const f of files) {
  const r = judge(f, fs.readFileSync(new URL(f, dir), "utf8"), pre.includes("scripts/" + f));
  if (r === null) continue; seen.push(f);
  ok(r.length === 0, r.join("; ") || f);
}
ok(seen.length >= 3, "the sweep finds the browser checks that drive Tasks or watch controls (" + seen.join(", ") + ")");
// the rules catch the live form: the version of standingDrawerCheck that read the engine through a pass-through
const live = 'import puppeteer from "puppeteer-core"; import { crewCookie } from "./_crewCookie.mjs"; const x = ".mcdrawer [data-watch]";\nrq.respond({}); /api/ rq.continue({ headers: h });';
ok(judge("live.mjs", live, false).length >= 2, "the rules fail on a check that reads the live engine through a pass-through");
ok(judge("live.mjs", "// LIVE: calls production\n" + live, true).length === 1, "a LIVE-headed script run by prePush fails");
console.log(`liveStubCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
