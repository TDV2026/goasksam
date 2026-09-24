// Sam Desk dictionary golden (Stage A). Pins the deterministic EXPANSION of every dictionary
// entry so a slang mapping can never drift silently, and re-asserts that every declared
// generation code exists in lib/generations.js. Pure/offline (no network, no DB).
//
//   node scripts/deskDictionaryGolden.mjs           # check against the pinned baseline
//   node scripts/deskDictionaryGolden.mjs --update  # re-baseline (after an intended change)
//
// Exit 1 on any drift, any missing generation, or any invalid metric target.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ALL_ENTRIES, expandEntry, DICTIONARY_VERSION } from "../lib/desk/dictionary.js";
import { generationsForModel } from "../lib/generations.js";
import { MEASURES } from "../lib/desk/query.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "desk-dictionary-golden.json");
const update = process.argv.includes("--update");

// Deterministic snapshot: phrase -> expansion, sorted by phrase for a stable diff.
const snapshot = {};
for (const e of ALL_ENTRIES) snapshot[e.phrase] = expandEntry(e);
const ordered = Object.fromEntries(Object.keys(snapshot).sort().map(k => [k, snapshot[k]]));
const payload = { version: DICTIONARY_VERSION, entries: ordered };

// ---- structural assertions (run in both modes; a bad dictionary never becomes a baseline) ----
let hard = 0;
const genFail = [], metricFail = [];
for (const e of ALL_ENTRIES) {
  const list = e.models || e.members || [];
  for (const mm of list) {
    if (mm.generation) {
      const gens = generationsForModel(mm.make, mm.model).map(g => String(g.code).toLowerCase());
      if (!gens.includes(String(mm.generation).toLowerCase())) genFail.push(`${e.phrase}: ${mm.make} ${mm.model} gen "${mm.generation}" not in generations.js`);
    }
  }
  if (e.type === "metric" && e.metric.measure !== null && !MEASURES.has(e.metric.measure)) metricFail.push(`${e.phrase}: measure "${e.metric.measure}" not a DSL metric`);
}
if (genFail.length) { console.error("GENERATION CODES MISSING:\n  " + genFail.join("\n  ")); hard += genFail.length; }
if (metricFail.length) { console.error("INVALID METRIC TARGETS:\n  " + metricFail.join("\n  ")); hard += metricFail.length; }

if (update) {
  if (hard) { console.error(`\nRefusing to --update: ${hard} structural failure(s) above.`); process.exit(1); }
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote baseline: ${Object.keys(ordered).length} entries, version ${DICTIONARY_VERSION}.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) { console.error("No baseline. Run with --update first."); process.exit(1); }
const base = JSON.parse(readFileSync(BASELINE, "utf8"));

let drift = 0;
const baseKeys = new Set(Object.keys(base.entries || {}));
const nowKeys = new Set(Object.keys(ordered));
for (const k of nowKeys) if (!baseKeys.has(k)) { console.error(`ADDED (not in baseline): ${k}`); drift++; }
for (const k of baseKeys) if (!nowKeys.has(k)) { console.error(`REMOVED (in baseline, gone now): ${k}`); drift++; }
for (const k of nowKeys) {
  if (!baseKeys.has(k)) continue;
  const a = JSON.stringify(base.entries[k]), b = JSON.stringify(ordered[k]);
  if (a !== b) { console.error(`CHANGED: ${k}\n  baseline: ${a}\n  now:      ${b}`); drift++; }
}

if (drift || hard) { console.error(`\n${drift} expansion drift(s), ${hard} structural failure(s). Review, then --update if intended.`); process.exit(1); }
console.log(`All ${nowKeys.size} dictionary expansions match the baseline; every generation code exists; every metric is a DSL metric. version ${DICTIONARY_VERSION}.`);
process.exit(0);
