// setAsideLineCheck (Lane B, Oct 20 2026, the 1971 280SE 3.5 Cabriolet): a typed body whose sales are on record but were all set
// aside before the pool (house lots with no photo) must never read "No <body> ... sale on record"; the not-tracked branch counts
// the fetch's own set-aside rows of the body and uses the existing "was set aside (N)" sentence. STRUCTURAL check (offline, no
// network): a mocked archive did not reach this branch (the engine's archive read path is not reproducible locally), so the
// behaviour is proven by one live read after the push; this check guards the shape of the rule.
import fs from "fs";
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const src = fs.readFileSync(new URL("../lib/onebox.js", import.meta.url), "utf8");
const i = src.indexOf("SET ASIDE, NOT ABSENT"), j = src.indexOf("return { tier: \"not_tracked\", dedup: diag, resolvedCar: { ...resolvedCar, bodyStyle: refine.body", i);
const blk = i > 0 && j > i ? src.slice(i, j) : "";
ok(!!blk, "the not-tracked body branch carries the set-aside count");
ok(/if \(asideN === 0\)/.test(blk) && /collectExcluded: true/.test(blk) && /await fetchQualifying\(spec, since5, env, dx\)/.test(blk), "only when the pool holds none, the body's fetch is re-read with its set-aside rows kept");
ok(/if \(!\/\^no photo\$\/i\.test/.test(blk) && /if \(r2\) continue;/.test(blk), "only no-photo rows that pass every other fence (a project or modified reason comes before the trim fence, so it can be another trim)");
ok(/qualifyReason\(e\.row, \{ \.\.\.spec, houseTier: true \}\)/.test(blk), "a no-photo row counts only if it passes every other fence for the car (never a different car)");
ok(/bodyFamily\(b\) !== fam/.test(blk), "only rows of the typed body");
ok(/const setAsideN = asideN > 0 \? asideN : heldN;/.test(blk) && /was set aside \(\$\{setAsideN\}\)/.test(blk), "the existing \"was set aside (N)\" sentence, no new wording");
ok(/catch \(e\) \{ heldN = 0;/.test(blk), "a failed re-read never breaks today's answer");
console.log(bad ? `setAsideLineCheck: ${bad} failed` : "setAsideLineCheck: all passed");
process.exit(bad ? 1 : 0);
