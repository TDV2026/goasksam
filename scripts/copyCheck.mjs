// COPYCHECK (Lane E, Nov 1 2026): the guard on data/copy.json, the one file of static page words Sam edits in the GitHub editor. A bad edit fails with the key and the reason in plain words.
// Rules: valid JSON; no empty value; no em or en dash; no competitor name; no count of sources or auction houses; no "our data" or "valuation"; no first-person Sam (I, I'm, my, me);
// a title under 60 characters; a meta description under 160 (both the file's TITLE and DESC lines and the rendered pages); every key a page reads exists; every key in the file is read by a page.
//   node scripts/copyCheck.mjs [path/to/copy.json]   exit 1 on any failure.   Runs in prePush and in .github/workflows/copy-check.yml on every push to main.
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "data/copy.json");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// Titles and descriptions that were already over the limit on Nov 1 2026 when the rule began. Each is named with its length so it cannot grow; shorten one and take it off this list.
// A new title or description over the limit, and any of these getting longer, fails.
const KNOWN_LONG = { "home.TITLE": 80, "find.TITLE": 63 };
const KNOWN_LONG_DESC = { "home.DESC": 165, "about.DESC": 160 };
import { RULES, SELLING_RULES, competitorIn } from "./copyRules.mjs";
const leaves = (v, k, out = []) => { if (typeof v === "string") out.push([k, v]); else if (Array.isArray(v)) { if (!v.length) out.push([k, null]); v.forEach((x, i) => leaves(x, k + "[" + i + "]", out)); } else if (v && typeof v === "object") { const e = Object.entries(v); if (!e.length) out.push([k, null]); for (const [a, b] of e) leaves(b, k ? k + "." + a : a, out); } else out.push([k, v]); return out; };
let data = null;
try { data = JSON.parse(fs.readFileSync(FILE, "utf8")); ok(true, ""); } catch (e) { ok(false, `${path.relative(ROOT, FILE)} is not valid JSON, so no page can read it: ${e.message}. Look for a missing comma or a quote that was not closed.`); }
if (data) {
  for (const [k, v] of leaves(data, "")) {
    if (v === null || (typeof v === "string" && !v.trim())) { ok(false, `${k} is empty. A page would print a blank. Put the words back, or ask for the key to be removed.`); continue; }
    if (typeof v !== "string") { ok(false, `${k} is not text. Every value in this file is words.`); continue; }
    for (const [re, why] of RULES) ok(!re.test(v), `${k} ${why} (found: "${(v.match(re) || [""])[0]}")`);
    const hit = competitorIn(v);
    ok(!hit, `${k} names a competitor ("${hit}"). Public copy names no competitors.`);
    const last = k.split(".").pop();
    if (last === "TITLE" || last === "DESC") for (const [re, why] of SELLING_RULES) ok(!re.test(v), `${k} ${why}`);
    if (last === "TITLE") { const lim = KNOWN_LONG[k] || 59; ok(v.length <= lim, `${k} is a page title of ${v.length} characters. Titles must be under 60${KNOWN_LONG[k] ? " (this one was " + KNOWN_LONG[k] + " when the rule began and may not grow)" : ""}.`); }
    if (last === "DESC") { const lim = KNOWN_LONG_DESC[k] || 159; ok(v.length <= lim, `${k} is a meta description of ${v.length} characters. Descriptions must be under 160${KNOWN_LONG_DESC[k] ? " (this one was " + KNOWN_LONG_DESC[k] + " when the rule began and may not grow)" : ""}.`); }
  }
  // every key a page reads is in the file, and every key in the file is read by a page
  const srcFiles = []; for (const d of ["api", "lib"]) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.js$/.test(f)) srcFiles.push(path.join(ROOT, d, f));
  const used = new Set(); for (const f of srcFiles) { const t = fs.readFileSync(f, "utf8"); for (const m of t.matchAll(/\bcopy(?:Text)?\("([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)"\)/g)) used.add(m[1]); }
  const has = k => { const [p, ...r] = k.split("."); return data[p] && data[p][r.join(".")] !== undefined; };
  for (const k of used) ok(has(k), `a page asks for ${k} but data/copy.json has no such line. A key was renamed or deleted.`);
  for (const [p, o] of Object.entries(data)) for (const s of Object.keys(o || {})) ok(used.has(p + "." + s), `${p}.${s} is in data/copy.json but no page reads it, so editing it changes nothing. Remove it or wire it to a page.`);
  // the pages as they are served: the real title and meta description lengths
  if (FILE === path.join(ROOT, "data/copy.json")) {
    const { renderAll } = await import("./copyRender.mjs"); const pages = await renderAll(false);
    for (const [name, html] of Object.entries(pages)) {
      const t = (/<title>([^<]*)<\/title>/.exec(html) || [])[1], d = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1];
      ok(t != null && t.length > 0, `the ${name} page has no title`);
      for (const [re, why] of SELLING_RULES) { ok(!re.test(t || ""), `the ${name} page title ${why}`); ok(!re.test(d || ""), `the ${name} page meta description ${why}`); }
      const tk = { home: "home.TITLE", find: "find.TITLE" }[name], dk = { home: "home.DESC", about: "about.DESC" }[name];
      ok(t == null || t.length <= (tk ? KNOWN_LONG[tk] : 59), `the ${name} page title is ${t && t.length} characters; titles must be under 60.`);
      ok(d == null || d.replace(/&[a-z#0-9]+;/g, "x").length <= (dk ? KNOWN_LONG_DESC[dk] : 159), `the ${name} page meta description is ${d && d.length} characters; descriptions must be under 160.`);
    }
  }
}
console.log(`copyCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
