// A function written into a page as text (fn.toString() inside a <script>) runs in the browser with NOTHING from its own file:
// no import, no top-level name of the module that defines it. One import added to such a function (priorListing.js, statedMiles,
// Nov 2026) threw on public Find. This check catches the CLASS: it records every function the server turns into text while the
// page modules load, finds the file the text came from, and fails if the text uses an import or a top-level name of that file.
// Also: no file under public/ (served as script) carries import/export/require. Offline, reads source only.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

// 1. record every function turned into text
const seen = new Map(); const real = Function.prototype.toString;
Function.prototype.toString = function () { const s = real.call(this); if (typeof this === "function" && !/\[native code\]/.test(s) && !/^class\b/.test(s)) seen.set(s, this.name || "(anonymous)"); return s; };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const files = [...walk("lib"), ...walk("api")];
const src = new Map(files.map(f => [f, fs.readFileSync(f, "utf8")]));
const serializers = files.filter(f => /\b[A-Za-z_$][\w$]*\.toString\(\)/.test(src.get(f)));
for (const f of serializers) { try { await import(pathToFileURL(path.resolve(f)).href); } catch (e) { ok(false, `${f} did not load for the check: ${e.message}`); } }
Function.prototype.toString = real;
// only functions whose text is a real function written in our files
const texts = [...seen].filter(([t]) => files.some(f => src.get(f).includes(t)));
ok(texts.length >= 5, `the check saw the functions written into pages (${texts.length})`);

// 2. for each, the names its home file owns that the browser will not have
const own = new Set(texts.map(([, n]) => n));
const IDENT = /[A-Za-z_$][\w$]*/g;
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1 ").replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, '""').replace(/\/(?:\\.|[^/\\\n])+\/[gimsuy]*(?=[.,;)\s])/g, "//");
function homeNames(text) {
  const home = files.find(f => src.get(f).includes(text)); const s = src.get(home); const names = new Set();
  for (const m of s.matchAll(/^import\s+([^;]+?)\s+from\s+["'][^"']+["']/gm)) { for (const n of m[1].replace(/[{}*]/g, " ").replace(/\bas\b/g, " ").split(/[\s,]+/)) if (n && n !== "default") names.add(n); }
  for (const m of s.matchAll(/^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return { home, names };
}
for (const [text, name] of texts) {
  const { home, names } = homeNames(text); const body = strip(text);
  const declared = new Set([...body.matchAll(/\b(?:var|let|const|function|catch)\s*\(?\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
  for (const m of body.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) for (const n of m[1].split(",")) declared.add(n.trim().replace(/=.*/, ""));
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
  const used = new Set(); for (const m of body.matchAll(IDENT)) { const i = m.index; if (body[i - 1] === ".") continue; if (/^\s*:/.test(body.slice(i + m[0].length, i + m[0].length + 3)) && /[{,]\s*$/.test(body.slice(Math.max(0, i - 3), i))) continue; used.add(m[0]); }
  const leaks = [...used].filter(n => names.has(n) && !declared.has(n) && !own.has(n) && n !== name);
  ok(!leaks.length, `${name} (${home}) is written into a page as text and uses ${leaks.join(", ")} from its own file, which the browser does not have`);
}
// 3. files served to the browser as script carry no module syntax
for (const f of walk("public")) { const s = fs.readFileSync(f, "utf8"); ok(!/^\s*(import\s[^(]|export\s)/m.test(s) && !/\brequire\(/.test(s), `${f} is served as page script and has import, export or require`); }
console.log(`browserTextImportCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
