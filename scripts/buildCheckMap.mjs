// BUILD THE CHECK MAP (Lane C, Nov 17 2026). scripts/checkMap.json says which checks cover which files. This tool writes its first version (and refreshes it) by READING each check: what it imports, and which repo paths
// it names or opens (a quoted path such as "lib/onebox.js", "data/variantFamilies.json", "public/js/onebox.js", a path.join(ROOT, "api", "x.js"), an imp("lib/x.js")). It never guesses from a check's name.
//   node scripts/buildCheckMap.mjs            rewrite scripts/checkMap.json (keeps hand written fields: serial, ignore, engine, notes)
//   node scripts/buildCheckMap.mjs --print    print the summary and the checks that cover nothing, write nothing
// The map is a person's file: edit "serial" (a check that must not run beside others, with the reason), "ignore" (paths that need no check) and "engine" (paths that run the full set); the builder keeps them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, reach } from "./_checkGraph.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP = path.join(ROOT, "scripts", "checkMap.json");
const exists = f => { try { return fs.existsSync(path.join(ROOT, f)); } catch { return false; } };
const isDir = f => { try { return fs.statSync(path.join(ROOT, f)).isDirectory(); } catch { return false; } };

const ENGINE_DEFAULT = ["lib/onebox.js", "lib/vehicle.js", "lib/bareModel.js", "lib/numberPhrases.js", "lib/live/"];
const IGNORE_DEFAULT = ["docs/", "proofs/", "*.md", ".gitignore", "LICENSE", "scripts/checkMap.json"];

// every .mjs/.js file whose name ends in Check, plus the engine checks that predate the naming
export function checkFiles() {
  return fs.readdirSync(path.join(ROOT, "scripts")).filter(f => /Check\.(mjs|js)$/.test(f) && !f.startsWith("_")).sort();
}
const norm = (p, fromDir) => { let x = p.replace(/^file:\/\//, ""); if (x.startsWith(".")) x = path.posix.join(fromDir, x); return path.posix.normalize(x).replace(/^\.\//, ""); };
const PATHLIT = /["'`]((?:\.{1,2}\/)*(?:lib|api|data|public|js|scripts|docs|vercel\.json|package\.json)[^"'`\s${}]*)["'`]/g;
const IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'`](\.{1,2}\/[^"'`]+|(?:lib|api)\/[^"'`]+)["'`]/g;
const SEGS = /path\.join\(\s*[A-Za-z_]+\s*,\s*((?:["'`][^"'`]+["'`]\s*,?\s*)+)\)/g;

export function coversOf(file) {
  const text = fs.readFileSync(path.join(ROOT, "scripts", file), "utf8"), out = new Set(), fromDir = "scripts";
  const add = raw => {
    let x = norm(raw, fromDir).replace(/[?#].*$/, "").replace(/\/$/, ""); if (!x || x.includes("*")) return;
    if (x === `scripts/${file}`) return;
    if (/^docs\//.test(x) && !/\.(sql|json)$/.test(x)) return;   // notes and demo files are not code the check judges
    if (exists(x)) out.add(isDir(x) ? x + "/" : x);
    else if (!path.posix.extname(x) && exists(x + ".js")) out.add(x + ".js");
  };
  for (const m of text.matchAll(IMPORT)) add(m[1]);
  for (const m of text.matchAll(PATHLIT)) add(m[1]);
  for (const m of text.matchAll(SEGS)) { const segs = [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map(s => s[1]); add(segs.join("/")); }
  return [...out].sort();
}
const LIVE_HEADER = /^\/\/ LIVE\b/m;
export function kindOf(file) {
  const text = fs.readFileSync(path.join(ROOT, "scripts", file), "utf8"), head = text.split("\n").slice(0, 6).join("\n");
  if (LIVE_HEADER.test(head)) return "live";                       // Lane F's rule: a script that calls production by default says so on its first line
  if (/live/i.test(file)) return "live";
  if (/security\s+find-generic-password|GAS_CREW_COOKIE|PROBE_KEY/.test(text) && /https:\/\/goasksam\.com|goasksam\.vercel\.app/.test(text) && !/process\.argv\.includes\(["']--live["']\)/.test(text)) return "live";
  return "offline";
}

export function build() {
  let old = {}; try { old = JSON.parse(fs.readFileSync(MAP, "utf8")); } catch { /* first build */ }
  const checks = {};
  for (const f of checkFiles()) {
    const name = f.replace(/\.(mjs|js)$/, ""), prev = (old.checks && old.checks[name]) || {};
    // hand written fields the builder keeps: serial (the reason it cannot run beside others), extra (paths the check opens that its text builds at run time), kind (a hand set kind, with the reason in why)
    const kind = prev.kindFixed || kindOf(f), extra = Array.isArray(prev.extra) ? prev.extra : [];
    checks[name] = { file: "scripts/" + f, kind, ...(prev.kindFixed ? { kindFixed: prev.kindFixed, why: prev.why } : {}), ...(prev.serial ? { serial: prev.serial } : {}), ...(extra.length ? { extra } : {}), covers: [...new Set([...coversOf(f), ...extra])].sort() };
  }
  // the data files the engine modules read are engine files too (a change to one runs the full set)
  const engine = [...new Set([...(old.engine || ENGINE_DEFAULT)])];
  const graph = buildGraph(), eroots = ENGINE_DEFAULT.flatMap(e => e.endsWith("/") ? [...graph.files].filter(f => f.startsWith(e)) : (graph.files.has(e) ? [e] : []));
  const dataRead = new Set(); for (const f of reach(graph, eroots)) for (const d of graph.data.get(f) || []) if (!/^data\/whatsNew/.test(d)) dataRead.add(d);   // the data files any module the engine reaches names
  const engineAll = [...new Set([...engine, ...dataRead])].sort();
  return { _readme: "Which checks cover which files. Built by scripts/buildCheckMap.mjs from what each check imports and names; edit serial, ignore, engine and notes by hand, the builder keeps them. Run: node scripts/runChecks.mjs", engine: engineAll, ignore: old.ignore || IGNORE_DEFAULT, notes: old.notes || {}, checks };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = build(), names = Object.keys(map.checks), by = k => names.filter(n => map.checks[n].kind === k).length;
  const none = names.filter(n => map.checks[n].covers.length === 0);
  console.log(`checkMap: ${names.length} checks (${by("offline")} offline, ${by("live")} live); ${map.engine.length} engine paths; ${none.length} checks name no repo path`);
  if (none.length) console.log("names no path: " + none.join(", "));
  if (!process.argv.includes("--print")) { fs.writeFileSync(MAP, JSON.stringify(map, null, 1) + "\n"); console.log("wrote scripts/checkMap.json"); }
}
