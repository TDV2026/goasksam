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

export function specialFlag(title, make) {
  const t = String(title || "");
  if (!t) return null;
  for (const [re, why] of NAMED) if (re.test(t)) return why;
  const m = FAKE.exec(t);
  if (m) { const w = m[1].toLowerCase().replace(/[\s-]/g, ""); return /recreation/.test(w) ? "recreation" : /lookalike/.test(w) ? "replica" : /kitcar/.test(w) ? "kit car" : w; }
  const r = recordExcludeReason(t, make || "", { wantHalo: true });
  return r === "race car" ? "race car" : r === "restomod" ? "restomod" : r === "period tuner" ? "period tuner" : null;
}
