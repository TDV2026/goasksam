// vercelConfigCheck (Lane E, Nov 11 2026): VERCEL MUST ACCEPT vercel.json.
// CAUSE: the deploy of 976ce753 ended in Error. Vercel rejects a vercel.json whose functions.*.includeFiles string is longer than 256 characters; api/sell.js (300), api/whatsNew.js and api/marketCheck.js (273 each) were, because each function's own files were joined to the shared example readers list. No check read the config the way Vercel does, so the error showed only on the deploy.
// AFFECTS: every function entry in vercel.json (twelve page functions and crewPage share the same list). THE CLASS: a vercel.json that parses but that Vercel refuses. This check holds every includeFiles to 256 characters or less (a margin warns at 240), requires a string, requires each key to be an api file that exists, and requires the file to parse.
//   node scripts/vercelConfigCheck.mjs [--ref <git ref>]     reads vercel.json from the working tree, or from a commit (to show it fails on a bad one)
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), args = process.argv.slice(2), ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : null;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const MAX = 256, WARN = 240;
let text; try { text = ref ? execFileSync("git", ["show", ref + ":vercel.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 }) : fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"); } catch (e) { text = null; }
ok(text != null, "vercel.json can be read" + (ref ? " at " + ref : ""));
let cfg = null; try { cfg = JSON.parse(text); } catch (e) { ok(false, "vercel.json parses (" + String(e.message).slice(0, 80) + ")"); }
if (cfg) {
  ok(true, "vercel.json parses");
  const fns = cfg.functions && typeof cfg.functions === "object" ? cfg.functions : {}; let longest = 0, n = 0;
  for (const [k, f] of Object.entries(fns)) {
    n++;
    ok(!ref ? fs.existsSync(path.join(ROOT, k)) : true, `functions["${k}"] names a file that exists`);
    if (f.includeFiles === undefined) continue;
    ok(typeof f.includeFiles === "string", `functions["${k}"].includeFiles is a string`);
    if (typeof f.includeFiles !== "string") continue;
    longest = Math.max(longest, f.includeFiles.length);
    ok(f.includeFiles.length <= MAX, `functions["${k}"].includeFiles is ${f.includeFiles.length} characters; Vercel accepts at most ${MAX} (it rejects the whole file and the deploy ends in Error)`);
    if (f.includeFiles.length <= MAX && f.includeFiles.length > WARN) console.log(`NOTE functions["${k}"].includeFiles is ${f.includeFiles.length} characters, close to the ${MAX} limit`);
  }
  ok(n > 0, "vercel.json has function entries");
  console.log(`INFO ${n} function entries, the longest includeFiles is ${longest} characters (limit ${MAX})`);
}
console.log(`vercelConfigCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
