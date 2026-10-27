// NO ENGINE FIELD IS DROPPED SILENTLY (Sam, Oct 27 2026). Sell and Find each handed the shared card only the engine fields on their own list; a field the lists did not know was lost without a word
// (the 325i blank card, the thin card that missed, the pooled options). Now: (1) there is ONE list (lib/engineFields.js CARD_FIELDS) and Sell's and Find's card fields both read it, neither keeps a
// list of its own; (2) every top level field the engine can add to an answer is on that list or acknowledged in NOT_CARRIED. The fields are found in the engine's own source (every key a builder adds
// to an answer: { ...d, key: .. } and result.key = ..) and in the real answers in scripts/fixtures, so a new engine field fails here until someone says whether the card carries it.
//   node scripts/engineFieldsCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { CARD_FIELDS, CARD_DERIVED, NOT_CARRIED } = await import("../lib/engineFields.js");
const read = p => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");

// 1. one list
for (const f of ["lib/sell/sellFacts.js", "lib/live/search.js"]) {
  const s = read(f);
  ok(/import \{ CARD_FIELDS \} from "\.\.\/engineFields\.js"/.test(s) && /for \(const k of CARD_FIELDS\)/.test(s), `${f}: the card fields are read from lib/engineFields.js`);
  ok(!/for \(const k of \[/.test(s.slice(s.indexOf("function cardAnswerOf"), s.indexOf("function cardAnswerOf") + 1200)), `${f}: no list of its own inside cardAnswerOf`);
}
ok(new Set(CARD_FIELDS).size === CARD_FIELDS.length, "no field twice on the card list");
ok(CARD_FIELDS.every(k => !NOT_CARRIED.has(k)) && Object.keys(CARD_DERIVED).every(k => !NOT_CARRIED.has(k) && !CARD_FIELDS.includes(k)), "a field is on one list only");

// 2. every field the engine adds is on a list
const src = read("lib/onebox.js"), found = new Map();
const lineOf = i => (src.slice(0, i).match(/\n/g) || []).length + 1;
const re = /\{\s*\.\.\.(d|a|result|base|out|r|ans|answer|res)\s*,/g; let m;
while ((m = re.exec(src))) {
  let depth = 1, i = m.index + 1; const start = i;
  for (; i < src.length && depth > 0; i++) { const ch = src[i]; if (ch === "{" || ch === "(" || ch === "[") depth++; else if (ch === "}" || ch === ")" || ch === "]") depth--; }
  const seg = src.slice(start, i - 1); let dd = 0, buf = ""; const parts = [];
  for (const ch of seg) { if ("{([".includes(ch)) dd++; else if ("})]".includes(ch)) dd--; if (dd === 0 && ch === ",") { parts.push(buf); buf = ""; } else buf += ch; }
  parts.push(buf);
  for (const part of parts) { const km = /^\s*(\w+)\s*(?::|$)/.exec(part); if (km && !/^\s*\.\.\./.test(part)) found.set(km[1], found.get(km[1]) || lineOf(m.index)); }
}
const re2 = /\b(result|base|out|d)\.([A-Za-z_]\w*)\s*=[^=]/g;
while ((m = re2.exec(src))) if (!found.has(m[2])) found.set(m[2], lineOf(m.index));
for (const k of Object.keys(JSON.parse(read("scripts/fixtures/m3Answer.json")))) if (!found.has(k)) found.set(k, "fixtures/m3Answer.json");
const known = k => CARD_FIELDS.includes(k) || k in CARD_DERIVED || NOT_CARRIED.has(k);
const unknown = [...found].filter(([k]) => !known(k));
ok(unknown.length === 0, `every field the engine adds to an answer is on the card list or acknowledged as not carried (${unknown.length} not: ${unknown.map(([k, w]) => k + " (lib/onebox.js:" + w + ")").join(", ")}). Add it to CARD_FIELDS if Sell, Find or the emails should print it, else to NOT_CARRIED.`);
ok(found.size >= 80, `the scan found the engine's fields (${found.size})`);
// the fields the e95 engine adds are known
for (const k of ["pooledApart", "pooledSplit", "trendHeld"]) ok(CARD_FIELDS.includes(k), `the card carries ${k}`);
console.log(`engineFieldsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
