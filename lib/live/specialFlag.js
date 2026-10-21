// One shared list of "specials" for the live side (Lane C, Oct 2026): a live lot that is not a plain example
// of the car. Used by the pull (lib/live/feed.js -> live_listings.special_flag) and by liveTrust (/buy and
// Tasks), so every live surface reads the same flag.
//   1. Named builds: Singer, RUF, RWB.
//   2. Lane B's race-car fence + restomod + period-tuner rules: lib/onebox.js recordExcludeReason (exported,
//      called with wantHalo so halo trims are NOT specials).
//   3. Lane A's replica/clone rule: lib/desk/execute.js TRIM_FAKE (conversion/clone/tribute/replica/
//      recreation/homage/look-alike/restomod), copied here because it is not exported; its bare "style"
//      clause is left out (it would flag "Euro-style bumpers"). Keep in step with that file.
import { recordExcludeReason } from "../onebox.js";

const NAMED = [[/\bsinger\b/i, "Singer"], [/\bruf\b/i, "RUF"], [/\b(rwb|rauh[\s-]?welt)\b/i, "RWB"]];
const FAKE = /\b(clone|tribute|replica|re[\s-]?creation|homage|look[\s-]?a[\s-]?like|continuation|kit\s?car)\b/i;
// REPLICA BUILDERS (Sam's Buy 1f, Oct 21 2026: "hide replicas in Buy, matching the engine pools; a search that names the replica
// itself still finds it"): a listing titled by its BUILDER alone ("Beck 550 Spyder", a Beck-built replica of the Porsche 550) says no
// replica word, so the word fence above cannot see it. Named builders only, each scoped to the make the replica copies and never the
// owner's name ("Jeff Beck's 1932 Ford" is provenance, not a replica). A search that types the builder asks for it (specialAsked).
const REPLICA_BUILDERS = [{ re: /(?<!jeff\s)\bbeck\b(?!['\u2019]s)/i, label: "Beck replica", make: "Porsche", copies: /\b(550|356|speedster|spyder|spider)\b/i }];
export function replicaBuilderIn(text, make) {
  const t = String(text || "");
  for (const b of REPLICA_BUILDERS) {
    if (!b.re.test(t)) continue;
    const mk = String(make || "").trim();
    if ((!mk || new RegExp("^" + b.make + "$", "i").test(mk)) && b.copies.test(t)) return b;
  }
  return null;
}

export function specialFlag(title, make) {
  const t = String(title || "");
  if (!t) return null;
  for (const [re, why] of NAMED) if (re.test(t)) return why;
  const rb = replicaBuilderIn(t, make);
  if (rb) return rb.label;
  const m = FAKE.exec(t);
  if (m) { const w = m[1].toLowerCase().replace(/[\s-]/g, ""); return /recreation/.test(w) ? "recreation" : /lookalike/.test(w) ? "replica" : /kitcar/.test(w) ? "kit car" : w; }
  // Paint/trim-name and road-car-name false positives ("British Racing Green", "Racing Stripes", "Ford
  // Racing Puma") are now stripped INSIDE recordExcludeReason's shared stripRaceNoise (lib/onebox.js),
  // the same strip every comp-pool caller gets - no second copy of the strip needed here.
  const r = recordExcludeReason(t, make || "", { wantHalo: true });
  return r === "race car" ? "race car" : r === "restomod" ? "restomod" : r === "period tuner" ? "period tuner" : null;
}
