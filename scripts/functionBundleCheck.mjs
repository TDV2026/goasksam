// clock: real-ok no clocks
// FUNCTION BUNDLE CHECK (Lane B, Nov 9 2026). THE CLASS: a Vercel function ships only the files its entry reaches through literal imports, plus the files vercel.json "includeFiles" copies. A module loaded by a VARIABLE path
// (api/crewPage.js readField(file), api/pullLive.js run(off, mod, fn)) is not traced, and the imports INSIDE a copied file are not traced either. So a reader that is copied in but imports a file nobody copied fails at run time with
// "Cannot find module", and a reader that catches and returns null hides it: the Sell example was empty because lib/sell/sellFacts.js, lib/houseCalendar.js and lib/specPages.js were in no bundle of api/crewPage.js (Market Check's example worked: its files are reached through api/_historyData.js).
// RULE: for every api entry that loads a module by variable path, every file those modules need (their whole import closure) is either reached from the entry by literal imports or matched by that entry's includeFiles.
//   node scripts/functionBundleCheck.mjs [root]     --mutants proves it by breaking each rule in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const muts = [
    ["vercel.json", "lib/live/**,lib/sell", "lib/live/*.json,lib/sell", "(1) lib/live/** no longer copied: the readers are gone"],
    ["vercel.json", ",lib/sell/sellFacts.js,", ",lib/sell/NOTHING.js,", "(2) the Sell example's own file is not copied"],
    ["vercel.json", ",lib/houseCalendar.js,", ",lib/NOTHING.js,", "(3) a file the Sell example needs two imports down is not copied"],
    ["vercel.json", ",lib/specPages.js,", ",lib/NOTHING.js,", "(3) a second file two imports down is not copied"],
    ["lib/live/publicAccess.js", "import { isCrewRequest } from \"../_crew.js\";", "import { isCrewRequest } from \"../_crew.js\";\nimport { nothing } from \"./notThere.js\";", "(4) a public function imports a reader whose own import is a file that does not exist"],
    ["lib/live/marketCheckExamples.js", "import { withClock } from \"./withClock.js\";", "import { withClock } from \"./withClock.js\";\nconst lazy = f => import(f);", "(4) a reader loads a module by a variable path inside the public function's closure"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log("MUTANT NOT APPLIED  " + want); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/functionBundleCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log((killed ? "killed  " : "SURVIVED") + "  " + want); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? "\n" + survivors + " mutant(s) survived" : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log((c ? "PASS" : "FAIL") + "  " + name + (d ? "  " + d : "")); };
