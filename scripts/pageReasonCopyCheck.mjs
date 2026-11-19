// NO PAGE CARRIES A COPY OF AN ENGINE REASON LINE (Sam, Oct 28 2026). Cause: the cold and stale lines were written again in the pages (partner demo, Sell, Find, Tasks, history hubs, Market Check's client) as string
// literals, so a wording change in lib/reasonWords.js left the page saying the old words ("Sam is reading the sales for this one."). Class: every line in REASON_TABLE (current text and the e98 `before` wording)
// found as a literal anywhere outside lib/reasonWords.js and the engine. The page prints the engine's field (an API field, or a value the server injects from reasonLine).   node scripts/pageReasonCopyCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { REASON_TABLE } from "../lib/reasonWords.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const strings = new Map();   // text -> id
for (const [id, e] of Object.entries(REASON_TABLE)) {
  if (e.before && !/\d|^\(new/.test(e.before)) strings.set(e.before, id + " (before)");
  try { const t = e.text({}); if (typeof t === "string" && t.length > 15 && !/undefined|NaN/.test(t)) strings.set(t, id); } catch { /* needs parameters: only its fixed wording is looked for */ }
}
const FILES = [];
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.git|docs|proofs|fixtures/.test(p)) walk(p); } else if (/\.(js|html)$/.test(f.name)) FILES.push(p); } };
for (const d of ["api", "lib", "public"]) walk(d);
const ALLOWED = new Set(["lib/reasonWords.js"]);
let scanned = 0;
for (const f of FILES) {
  if (ALLOWED.has(f)) continue;
  let raw = fs.readFileSync(f, "utf8");
  if (f === "api/buy.js") { const m = /^const CLIENT = (".*");$/m.exec(raw); if (m) raw += "\n" + JSON.parse(m[1]); }   // the Find page's browser code lives in one JSON string
  const t = raw.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, "")).join("\n"); scanned++;   // comments are not copy that prints
  for (const [s, id] of strings) {
    const needle = s.replace(/'/g, "\\'"); 
    if (t.includes(s) || t.includes(needle) || t.includes(s.replace(/"/g, '\\"'))) ok(false, `${f} carries a copy of the engine line ${id}: "${s.slice(0, 70)}"`);
  }
}
ok(scanned > 50, `scanned ${scanned} page and library files`);
console.log(`pageReasonCopyCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
