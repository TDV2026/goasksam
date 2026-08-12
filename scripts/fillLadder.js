// Spec G CLI: the resumable cache-warming job. The batch core lives in
// lib/ops/fillLadder.js (shared with the web trigger, api/usageDashboard.js
// ?view=ops&task=fill). This CLI owns arg parsing, the on-disk cursor
// (scripts/fill-progress.json) and console output. It fetches the standard ladder
// for each nameplate via the live engine (warm:true), reusing the exact fetch +
// persist + cache-stamp path, gated to the RESERVED warm fraction of the daily OCD
// budget so a real seller search always outranks it.
//
//   node scripts/fillLadder.js                     resume the fill (stops on warm budget)
//   node scripts/fillLadder.js --limit=50          cap this run to N nameplates
//   node scripts/fillLadder.js --reset             restart from the top of the list
//   node scripts/fillLadder.js --base=https://goasksam.com
//   node scripts/fillLadder.js --dry-run           print the plan, call nothing
//
// DO NOT RUN until Sam's go (run the depth probe first; it may trim the list).
import fs from "node:fs";
import { runFillBatch } from "../lib/ops/fillLadder.js";

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const has = n => args.includes(`--${n}`);
const BASE = flag("base", process.env.FLOW_BASE || "https://goasksam.com");
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

const r = await runFillBatch({ base: BASE, list, startIndex: cursor.index, limit: LIMIT, log: msg => process.stderr.write("\r" + msg + "   ") });
process.stderr.write("\n");
cursor.runs = (cursor.runs || 0) + 1;
cursor.index = r.nextIndex; cursor.warmed = (cursor.warmed || 0) + r.processed; cursor.spent = (cursor.spent || 0) + r.spent;
saveCursor(cursor);
console.log(`Run ${cursor.runs}: warmed ${r.processed} nameplate(s) this run, ${r.spent} metered request(s)${r.degraded ? `, ${r.degraded} degraded` : ""}.`);
console.log(`Cumulative: ${cursor.index}/${list.length} done, ${cursor.spent} total metered request(s).`);
console.log(r.budgetStopped ? "STOPPED on budget; run again after the next reset." : r.done ? "FILL COMPLETE." : "Paused at run limit; run again to continue.");
