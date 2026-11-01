// COPYPROPOSALSCHECK (Lane E, Nov 1 2026): guards docs/copy-proposals.md, the proposed shorter lines for titles and descriptions that were over length when copyCheck began.
// It fails when: data/copy.json says neither the Current nor the Proposed line (the doc is stale; once applied the file equals Proposed), a stated count is wrong, a Proposed line breaks a copy rule or the length rule,
// or a line still on copyCheck's allowance list has no proposal here (the class: any over-length title or description must come with a fitting replacement).
//   node scripts/copyProposalsCheck.mjs [doc.md] [copy.json]   exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { RULES, SELLING_RULES, competitorIn, LIMIT_TITLE, LIMIT_DESC } from "./copyRules.mjs";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DOC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "docs/copy-proposals.md");
const FILE = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ROOT, "data/copy.json");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const doc = fs.readFileSync(DOC, "utf8");
const blocks = {};
for (const m of doc.matchAll(/^## ([A-Za-z0-9_.]+)\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/gm)) {
  const get = label => { const r = new RegExp("^- " + label + " \\((\\d+)\\): (.*)$", "m").exec(m[2]); return r ? { n: +r[1], text: r[2] } : null; };
  blocks[m[1]] = { cur: get("Current"), pro: get("Proposed") };
}
const keys = Object.keys(blocks);
ok(keys.length > 0, "docs/copy-proposals.md has no proposal blocks (a line starting ## key, then Current and Proposed lines).");
for (const k of keys) {
  const { cur, pro } = blocks[k], [g, ...r] = k.split("."), live = data[g] && data[g][r.join(".")];
  const last = k.split(".").pop(), lim = last === "TITLE" ? LIMIT_TITLE : LIMIT_DESC;
  ok(cur && pro, `${k}: needs a "Current (n):" line and a "Proposed (n):" line.`);
  if (!cur || !pro) continue;
  ok(live !== undefined, `${k} is not a line in data/copy.json.`);
  // pending: the file still says Current. applied: the file says Proposed exactly. Anything else means the file changed after the proposal was written.
  ok(live === cur.text || live === pro.text, `${k}: data/copy.json says neither the Current nor the Proposed line. The file changed after the proposal was written. Rewrite the proposal.`);
  ok(cur.n === cur.text.length, `${k}: Current says ${cur.n} characters but it is ${cur.text.length}.`);
  ok(pro.n === pro.text.length, `${k}: Proposed says ${pro.n} characters but it is ${pro.text.length}.`);
  ok(pro.text.length <= lim, `${k}: the proposal is ${pro.text.length} characters; ${last === "TITLE" ? "titles" : "descriptions"} must be under ${lim + 1}.`);
  ok(pro.text !== cur.text, `${k}: the proposal is the same as the current line.`);
  for (const [re, why] of RULES) ok(!re.test(pro.text), `${k} proposal ${why}`);
  for (const [re, why] of SELLING_RULES) ok(!re.test(pro.text), `${k} proposal ${why}`);
  const hit = competitorIn(pro.text); ok(!hit, `${k} proposal names a competitor ("${hit}").`);
}
// the class: every title or description that is over the rule today has a proposal
const src = fs.readFileSync(path.join(ROOT, "scripts/copyCheck.mjs"), "utf8");
const allow = [...src.matchAll(/KNOWN_LONG(?:_DESC)? = \{([^}]*)\}/g)].flatMap(m => [...m[1].matchAll(/"([A-Za-z0-9_.]+)"/g)].map(x => x[1]));
for (const k of allow) ok(keys.includes(k), `${k} is on copyCheck's over-length allowance list but docs/copy-proposals.md has no proposal for it.`);
for (const [g, o] of Object.entries(data)) for (const [n, v] of Object.entries(o || {})) {
  const k = g + "." + n, lim = n === "TITLE" ? LIMIT_TITLE : n === "DESC" ? LIMIT_DESC : null;
  if (lim && typeof v === "string" && v.length > lim) ok(keys.includes(k), `${k} is ${v.length} characters, over the rule, and has no proposal in docs/copy-proposals.md.`);
}
console.log(`copyProposalsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
