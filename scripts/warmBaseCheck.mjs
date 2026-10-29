// No warm script targets goasksam.com by default (Sam, Oct 28 2026). Cause: the warm scripts defaulted to the live site, so a push to main during a warm swapped the code under it.
// Class: every warm path (warmNamed, warmUnion, postDeployWarm, launchWarm.sh) must take a pinned deployment address (--base or WARM_BASE) and refuse to start without one unless --live-main is given.
// Static: the live address appears in each node script only on its one --live-main line (and comments), never as a fallback; launchWarm.sh has no literal live address at all.
// Behavioural (no network: PROBE_KEY is unset): each node script run with no address exits 2 and says no address was given.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const LIVE = "https://goasksam.com";
for (const f of ["warmNamed", "warmUnion", "postDeployWarm"]) {
  const src = fs.readFileSync(`scripts/${f}.mjs`, "utf8");
  const lines = src.split("\n").filter(l => l.includes(LIVE) && !/^\s*\/\//.test(l));
  ok(lines.every(l => /--live-main/.test(l)), `${f}: the live address appears only on the --live-main line (found ${lines.length} code line${lines.length === 1 ? "" : "s"})`);
  ok(!/arg\("base"\)\s*\|\|\s*"https:/.test(src) && !/arg\("base",\s*"https:/.test(src), `${f}: no fallback to a literal address behind --base`);
  const env = { ...process.env }; delete env.PROBE_KEY; delete env.WARM_BASE; delete env.BYPASS_SECRET;
  const r = spawnSync("node", [`scripts/${f}.mjs`], { encoding: "utf8", env, timeout: 20000 });
  ok(r.status === 2 && /no address given/.test(r.stdout || ""), `${f}: with no address it exits 2 and says no address was given (exit ${r.status})`);
}
const sh = fs.readFileSync("scripts/launchWarm.sh", "utf8");
ok(!sh.includes("goasksam.com"), "launchWarm.sh holds no literal live address");
ok(/\[ -n "\$WARM_BASE" \]/.test(sh) && /\$WARM_BASE\/api\//.test(sh), "launchWarm.sh needs WARM_BASE and sends every ops call to it");
console.log(`warmBaseCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
