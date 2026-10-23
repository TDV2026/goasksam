// Lane E, Market Check item 1: "no other card wording changed". The 8 engine answers saved BEFORE Lane B's line push are
// rendered with the OLD card code (lib/sellsForCard.js at the pre-push commit) and the NEW one (at main after the push),
// offline: same data on both sides, so a moving sale can never pass for a wording change. The only difference allowed:
// "Half of these sold in this range." became "The typical range for cars like this.".
// Usage: node cardWordingDiff.mjs <saved answers json> <old ref> <repo>
import fs from "node:fs";
import { execSync } from "node:child_process";
const [saved, oldRef, repo] = process.argv.slice(2);
const OLD_LINE = "Half of these sold in this range.", NEW_LINE = "The typical range for cars like this.";
const load = async ref => { const f = `${repo}/lib/zz_sfc_${String(ref).replace(/[^a-z0-9]/gi, "_")}.mjs`; fs.writeFileSync(f, execSync(`git -C "${repo}" show ${ref}:lib/sellsForCard.js`, { encoding: "utf8" })); const m = await import(f); fs.unlinkSync(f); return m; };
const A = await load(oldRef), B = await load("origin/main");
const text = h => String(h || "").replace(/<[^>]+>/g, "\n").replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&#8594;|&rarr;/g, "→").split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const answers = JSON.parse(fs.readFileSync(saved, "utf8"));
let fails = 0, swapped = 0;
for (const [q, d] of Object.entries(answers)) {
  if (!d) { console.log(`${q}: no saved answer`); fails++; continue; }
  const a = text(A.sellsForCardHtml(d, {})), b = text(B.sellsForCardHtml(d, {}));
  const aa = a.map(s => s.replace(OLD_LINE, NEW_LINE));
  const changed = a.length !== b.length || aa.some((s, i) => s !== b[i]);
  const sw = a.filter(s => s.includes(OLD_LINE)).length; swapped += sw;
  if (b.some(s => s.includes(OLD_LINE))) { fails++; console.log(`  FAIL ${q}: the new card still prints the old line`); }
  if (changed) { fails++; const i = aa.findIndex((s, k) => s !== b[k]); console.log(`  FAIL ${q}: other wording changed at line ${i}: old "${aa[i]}" / new "${b[i]}"`); }
  console.log(`${q}: tier ${d.tier}; ${a.length} card lines; the line swapped ${sw} time(s); ${changed ? "OTHER WORDING CHANGED" : "nothing else changed"}`);
}
console.log(fails ? `cardWordingDiff: ${fails} FAIL` : `cardWordingDiff: all pass (the line swapped on ${swapped} card(s); every other line identical)`);
process.exit(fails ? 1 : 0);
