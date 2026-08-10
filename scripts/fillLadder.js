// Spec G: the resumable cache-warming job. Fetches the standard ladder for each
// nameplate in scripts/warm-list.json via the live engine (warm:true, so it
// reuses the exact fetch + persist + cache-stamp path and is gated to the
// RESERVED warm fraction of the daily OCD budget - a real seller search always
// outranks it). Resumable via scripts/fill-progress.json: re-running continues
// where it left off, so it can span many nights. Logs progress + spend.
//
//   node scripts/fillLadder.js                     resume the fill (STOPS when the
//                                                    warm budget for the day is spent)
//   node scripts/fillLadder.js --limit=50          cap this run to N nameplates
//   node scripts/fillLadder.js --reset             restart from the top of the list
//   node scripts/fillLadder.js --base=https://goasksam.vercel.app
//   node scripts/fillLadder.js --dry-run           print the plan, call nothing
//
// DO NOT RUN until Sam's go (run K, the depth probe, first; it may trim the list).
// The engine enforces the budget guard; this script never spends past plan pace.
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = n => args.includes(`--${n}`);
const BASE = flag("base", process.env.FLOW_BASE || "https://goasksam.vercel.app");
const LIMIT = Number(flag("limit", 0)) || Infinity;
const DRY_RUN = has("dry-run");
const RESET = has("reset");

const LIST_FILE = new URL("./warm-list.json", import.meta.url).pathname;
const CURSOR_FILE = new URL("./fill-progress.json", import.meta.url).pathname;

if (!fs.existsSync(LIST_FILE)) { console.error(`Missing ${LIST_FILE}. Run: npm run warm:list`); process.exit(1); }
const list = JSON.parse(fs.readFileSync(LIST_FILE, "utf8")).models || [];
if (!list.length) { console.error("warm-list.json has no models."); process.exit(1); }

function loadCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8")); } catch { return { index: 0, warmed: 0, spent: 0, runs: 0 }; } }
function saveCursor(c) { try { fs.writeFileSync(CURSOR_FILE, JSON.stringify(c, null, 2)); } catch (e) { console.error("cursor save failed:", e.message); } }

const cursor = RESET ? { index: 0, warmed: 0, spent: 0, runs: 0 } : loadCursor();
if (cursor.index >= list.length) { console.log(`Fill already complete (${list.length}/${list.length}). Use --reset to run again.`); process.exit(0); }

console.log(`Fill ladder: ${list.length} nameplate(s), resuming at ${cursor.index}. Base ${BASE}. Ceiling this run: ${LIMIT === Infinity ? "budget-bound" : LIMIT}.`);
if (DRY_RUN) {
  const preview = list.slice(cursor.index, cursor.index + Math.min(10, LIMIT === Infinity ? 10 : LIMIT));
  console.log("Next up:", preview.map(([mk, md]) => `${mk} ${md}`).join(", "));
  console.log("--dry-run: no engine calls made.");
  process.exit(0);
}

cursor.runs = (cursor.runs || 0) + 1;
let processedThisRun = 0, spentThisRun = 0, degraded = 0, budgetStopped = false;

for (let i = cursor.index; i < list.length && processedThisRun < LIMIT; i++) {
  const [make, model] = list[i];
  const vehicle = { raw: `${make} ${model}`, make, model, confidence: "high" };
  let spent = 0, stop = "";
  try {
    const res = await fetch(`${BASE}/api/sellerDecision`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true, car: { vehicle, region: "US" } })
    });
    const j = await res.json().catch(() => ({}));
    const fs2 = j.evidence?.fetchStrategy || {};
    spent = Number(fs2.meteredRequests || 0);
    stop = String(fs2.stopReason || "");
  } catch (e) {
    console.error(`\n${make} ${model}: request error ${e.message}`);
  }
  spentThisRun += spent; processedThisRun++; cursor.index = i + 1; cursor.warmed = (cursor.warmed || 0) + 1; cursor.spent = (cursor.spent || 0) + spent;
  if (/budget/.test(stop)) degraded++;
  process.stderr.write(`\r[${i + 1}/${list.length}] ${make} ${model} (+${spent} req, run spend ${spentThisRun})   `);
  saveCursor(cursor);
  // The engine soft-degrades to the store once the reserved warm budget is spent;
  // a run of degraded responses means the night's warm budget is gone - stop and
  // resume tomorrow rather than hammering the store for no new coverage.
  if (/budget/.test(stop)) { budgetStopped = true; console.log(`\n[budget] warm budget reached at ${make} ${model}; stopping for now, resume later.`); break; }
}
process.stderr.write("\n");
saveCursor(cursor);
console.log(`Run ${cursor.runs}: warmed ${processedThisRun} nameplate(s) this run, ${spentThisRun} metered request(s)${degraded ? `, ${degraded} degraded` : ""}.`);
console.log(`Cumulative: ${cursor.index}/${list.length} done, ${cursor.spent} total metered request(s).`);
console.log(budgetStopped ? "STOPPED on budget; run again after the next reset." : cursor.index >= list.length ? "FILL COMPLETE." : "Paused at run limit; run again to continue.");
