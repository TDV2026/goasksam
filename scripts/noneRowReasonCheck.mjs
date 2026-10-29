// A STORED CORE ROW OF KIND NONE ALWAYS CARRIES ITS REASON (Lane B, Oct 29 2026). A Find card for a spec with no range, no count and no reason is a blank card; the live blank was the Porsche 911S (no year).
// CAUSE: the engine answers a bare "Porsche 911S" with a QUESTION (tier trim_choice: "These sold as Carrera, Turbo, 911SC ... Which one is it?"). walkLadder builds a core only from result, thin, refusal and body_unavailable,
// and remembers a reason only for not_tracked, a zero thin count or a refusal_line; every other tier left the ladder with no core and no reason, and refreshSpec (lib/live/search.js, the ONE writer of a none row) stored
// kind "none" with notTrackedLine, thinZero and refusalLine all empty. The whole-table read (corewindow since 2020): 5,166 core rows, 1,045 of kind none, 576 blank, on older stamps, 1 on the current stamp.
// FIX: a ladder that ends with no core and no reason takes the engine's own reason-table line for the last tier it saw (find.choice for any *_choice tier, find.none for any other), stored as refusalLine.
// Other cars it affects: every spec whose bare answer is a question (a make and model with no year that the engine asks about, a trim or generation or body or gearbox or variant choice) and every spec whose ladder ends on a tier no core is built from.
//   node scripts/noneRowReasonCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const src = fs.readFileSync("lib/live/search.js", "utf8"), eng = fs.readFileSync("lib/onebox.js", "utf8");
ok("noneReasonFor exists", typeof S.noneReasonFor === "function");
// every tier the engine can answer with, found in its own source
const tiers = [...new Set([...eng.matchAll(/\btier: "([a-z_]+)"/g)].map(m => m[1]))].filter(t => !/^(result|thin|refusal|body_unavailable|not_tracked|read_failed|unavailable)$/.test(t));
ok(`the engine has tiers no core is built from (${tiers.length}: ${tiers.join(", ")})`, tiers.length >= 5);
for (const t of tiers) { const line = typeof S.noneReasonFor === "function" ? S.noneReasonFor(t) : null; ok(`tier ${t}: a none row gets a reason line`, typeof line === "string" && line.length > 10 && !/[–—]/.test(line), line); }
ok("a *_choice tier says the version has to be settled first", typeof S.noneReasonFor === "function" && /settled first/.test(S.noneReasonFor("trim_choice")));
// the one writer, and it stores the reason
const writers = [...src.replace(/\/\/[^\n]*/g, "").matchAll(/kind: "none"/g)].length;
ok("one place writes a none row (refreshSpec)", writers === 1, "writers " + writers);
ok("the ladder never ends without a reason (the fallback sits before the reason is remembered)", /if \(!firstCount && !notTracked && !zeroThin && !refusal\) refusal = noneReasonFor\(lastTier\)/.test(src));
console.log(fail ? `noneRowReasonCheck: ${fail} failure(s)` : "noneRowReasonCheck: all pass");
process.exit(fail ? 1 : 0);
