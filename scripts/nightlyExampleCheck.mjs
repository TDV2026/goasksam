// A NIGHTLY CACHE BUILDER SURVIVES EVERY SHAPE OF ENGINE ANSWER, AND THE WARM JOBS DO NOT WAIT FOR IT (Lane B, Nov 2 2026; Nightly ingest and warm #128, step "Build Market Check landing example": "TypeError: Cannot read properties of null (reading '0')" at
// scripts/buildMarketCheckExample.js:25).
// CAUSE: the 2008 Porsche 997 Carrera S answers apart since e96 (Coupe and Cabriolet price apart, cluster null). lib/live/marketCheckExample.js stores that answer as it is (cluster null, the options), but the script's final log line read d.cluster[0]
// and d.cluster[1], so the build crashed AFTER the example was stored. Cosmetic, but it ended the caches job red with a stack trace instead of the plain "Fail the job if ..." line, and hid whether the example was built.
// FIX: the log line is built by rangeWords/salesWords (lib/live/exampleAnswer.js) from the stored fields only: a range when there is one, each option's own range when the engine answers apart, the engine's lines otherwise, never a figure of its own.
// WORKFLOW: warm, attempts, premium and cube `needs: ingest`, not caches (.github/workflows/nightly.yml); the caches job's builders are continue-on-error with a closing "Fail the job if ..." step, so a failed example ends the run red and blocks nothing.
// This check runs the REAL builder scripts with the example stubbed to an alike, a split, an apart, a thin, a no-range and a malformed answer, and holds the workflow to the shape above.   node scripts/nightlyExampleCheck.mjs [repo root]
import fs from "node:fs"; import os from "node:os";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const rd = f => fs.readFileSync(path.join(root, f), "utf8");
const cards = [{ price: 60000, title: "a" }, { price: 52000, title: "b" }];
const ANSWERS = {
  alike: { name: "2008 Porsche 997 Carrera S", cluster: [61000, 82000], cards, options: null },
  split: { name: "2008 Porsche 997 Carrera S", cluster: null, optionsState: "split", options: [{ label: "Coupe", low: 61000, high: 82000, n: 11 }, { label: "Cabriolet", low: 52000, high: 70000, n: 8 }], cards },
  apart: { name: "2008 Porsche 997 Carrera S", cluster: null, optionsState: "apart", pooledApart: true, options: [{ label: "Coupe", low: 61000, high: 82000, n: 11 }, { label: "Cabriolet", low: 52000, high: 70000, n: 8 }], cards },
  "apart, lines only": { name: "2008 Porsche 997 Carrera S", cluster: null, optionsState: "apart", optionLines: ["Coupe $61,000 to $82,000, 11 sales"], cards },
  thin: { name: "2008 Porsche 997 Carrera S", cluster: null, tier: "result", cards: [] },
  "no range, no cards field": { name: "2008 Porsche 997 Carrera S" },
  "malformed": { name: "x", cluster: "none", options: [null, 3, { label: "Coupe" }], optionLines: [5], cards: null }
};
// a loader hook that replaces the example module with the stubbed answer, so the REAL script's own lines run
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nightlychk-"));
const hook = path.join(dir, "hook.mjs"), reg = path.join(dir, "reg.mjs");
fs.writeFileSync(hook, `export async function resolve(s, c, n) { if (/lib\\/live\\/(marketCheckExample|buyExample|deskExample|sellExample)\\.js$/.test(s)) return { url: "data:text/javascript," + encodeURIComponent("const A = JSON.parse(process.env.STUB_ANSWER); export const marketCheckExample = async () => A; export const deskExample = async () => A; export const sellExample = async () => A; export default A;"), shortCircuit: true }; return n(s, c); }\n`);
fs.writeFileSync(reg, `import { register } from "node:module"; register(${JSON.stringify(pathToFileURL(hook).href)}, import.meta.url);\n`);
const runScript = (file, answer) => spawnSync(process.execPath, ["--import", pathToFileURL(reg).href, path.join(root, file)], { cwd: root, encoding: "utf8", timeout: 60000, env: { ...process.env, SUPABASE_URL: "https://fake.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "k", STUB_ANSWER: JSON.stringify(answer) } });
for (const [name, a] of Object.entries(ANSWERS)) {
  const r = runScript("scripts/buildMarketCheckExample.js", a), out = (r.stdout || "") + (r.stderr || "");
  ok(`Market Check example builder, ${name} answer: exits 0, no TypeError`, r.status === 0 && !/TypeError|Cannot read properties/.test(out), `exit ${r.status} ${out.split("\n").find(l => /Error/.test(l)) || ""}`.trim());
  ok(`Market Check example builder, ${name} answer: prints its one DONE line`, /built in \d+s: .*DONE\./.test(out));
  if (name === "apart") ok("Market Check example builder, apart: names each option's own range from the engine, never a pooled figure", /Coupe 61000-82000, Cabriolet 52000-70000/.test(out) && !/range \d/.test(out), out.split("\n").find(l => /built in/.test(l)));
  if (name === "alike") ok("Market Check example builder, alike: still prints the range", /range 61000-82000/.test(out));
}
{ const r = runScript("scripts/buildMarketCheckExample.js", null), out = (r.stdout || "") + (r.stderr || ""); ok("Market Check example builder, a build that did not qualify (null): a warning and exit 0", r.status === 0 && /::warning::/.test(out)); }
// the other two example builders, on the shapes their stubs can take
{ const d = { gens: [{ code: "997", soldCount: 31, cluster: null }, { code: "991", soldCount: 12 }], totalSoldCount: 43 }; const r = runScript("scripts/buildDeskExample.js", d); ok("Sam Desk example builder, a generation with no cluster: exits 0", r.status === 0 && /DONE\./.test(r.stdout || ""), (r.stderr || "").split("\n")[0]); }
{ const r = runScript("scripts/buildDeskExample.js", { totalSoldCount: 0 }); ok("Sam Desk example builder, no generations field: exits 0", r.status === 0, (r.stderr || "").split("\n")[0]); }
{ const r = runScript("scripts/buildSellExample.js", { example: { car: "2008 Porsche 911", platform: null } }); ok("Sell example builder, an example with no platform or tiles: exits 0", r.status === 0, (r.stderr || r.stdout || "").split("\n")[0]); }
// no builder or warm script reads a single range off an answer without a guard
{ const files = fs.readdirSync(path.join(root, "scripts")).filter(f => /^(build|warm|postDeploy|recompute|refresh)[A-Za-z]*\.(m?js)$/.test(f));
  const bad = []; for (const f of files) rd("scripts/" + f).split("\n").forEach((l, i) => { if (/\b(?:d|answer|ans|r|res|out|ex|data)\.cluster\[\d\]/.test(l) && !/\?\s*\w+\.cluster\[|Array\.isArray\([^)]*cluster|\.cluster\s*\?|&&/.test(l)) bad.push(`${f}:${i + 1}`); });
  ok(`no unguarded .cluster[n] in the ${files.length} build and warm scripts`, bad.length === 0, bad.join(", ")); }
// the workflow
for (const f of [".github/workflows/nightly.yml", "docs/nightly-workflow.yml"]) {
  const y = rd(f), jobs = {}; let cur = null;
  for (const l of y.split("\n")) { const m = /^  ([a-z]+):\s*$/.exec(l); if (m) { cur = m[1]; jobs[cur] = { needs: null, body: "" }; continue; } if (cur) { jobs[cur].body += l + "\n"; const n = /^    needs:\s*(.+?)\s*$/.exec(l); if (n) jobs[cur].needs = n[1]; } }
  for (const j of ["warm", "attempts", "premium", "cube"]) ok(`${f}: ${j} needs ingest only, so a red caches job never skips it`, jobs[j] && /^\[?\s*ingest\s*\]?$/.test(jobs[j].needs || ""), jobs[j] && jobs[j].needs);
  const c = jobs.caches ? jobs.caches.body : "";
  ok(`${f}: the Market Check example step is continue-on-error and a closing step ends the run red when it fails`, /id: marketcheckexample[\s\S]{0,300}continue-on-error: true/.test(c) && /if: steps\.marketcheckexample\.outcome == 'failure'[\s\S]{0,400}exit 1/.test(c));
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `nightlyExampleCheck: ${fail} failure(s)` : "nightlyExampleCheck: all pass");
process.exit(fail ? 1 : 0);
