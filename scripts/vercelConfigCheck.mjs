// vercelConfigCheck (Lane E, Nov 11 2026): VERCEL MUST ACCEPT vercel.json, checked the way Vercel reads it, before a push.
// CAUSE: two deploys in a row ended in Error on a vercel.json that parses: functions.*.includeFiles over 256 characters (976ce753: api/sell.js 300, api/whatsNew.js and api/marketCheck.js 273), then ignoreCommand over 256 (f79db262: 270). Vercel validates the file against its own JSON schema (https://openapi.vercel.sh/vercel.json) and refuses all of it on the first broken
// field; nothing in the repo read the file that way, so each error showed only on the deploy. AFFECTS: every field of vercel.json the schema limits, not only the two that broke: ignoreCommand, buildCommand, installCommand, outputDirectory, devCommand, every functions includeFiles / excludeFiles / installCommand / maxDuration / memory, crons, rewrites, redirects, headers, regions and the rest.
// THIRD ERROR (1f383aa3): ignoreCommand called scripts/vercelIgnore.sh, and .vercelignore removes scripts/** from the upload, so the command could not run in the remote build. THE RULE added: every file a buildCommand, installCommand, devCommand or ignoreCommand names must exist and must SURVIVE .vercelignore (read the way gitignore reads it; the same ref as vercel.json under --ref).
// THE CLASS: a vercel.json Vercel refuses. THE CHECK: (1) the file parses; (2) the named strings Vercel limits to 256 characters, each by name, so the message names the field; (3) the WHOLE file validated against Vercel's schema (docs/vercel-json-schema.json, the published schema with its prose removed; scripts/_jsonSchema.mjs is the validator): every length, count, range, pattern, enum and unknown property; (4) every functions key is an api file that exists; (5) the ignoreCommand's script exists. A margin note at 240 characters.
//   node scripts/vercelConfigCheck.mjs [--ref <git ref>]     the working tree's vercel.json, or the one at a commit (to show it fails on a bad one)
//   node scripts/vercelConfigCheck.mjs --refresh             fetch Vercel's current schema into docs/vercel-json-schema.json (needs the network; run it now and then)
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : null, SCHEMA_FILE = path.join(ROOT, "docs/vercel-json-schema.json");
if (args.includes("--refresh")) {
  const r = await fetch("https://openapi.vercel.sh/vercel.json"); if (!r.ok) { console.log("REFUSED the schema answered " + r.status); process.exit(1); }
  const s = await r.json(), clean = n => Array.isArray(n) ? n.map(clean) : n && typeof n === "object" ? Object.fromEntries(Object.entries(n).filter(([k, v]) => !(["description", "example", "examples", "title", "deprecated", "default"].includes(k) && (v === null || typeof v !== "object"))).map(([k, v]) => [k, clean(v)])) : n;
  const c = clean(s); c.$comment = "Vercel's vercel.json schema (https://openapi.vercel.sh/vercel.json, fetched " + new Date().toISOString().slice(0, 10) + "), prose removed. Refresh with: node scripts/vercelConfigCheck.mjs --refresh"; fs.writeFileSync(SCHEMA_FILE, JSON.stringify(c) + "\n"); console.log("schema written, " + fs.statSync(SCHEMA_FILE).size + " bytes"); process.exit(0);
}

