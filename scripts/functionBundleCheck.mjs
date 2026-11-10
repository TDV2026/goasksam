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
    ["vercel.json", ",lib/specPages.js,", ",lib/NOTHING.js,", "(3) a second file two imports down is not copied"]
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
console.log("\nfunctionBundleCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
