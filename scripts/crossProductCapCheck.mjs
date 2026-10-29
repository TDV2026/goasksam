// e100: crossProductCheck can never run past its cap, never walks every spec in one night, and says what it read and skipped.
// Cause (run 127, Oct 28): the check walked all 88 specs, each a cold engine read, for 35 minutes and was cancelled with the whole job at the 80 minute limit.
//   node scripts/crossProductCapCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const X = await import(pathToFileURL(path.join(root, "scripts/crossProductCheck.js")).href);
ok("the check exports its sample and its cap settings", typeof X.sampleSpecs === "function" && typeof X.capSettings === "function");
if (typeof X.sampleSpecs === "function") {
  const all = X.DEFAULT_SPECS, a = X.sampleSpecs(all, 12, 100);
  ok("a night reads 12 of the specs, not all", a.picked.length === 12 && a.skipped.length === all.length - 12, `${a.picked.length} picked of ${all.length}`);
  const seen = new Set(); for (let d = 0; d < Math.ceil(all.length / 12); d++) X.sampleSpecs(all, 12, d).picked.forEach(x => seen.add(x));
  ok("the window moves, so every spec is read within a week or so", seen.size === all.length, `${seen.size} of ${all.length} in ${Math.ceil(all.length / 12)} nights`);
  ok("default caps: 8 minutes, 12 specs, hard stop 3 minutes after", X.capSettings({}).minutes === 8 && X.capSettings({}).maxSpecs === 12 && X.capSettings({}).hardMs === 11 * 60e3);
  ok("CROSS_MAX_SPECS=all reads every spec", X.capSettings({ CROSS_MAX_SPECS: "all" }).maxSpecs === 0);
}
// the real script, a cap of 3 seconds, a database that does not answer: it ends inside a minute and says what it read and skipped
const t0 = Date.now();
const r = spawnSync("node", [path.join(root, "scripts/crossProductCheck.js")], { cwd: root, env: { ...process.env, SUPABASE_URL: "https://fake.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "k", CROSS_MAX_MINUTES: "0.05", CROSS_MAX_SPECS: "all", LAUNCH_STAGE: "2" }, encoding: "utf8", timeout: 90000 });
const out = String(r.stdout || "") + String(r.stderr || ""), took = Date.now() - t0;
ok("the script ends by itself well inside the job's time", !r.error && took < 80000, `${Math.round(took / 1000)} s${r.error ? " " + r.error.code : ""}`);
ok("it reports how many specs it read and how many it skipped", /CAP: (read \d+ of \d+ specs|hard stop)/.test(out), (out.match(/CAP:[^\n]*/) || ["no CAP line"])[0].slice(0, 200));
ok("it skipped specs at the cap rather than walking all of them", /read (\d+) of (\d+) specs/.test(out) && Number(/read (\d+) of (\d+)/.exec(out)[1]) < Number(/read (\d+) of (\d+)/.exec(out)[2]), (out.match(/CAP:[^\n]*/) || [""])[0].slice(0, 160));
process.exit(fail ? 1 : 0);
