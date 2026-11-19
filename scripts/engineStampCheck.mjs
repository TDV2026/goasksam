// THE ENGINE STAMP IS HELD (lane-b-sell-nolump-2, Nov 18 2026). Live fault: lane-b-sell-nolump changed lib/onebox.js and the variant data and shipped without a new ENGINE_VERSION, so answers stored before the push served first ("too spread out" on the first "Ferrari 330 GT" read).
// THE RULE: the engine's files (lib/onebox.js without its two stamp lines, lib/variants.js, data/variantFamilies.json) are hashed; data/engineStamp.json holds the stamp and the hash of the last stamped state. A change to any of them with the stamp unchanged FAILS. A bump of the stamp is recorded with `node scripts/engineStampCheck.mjs --record` (one line, the new stamp and hash), so every change to the engine carries a new stamp in the same commit.
//   node scripts/engineStampCheck.mjs [root]            the check
//   node scripts/engineStampCheck.mjs --record          write data/engineStamp.json from the files as they stand (after the stamp is bumped)
//   node scripts/engineStampCheck.mjs --mutants         the mutants, each in a copy of the files
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import os from "node:os"; import { fileURLToPath } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
export const FILES = ["lib/onebox.js", "lib/variants.js", "lib/variantRows.js", "data/variantFamilies.json"];
export function stateOf(root) {
  const h = crypto.createHash("sha256");
  for (const f of FILES) { let t = fs.readFileSync(path.join(root, f), "utf8"); if (f === "lib/onebox.js") t = t.split("\n").filter(l => !/^(export )?const ENGINE_VERSION(_PREV)? = /.test(l)).join("\n"); h.update(f + "\n" + t + "\n"); }
  const m = /^export const ENGINE_VERSION = "([^"]+)"/m.exec(fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8"));
  return { stamp: m ? m[1] : null, hash: h.digest("hex") };
}
// AT MOST ONE STAMP BUMP A DAY (lane-b-read-resilience, Nov 18 2026, order bc85 item 5). Four bumps on Nov 18 (e101, e102, e103, e105) threw away every stored answer four times, so every car was read cold and the archive's reads failed in bursts under the load.
// RULE: data/engineStamp.json keeps the history of bumps (stamp and date, the date is the one inside the stamp). Two bumps on one date fail the check unless the later one carries approvedBy (Sam's word, or the batch it ships with, in words).
// A branch that needs a bump waits and is batched with the others into one. --record appends the bump when the stamp has moved and takes an optional --approved="why" for the exception.
export function bumpsVerdict(rec) {
  const bumps = rec && Array.isArray(rec.bumps) ? rec.bumps : null;
  if (!bumps) return { ok: false, why: "data/engineStamp.json has no bumps history (run scripts/engineStampCheck.mjs --record)" };
  const byDate = new Map();
  for (const b of bumps) { const d = (/^e\d+-(\d{8})-/.exec(String(b.stamp || "")) || [])[1]; if (!d) return { ok: false, why: "a bump has no date in its stamp: " + b.stamp }; (byDate.get(d) || byDate.set(d, []).get(d)).push(b); }
  for (const [d, list] of byDate) if (list.length > 1) { const bad = list.slice(1).filter(b => !String(b.approvedBy || "").trim()); if (bad.length) return { ok: false, why: "more than one stamp bump on " + d + ": " + list.map(b => b.stamp).join(", ") + " (at most one a day unless Sam says otherwise: add approvedBy, or batch the branches into one bump)" }; }
  if (rec.stamp && !bumps.some(b => b.stamp === rec.stamp)) return { ok: false, why: "the recorded stamp " + rec.stamp + " is not in the bumps history" };
  return { ok: true, why: "at most one bump a day (or each extra one is approved)" };
}
export function verdict(root) {
  const now = stateOf(root); let rec = null; try { rec = JSON.parse(fs.readFileSync(path.join(root, "data/engineStamp.json"), "utf8")); } catch { /* none */ }
  if (!now.stamp || !/^e\d{2,3}-\d{8}-[a-z0-9]+$/.test(now.stamp)) return { ok: false, why: "the stamp is not of the shape eNNN-YYYYMMDD-word: " + now.stamp };
  if (!rec) return { ok: false, why: "data/engineStamp.json is missing" };
  { const bv = bumpsVerdict(rec); if (!bv.ok) return bv; }
  if (rec.hash === now.hash && rec.stamp === now.stamp) return { ok: true, why: "the stamp " + now.stamp + " holds the engine files as they stand" };
  if (rec.stamp === now.stamp) return { ok: false, why: "the engine files changed and ENGINE_VERSION is still " + now.stamp + ": stored answers made before the change would be served first. Bump the stamp, then run scripts/engineStampCheck.mjs --record" };
  return { ok: false, why: "the stamp moved (" + rec.stamp + " to " + now.stamp + ") and data/engineStamp.json does not hold the files as they stand: run scripts/engineStampCheck.mjs --record" };
}
if (args.includes("--record")) {
  const s = stateOf(ROOT); let old = null; try { old = JSON.parse(fs.readFileSync(path.join(ROOT, "data/engineStamp.json"), "utf8")); } catch { /* none */ }
  const bumps = old && Array.isArray(old.bumps) ? old.bumps.slice() : [], appr = (args.find(a => a.startsWith("--approved=")) || "").slice(11);
  if (!bumps.some(b => b.stamp === s.stamp)) bumps.push({ stamp: s.stamp, ...(appr ? { approvedBy: appr } : {}) });
  fs.writeFileSync(path.join(ROOT, "data/engineStamp.json"), JSON.stringify({ ...s, bumps }, null, 1) + "\n"); console.log("recorded " + s.stamp + " " + s.hash.slice(0, 12)); process.exit(0); }