// .vercelignore, read the way gitignore reads it (Vercel's rule): later patterns win, "!" re-includes, a leading "/" anchors to the root, a pattern with no other "/" matches at any depth, a trailing "/" is a directory, "**" crosses directories, "*" does not; a file inside an ignored directory is gone whatever a later "!" says.
export function ignoreMatcher(text) {
  const rules = String(text || "").split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l && !l.startsWith("#")).map(l => {
    let neg = false; if (l.startsWith("!")) { neg = true; l = l.slice(1); } let dirOnly = false; if (l.endsWith("/")) { dirOnly = true; l = l.slice(0, -1); }
    const anchored = l.startsWith("/") || l.includes("/"); l = l.replace(/^\//, "");
    const body = l.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
    return { neg, dirOnly, re: new RegExp((anchored ? "^" : "(^|.*/)") + body + "$") };
  });
  const verdict = (rel, isDir) => { let ign = false; for (const r of rules) { if (r.dirOnly && !isDir) continue; if (r.re.test(rel)) ign = !r.neg; } return ign; };
  return rel => { const parts = rel.replace(/^\.\//, "").split("/"); for (let i = 1; i < parts.length; i++) if (verdict(parts.slice(0, i).join("/"), true)) return true; return verdict(parts.join("/"), false); };   // true = removed from the upload
}
// the files a shell command names: words with a "/" or a script extension; not options, variables, URLs or absolute paths; "npm run x" is followed into package.json
export function filesNamedBy(cmd, pkgScripts = {}, seen = new Set()) {
  const out = new Set(); const text = String(cmd || "");
  for (const w of text.split(/[\s;&|()`"'=<>]+/)) { if (!w || w.startsWith("-") || w.includes("$") || w.startsWith("/") || w.startsWith(":") || /^https?:/.test(w) || w === "." || w === "..") continue; if (/\//.test(w) || /\.(sh|mjs|cjs|js|ts|py|json)$/.test(w)) out.add(w.replace(/^\.\//, "")); }
  for (const m of text.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) if (pkgScripts[m[1]] && !seen.has(m[1])) { seen.add(m[1]); for (const f of filesNamedBy(pkgScripts[m[1]], pkgScripts, seen)) out.add(f); }
  return [...out];
}
const { validate } = await import(pathToFileURL(path.join(ROOT, "scripts/_jsonSchema.mjs")).href);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MAX = 256, WARN = 240;
const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));
// the validator itself, on made up files: a good one passes, each kind of break is found (so a green result means something)
{ const bad = (cfg, why) => ok(validate(schema, cfg).length > 0, `self-test: the schema check finds ${why}`);
  ok(validate(schema, { functions: { "api/x.js": { maxDuration: 60, includeFiles: "lib/**" } }, ignoreCommand: "bash scripts/vercelIgnore.sh", crons: [{ path: "/api/x", schedule: "0 8 * * *" }] }).length === 0, "self-test: a plain good config passes the schema check");
  bad({ ignoreCommand: "x".repeat(257) }, "an ignoreCommand over 256 characters"); bad({ buildCommand: "x".repeat(257) }, "a buildCommand over 256 characters"); bad({ installCommand: "x".repeat(257) }, "an installCommand over 256 characters");
  bad({ outputDirectory: "x".repeat(257) }, "an outputDirectory over 256 characters"); bad({ functions: { "api/x.js": { includeFiles: "x".repeat(257) } } }, "an includeFiles over 256 characters"); bad({ functions: { "api/x.js": { excludeFiles: "x".repeat(257) } } }, "an excludeFiles over 256 characters");
  bad({ functions: { "api/x.js": { maxDuration: 99999 } } }, "a maxDuration out of range"); bad({ notAVercelField: 1 }, "a top level field Vercel does not know"); bad({ functions: { "api/x.js": { includeFiles: 5 } } }, "an includeFiles that is not a string"); bad({ crons: [{ path: "/a" }] }, "a cron with no schedule"); }

// the .vercelignore rule on made up files
{ const ig = ignoreMatcher("scripts/**\n!scripts/keep.json\n/docs/\n*.md\n"), named = filesNamedBy("bash scripts/x.sh && node ./lib/y.mjs 2>/dev/null; npm run build", { build: "node scripts/b.mjs" });
  ok(ig("scripts/x.sh") && !ig("scripts/keep.json") && ig("docs/a.json") && ig("README.md") && !ig("lib/y.mjs") && ig("scripts/deep/z.mjs"), "self-test: the .vercelignore reader removes scripts/** except the file kept by !, the docs folder and *.md, and leaves lib/");
  ok(named.includes("scripts/x.sh") && named.includes("lib/y.mjs") && named.includes("scripts/b.mjs") && !named.some(x => x.includes("/dev/null")), "self-test: the files a command names are found, npm run is followed, /dev/null is not one (" + named.join(", ") + ")"); }
let text = null; try { text = ref ? execFileSync("git", ["show", ref + ":vercel.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 }) : fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"); } catch {}
ok(text != null, "vercel.json can be read" + (ref ? " at " + ref : ""));
let cfg = null; try { cfg = JSON.parse(text); } catch (e) { ok(false, "vercel.json parses (" + String(e.message).slice(0, 80) + ")"); }
if (cfg) {
  ok(true, "vercel.json parses");
  // the strings Vercel limits to 256 characters, by name
  const named = []; for (const k of ["ignoreCommand", "buildCommand", "installCommand", "outputDirectory", "devCommand"]) if (cfg[k] !== undefined) named.push([k, cfg[k]]);
  const fns = cfg.functions && typeof cfg.functions === "object" ? cfg.functions : {};
  for (const [k, f] of Object.entries(fns)) for (const w of ["includeFiles", "excludeFiles", "installCommand"]) if (f[w] !== undefined) named.push([`functions["${k}"].${w}`, f[w]]);
  let longest = 0;
  for (const [name, v] of named) { ok(typeof v === "string", `${name} is a string`); if (typeof v !== "string") continue; longest = Math.max(longest, v.length); ok(v.length <= MAX, `${name} is ${v.length} characters; Vercel accepts at most ${MAX} (it refuses the whole file and the deploy ends in Error)`); if (v.length <= MAX && v.length > WARN) console.log(`NOTE ${name} is ${v.length} characters, close to the ${MAX} limit`); }
  // the whole file against Vercel's schema
  const errs = validate(schema, cfg); ok(errs.length === 0, `vercel.json is valid against Vercel's schema (${errs.length} problem${errs.length === 1 ? "" : "s"}): ` + errs.slice(0, 8).map(x => `${x.path} ${x.msg}`).join("; "));
  if (!ref) {
    for (const k of Object.keys(fns)) ok(fs.existsSync(path.join(ROOT, k)), `functions["${k}"] names a file that exists`);
    const sh = typeof cfg.ignoreCommand === "string" ? /scripts\/[A-Za-z0-9_.-]+\.sh/.exec(cfg.ignoreCommand) : null; if (sh) ok(fs.existsSync(path.join(ROOT, sh[0])), `the ignoreCommand's script ${sh[0]} exists`);
  }
  // every file a build, install, dev or ignore command names must exist and must survive .vercelignore (read at the same ref)
  { const at = f => { try { return ref ? execFileSync("git", ["show", ref + ":" + f], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 }) : fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return null; } };
    const exists = f => ref ? at(f) !== null : fs.existsSync(path.join(ROOT, f)); let pkg = {}; try { pkg = JSON.parse(at("package.json") || "{}").scripts || {}; } catch {}
    const survives = ignoreMatcher(at(".vercelignore") || ""), cmds = [["buildCommand", cfg.buildCommand], ["installCommand", cfg.installCommand], ["devCommand", cfg.devCommand], ["ignoreCommand", cfg.ignoreCommand]]; let n = 0;
    for (const [name, c] of cmds) for (const f of filesNamedBy(c, pkg)) { n++; ok(exists(f), `${name} names ${f}, which does not exist`); ok(!survives(f), `${name} names ${f}, and .vercelignore removes it from the upload, so the command cannot run in Vercel's build`); }
    console.log(`INFO ${n} file${n === 1 ? "" : "s"} named by the build, install, dev and ignore commands, each checked against .vercelignore`); }
  console.log(`INFO ${Object.keys(fns).length} function entries, ${named.length} limited strings read, the longest is ${longest} characters (limit ${MAX})`);
}
console.log(`vercelConfigCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