const RE = /(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
const read = f => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const norm = (from, rel) => path.normalize(path.join(path.dirname(from), rel));
function closure(roots, via) { const seen = new Map(); const q = roots.map(r => [r, null]); while (q.length) { const [f, p] = q.shift(); if (seen.has(f)) continue; seen.set(f, p); const s = read(f); if (s == null) continue; for (const m of s.matchAll(RE)) { const t = norm(f, m[1]); if (/\.m?js$/.test(t)) q.push([t, f]); } } return seen; }
const walkAll = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === ".git" || e.name === "proofs") continue; const p = path.join(d, e.name); e.isDirectory() ? walkAll(p, out) : out.push(p); } return out; };
const globRe = g => { const parts = []; let i = 0; const toRe = s => s.replace(/[.+^$()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*"); const expand = s => { const m = s.match(/\{([^{}]*)\}/); if (!m) return [s]; return m[1].split(",").flatMap(o => expand(s.replace(m[0], o))); }; return expand(g).map(x => new RegExp("^" + toRe(x) + "$")); };
const vj = JSON.parse(read("vercel.json")), fns = vj.functions || {};
const ALL = walkAll(".").map(f => f.replace(/^\.\//, ""));
// the api entries that load a module by a variable path
const VAR = /import\(\s*[A-Za-z_`$]|\breadField\(|\breadIfBuilt\(/;
const entries = fs.readdirSync("api").filter(f => /\.js$/.test(f)).map(f => "api/" + f).filter(f => VAR.test(read(f) || ""));
ok("the check finds the api entries that load a module by a variable path (crewPage and pullLive at least)", entries.includes("api/crewPage.js") && entries.includes("api/pullLive.js"), entries.join(" "));
for (const e of entries) {
  const src = read(e), conf = fns[e] || {}, inc = typeof conf.includeFiles === "string" ? globRe(conf.includeFiles) : [];
  const copied = ALL.filter(f => inc.some(r => r.test(f)));
  const stat = closure([e]);
  const named = [...src.matchAll(/["'](\.\.\/lib\/[^"']+\.m?js)["']/g)].map(m => norm(e, m[1])).filter(f => !stat.has(f));   // loaded by a variable path
  const roots = [...new Set([...named, ...copied.filter(f => /\.m?js$/.test(f))])];
  if (!roots.length) continue;
  const need = closure(roots), missing = [...need.keys()].filter(f => /\.m?js$/.test(f) && read(f) != null && !stat.has(f) && !copied.includes(f));
  ok(e + ": every file a variable-path module needs is reached by a literal import or copied by includeFiles", missing.length === 0, missing.slice(0, 8).map(f => f + " (needed by " + need.get(f) + ")").join(", "));
}
// ---- PUBLIC FUNCTIONS THAT IMPORT AN EXAMPLE READER (Lane B, Nov 10 2026, PUBLIC_EXAMPLES). A reader served to the public (api/publicExamples.js) is traced by its LITERAL imports, so its bundle holds exactly what those reach: a missing target is "Cannot find module" at run time and a reader that
// catches it answers null, so the section would hide for ever with nothing red; a module loaded by a VARIABLE path inside the closure is not traced at all. RULE: every api entry whose literal imports reach a lib/live example reader has a closure with no unreadable target and no variable-path import
// (unless the entry's includeFiles copies the folder it names).
const READER_RE = /^lib\/live\/(findExamples|featuredHistory|entryExamples|marketCheckExamples|tasksDemo|publicAccess|watchingDemo)\.js$/;
const readerEntries = fs.readdirSync("api").filter(f => /\.js$/.test(f)).map(f => "api/" + f).filter(f => { const src = read(f) || ""; return [...src.matchAll(RE)].some(m => READER_RE.test(norm(f, m[1]))); });
ok("the check finds the api entries whose literal imports reach an example reader (the public endpoint and the featured history route at least)", readerEntries.includes("api/publicExamples.js") && readerEntries.includes("api/featuredHistory.js"), readerEntries.join(" "));
for (const e of readerEntries) {
  const conf = fns[e] || {}, inc = typeof conf.includeFiles === "string" ? globRe(conf.includeFiles) : [], copied = ALL.filter(f => inc.some(r => r.test(f))), cl = closure([e]);
  const unreadable = [...cl.keys()].filter(f => /\.m?js$/.test(f) && read(f) == null).map(f => f + " (imported by " + cl.get(f) + ")");
  const variable = [...cl.keys()].filter(f => /\.m?js$/.test(f) && read(f) != null && /\bimport\(\s*[A-Za-z_`$]/.test(read(f).replace(/^\s*\/\/.*$/gm, "")) && !copied.includes(f) && !/^(api\/(crewPage|pullLive)\.js)$/.test(f)).map(f => f + " (imported by " + cl.get(f) + ")");
  ok(e + ": the closure of its literal imports has no missing file and no variable-path import (so its bundle ships what its readers need)", unreadable.length === 0 && variable.length === 0, [...unreadable, ...variable].slice(0, 6).join(", "));
}
// ---- EVERY PAGE FUNCTION THAT RUNS THE NEW DESIGN (Lane E, Nov 11 2026; the flip's rollback: Find and Market Check showed a visitor NO examples). The new design is built by api/crewPage.js, which loads each example reader by a VARIABLE path (readField, readIfBuilt)
// and so ships them through ITS OWN includeFiles. A public page runs it INSIDE its own function (api/buy.js, api/marketCheck.js, api/home.js ...), reached by a literal import from lib/_newDesign.js, and that function's bundle holds crewPage and its literal imports and NOTHING crewPage's includeFiles copies:
// "Cannot find module lib/live/findExamples.js", caught, null, the section silently left out (public mode hides a failed read). The crew previews ran inside api/crewPage.js itself, where the files are, so no crew check could see it.
// RULE: every api entry whose default export is wrapped by withNewDesign (lib/_newDesign.js) has, reached by literal imports or copied by its own includeFiles, every file api/crewPage.js's bundle gets from its includeFiles (and everything those import).
{
  const crewConf = fns["api/crewPage.js"] || {}, crewCopied = ALL.filter(f => (typeof crewConf.includeFiles === "string" ? globRe(crewConf.includeFiles) : []).some(r => r.test(f)));
  const crewNeed = closure(crewCopied.filter(f => /\.m?js$/.test(f))), crewNeeded = new Set([...crewCopied, ...[...crewNeed.keys()].filter(f => read(f) != null)]);
  const crewStatic = closure(["api/crewPage.js"]);
  const users = fs.readdirSync("api").filter(f => /\.js$/.test(f)).map(f => "api/" + f).filter(f => f !== "api/crewPage.js" && /export default [^\n]*withNewDesign\(/.test(read(f) || "") && closure([f]).has("api/crewPage.js"));   // the entries that SERVE the new design: their default export is wrapped by the door
  ok("the check finds the page functions that serve the new design (Find, Market Check, Sell, Home, Tasks at least)", ["api/buy.js", "api/marketCheck.js", "api/sell.js", "api/home.js", "api/tasksPage.js"].every(f => users.includes(f)), users.join(" "));
  for (const e of users) {
    const conf = fns[e] || {}, copied = ALL.filter(f => (typeof conf.includeFiles === "string" ? globRe(conf.includeFiles) : []).some(r => r.test(f))), have = new Set([...closure([e]).keys(), ...copied]);
    const missing = [...crewNeeded].filter(f => !crewStatic.has(f) && !have.has(f));
    ok(e + ": its bundle holds every file the new design's example readers load by a variable path (reached by a literal import or in its includeFiles)", missing.length === 0, missing.slice(0, 5).join(", ") + (missing.length > 5 ? " and " + (missing.length - 5) + " more" : ""));
  }
}
console.log("\nfunctionBundleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