if (args.includes("--mutants")) {
  const M = [
    ["lib/onebox.js changes, the stamp does not", "lib/onebox.js", s => s + "\n// a change\n", false],
    ["the variant data changes, the stamp does not", "data/variantFamilies.json", s => s.replace('"ferrari-330"', '"ferrari-330x"'), false],
    ["lib/variants.js changes, the stamp does not", "lib/variants.js", s => s + "\n// a change\n", false],
    ["lib/variantRows.js changes, the stamp does not", "lib/variantRows.js", s => s + "\n// a change\n", false],
    ["the stamp moves and the record does not", "lib/onebox.js", s => s.replace(/^(export const ENGINE_VERSION = ")[^"]+/m, "$1e999-20990101-zz"), false],
    ["the stamp line alone is edited to its own value (no change: passes)", "lib/onebox.js", s => s, true],
    ["a second bump on one day, no approval", "data/engineStamp.json", s => { const j = JSON.parse(s); j.bumps.push({ stamp: "e998-" + (/^e\d+-(\d{8})-/.exec(j.stamp) || [])[1] + "-second" }); return JSON.stringify(j); }, false],
    ["a second bump on one day, approved in words (passes)", "data/engineStamp.json", s => { const j = JSON.parse(s); j.stamp = j.stamp; j.bumps.push({ stamp: "e998-" + (/^e\d+-(\d{8})-/.exec(j.stamp) || [])[1] + "-second", approvedBy: "Sam" }); return JSON.stringify(j); }, true],
    ["the bumps history is dropped", "data/engineStamp.json", s => { const j = JSON.parse(s); delete j.bumps; return JSON.stringify(j); }, false],
  ]; let bad = 0;
  for (const [name, file, fn, want] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
    for (const f of [...FILES, "data/engineStamp.json"]) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); }
    const p = path.join(tmp, file); fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")));
    const v = verdict(tmp), caught = v.ok === want; if (!caught) bad++;
    console.log((caught ? "CAUGHT   " : "SURVIVED ") + name + "  ->  " + v.why.slice(0, 110)); fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(bad ? 1 : 0);
}
const v = verdict(ROOT);
console.log((v.ok ? "PASS  " : "FAIL  ") + v.why);
console.log(`engineStampCheck: ${v.ok ? 1 : 0} passed, ${v.ok ? 0 : 1} failed`);
process.exit(v.ok ? 0 : 1);
