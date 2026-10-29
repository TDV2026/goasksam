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
const src = read("lib/onebox.js") + "\n" + read("lib/questionWayOut.js"), found = new Map();   // Oct 29 2026: the way-out module adds a field to an answer too, so the scan reads it
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
// 3. the SERVED shape, not only the source (Oct 29 2026, Lane B: answer_line and count_line, wayOut, scopeLine and metaLine reached an answer without being on a list and this check was not run before the tip): the real read-time path
// (withReadFields, freshenStoredText, applyWayOut) is run on every answer kind and every top level key it serves must be on a list.
{
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "k"; process.env.LAUNCH_STAGE = "2";
  const E = await import("../lib/onebox.js"), W = await import("../lib/questionWayOut.js");
  const base = JSON.parse(read("scripts/fixtures/m3Answer.json")), pool = n => Array.from({ length: n }, (_, i) => ({ id: "p" + i, _usd: 40000 + i * 800, auction_end_date: "2026-0" + (1 + (i % 9)) + "-12", year: 1986, rtitle: "x", transmission: "Manual" }));
  const opt = (dim, label, value, n, x) => ({ dimension: dim, label, value, n, low: 50000, high: 80000, rangeFloor: false, ownWindow: false, windowWords: "since November 2025", ...(x || {}) });
  const kinds = {
    "single range": { ...base, optionsState: "none", options: [] },
    "alike (every option kind)": { ...base, tier: "result", poolN: 35, rawPool: pool(35), optionsState: "alike", headlineDimension: "body", cluster: [1, 2], options: [opt("body", "Coupe", "coupe", 16), opt("body", "Targa", "targa", 11)], windowWords: "since November 2025", freshness: { through: "2026-10-20" }, resolvedCar: { year: 1986, canonicalLabel: "1986 Porsche 911" } },
    "split, thin option, held chart": { ...base, tier: "result", poolN: 23, rawPool: pool(23), cluster: null, optionsState: "split", headlineDimension: "gearbox", thinReason: "pooled_apart", trendHeld: { reason: "mix_changes" }, headlineLines: ["a", "b"], options: [opt("gearbox", "Manual", "manual", 14), opt("gearbox", "SMG", "auto", 3, { rangeFloor: true, low: null, high: null })] },
    "thin": { tier: "thin", poolN: 6, rawPool: pool(6), windowWords: "since June 2025", thinReason: "few_sales", thin_sales: { count: 6, answer_line: "Six sales, too few for a range.", count_line: "Since June 2025." } },
    "core-shaped (stored, no tier)": { kind: "count", count: 23, optionsState: "split", optionLines: ["a", "b"], countLine: "23 sales since June 2025.", answerLine: "x" },
    "question": W.applyWayOut({ tier: "model_choice", resolvedCar: { year: 1995, make: "Honda" } }, null)
  };
  const bad = [];
  for (const [name, a] of Object.entries(kinds)) { const d = a && a.tier && /^(result|thin)$/.test(a.tier) ? E.withReadFields(a, "x", { year: 1986 }) : E.freshenStoredText(a); for (const k of Object.keys(d || {})) if (!(k in a) && !known(k)) bad.push(`${k} (${name})`); }
  ok(bad.length === 0, `every top level key the read-time path ADDS to an answer is on a list (${bad.length} not: ${bad.join(", ")})`);
}
console.log(`engineFieldsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
