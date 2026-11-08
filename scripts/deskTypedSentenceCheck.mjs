// NO DESK FILE TYPES AN ENGINE SENTENCE OR JOINS A COUNT TO A PLURAL NOUN BY HAND (Lane D, Nov 8 2026).
// Cause: the sheet fixtures and sheetRead wrote engine lines as page copy (thin.pooled_apart, the option-count note, "N sales"), so a wording change in lib/reasonWords.js left the Desk saying the old words, and a count of 1 read "1 sales".
// Class: every file that builds or prints the sheet (the fixtures, the sheet read, the PDF, the send email, the sheet page) must (1) carry no reason-table sentence, (2) not read optionsNote/windowNote, (3) join a count to sale/car/listing only through countNoun, (4) print the same words when the pool holds ONE sale.
//   node scripts/deskTypedSentenceCheck.mjs
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const { REASON_TABLE } = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const FILES = ["lib/desk/sheetShape.js", "lib/sheetRead.js", "lib/desk/reportPdf.js", "lib/desk/send.js", "lib/desk/sheetActions.js", "lib/desk/decisionRules.js", "public/js/deskvals.js"].filter(f => fs.existsSync(path.join(ROOT, f)));
const lines = new Map();
for (const [id, e] of Object.entries(REASON_TABLE)) {
  if (e.before && !/\d|^\(new/.test(e.before)) lines.set(e.before, id);
  try { const t = e.text({}); if (typeof t === "string" && t.length > 15 && !/undefined|NaN/.test(t)) lines.set(t, id); } catch { /* parameters needed */ }
}
const code = s => s.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, "")).join("\n");
export function problems(file, src) {
  const t = code(src), out = [];
  for (const [s, id] of lines) if (t.includes(s) || t.includes(s.replace(/"/g, '\\"'))) out.push(`${file} types the engine line ${id}`);
  // a typed fragment of an engine sentence the reason table also holds (the lead clause is enough)
  if (/split into options priced apart/.test(t)) out.push(`${file} types the pooled-apart sentence`);
  if (/\.(optionsNote|windowNote)\b/.test(t)) out.push(`${file} reads optionsNote/windowNote`);
  for (const m of t.matchAll(/\$\{(?:(?!countNoun)[^}])*\}\s+(sales|cars|listings)\b/g)) out.push(`${file} joins a count to "${m[1]}" without countNoun: ${m[0].slice(0, 50)}`);
  return out;
}
for (const f of FILES) { const p = problems(f, rd(f)); ok(!p.length, `${f} types no engine sentence and joins no count by hand` + (p.length ? " (" + p.join("; ") + ")" : "")); }
// a pool of ONE sale reads "1 sale" on the fixture and the sheet read's proof line
const { fixtureRead } = await import(pathToFileURL(path.join(ROOT, "lib/desk/sheetShape.js")).href);
const asked = fixtureRead({ vin: "WP0AB29918S745123", tier: 2 });
ok(asked && !/\b1 sales\b/.test(JSON.stringify(asked)), "the fixture read never says '1 sales'");
const { reasonLine } = await import(pathToFileURL(path.join(ROOT, "lib/reasonWords.js")).href);
const open = fixtureRead({ vin: "WP0CB29918S765432", tier: 2 });
ok(open && open.market.startingNote === reasonLine("thin.pooled_apart") && open.market.asks[0].reason === reasonLine("thin.pooled_apart"), "the split fixture's ask and starting note ARE the engine's thin.pooled_apart line (changing the table changes the Desk)");
// MUTANTS: each reintroduced fault must be flagged
const MUT = [
  ["typed pooled-apart sentence", "lib/desk/sheetShape.js", s => s + `\nconst x = "These sales split into options that sit in different price ranges, so no one typical range is shown. Pick an option below to read its own sales.";`],
  ["typed Market Check thin line", "lib/desk/sheetShape.js", s => s + `\nconst y = "These sales sit in very different price ranges, so no typical range is shown. These are the sales on record.";`],
  ["page reads optionsNote", "lib/sheetRead.js", s => s + `\nconst z = a.optionsNote;`],
  ["page reads windowNote", "lib/desk/reportPdf.js", s => s + `\nconst z = d.windowNote;`],
  ["count glued to a plural", "lib/sheetRead.js", s => s + "\nconst w = `holds ${sameN} sales.`;"],
  ["count glued to listings", "lib/desk/reportPdf.js", s => s + "\nconst w = `${n} listings`;"]
];
for (const [name, f, fn] of MUT) ok(problems(f, fn(rd(f))).length > 0, `without the fix the check goes red: ${name}`);
console.log(`deskTypedSentenceCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
