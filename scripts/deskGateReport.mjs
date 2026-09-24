// Sam Desk Stage A gate report (spec item 6). Runs the five failed questions and the
// 30-question test set (spec s11) through the dictionary LOOKUP + VALIDATOR only, on
// production (read-only ops task=deskgate), and prints for each question: scope, filters,
// window, structural, metric, and EVERY phrase with its fate (used / defaulted / not applied /
// unresolved). NO answers are produced.
//
//   node scripts/deskGateReport.mjs            # the 30-question set
//   node scripts/deskGateReport.mjs five       # just the five that failed on Sep 24
//   BASE=https://goasksam.com PROBE_KEY=... node scripts/deskGateReport.mjs
import { readFileSync, existsSync } from "node:fs";

const BASE = (process.env.BASE || "https://goasksam.com").replace(/\/$/, "");
const set = process.argv.includes("five") ? "five" : "thirty";

function probeKey() {
  if (process.env.PROBE_KEY) return process.env.PROBE_KEY.replace(/^["']|["']$/g, "");
  for (const f of [".env.local", ".env.check"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^PROBE_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const key = probeKey();
if (!key) { console.error("No PROBE_KEY (env or .env.local)."); process.exit(1); }

const url = `${BASE}/api/usageDashboard?view=ops&task=deskgate&set=${set}&key=${encodeURIComponent(key)}`;
const res = await fetch(url);
if (!res.ok) { console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
const j = await res.json();
if (j.error) { console.error("ERROR:", j.error); process.exit(1); }

const FATE = { used: "USED", defaulted: "DEFAULTED", not_applied: "NOT APPLIED", unresolved: "UNRESOLVED" };
let readOk = 0;
console.log(`\n===== SAM DESK STAGE A GATE REPORT (${j.count} questions, lookup + validator only, no answers) =====\n`);
for (const r of j.results) {
  console.log("Q: " + r.question);
  console.log("  SCOPE:      " + (r.scopes.length ? r.scopes.join(" | ") : (r.grouping ? "(grouping) " + r.grouping.name : (r.meta ? "(meta: " + r.meta + ")" : (r.unsupported ? "(unsupported - nothing runs)" : "-")))));
  if (r.grouping) console.log("  GROUPING:   " + r.grouping.name + " [" + (r.grouping.members || r.grouping.into || "") + (r.grouping.status ? ", " + r.grouping.status : "") + "]");
  if (r.vin) console.log("  VIN:        " + r.vin);
  console.log("  FILTERS:    " + (Object.keys(r.filters || {}).length ? JSON.stringify(r.filters) : "-"));
  console.log("  WINDOW:     " + (r.window ? (typeof r.window === "string" ? r.window : JSON.stringify(r.window)) : "-") + (r.windowDefaulted ? " (defaulted)" : ""));
  console.log("  METRIC:     " + (r.metric || "-"));
  console.log("  STRUCTURAL: " + (r.structural && r.structural.length ? JSON.stringify(r.structural) : "-"));
  if (r.ambiguous) console.log("  CLARIFY:    " + r.ambiguous.map(a => a.phrase + " -> " + a.options.join(" or ")).join("; "));
  console.log("  PHRASES:");
  for (const p of r.fates) console.log("     - " + (FATE[p.fate] || p.fate).padEnd(11) + ' "' + p.phrase + '"' + (p.note ? "  (" + p.note + ")" : ""));
  const v = r.validation;
  console.log("  VALIDATOR:  ok=" + v.ok + " runnable=" + v.runnable + " | scopes=" + v.summary.scopes + " invalid=" + v.summary.invalid + " unverified=" + v.summary.unverified + " unresolved=" + v.summary.unresolvedPhrases);
  if (v.unresolved.length) console.log("  UNRESOLVED: " + v.unresolved.join(", ") + "  -> logged to desk_dictionary_queue");
  const invalidParts = v.parts.filter(p => p.status === "invalid");
  if (invalidParts.length) console.log("  INVALID:    " + invalidParts.map(p => p.part + "=" + p.value + " (" + p.reason + ")").join("; "));
  // "reads correctly" = validator did not reject an invented part AND every phrase has a fate.
  const allPhrasesAccounted = r.fates.every(p => FATE[p.fate]);
  const reads = allPhrasesAccounted && (v.ok || r.unsupported || r.meta || r.ambiguous);
  if (reads) readOk++;
  console.log("  READS OK:   " + (reads ? "YES" : "NO") + "\n");
}
console.log(`===== ${readOk}/${j.count} read correctly (validator green or an honest ask/refuse/meta, every phrase accounted for) =====`);
