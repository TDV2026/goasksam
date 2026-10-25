// EXACT-YEAR LINE CHECK (Lane B, Oct 25 2026), structural, no network: the line is built only for a thin (or no-cluster) answer of a car with a trim and a
// year, only from a trimless exact-year answer with 8 or more sales and a range of its own and more than one trim, never twice (noExactYearLine), and is
// appended to thinLine so every product shows it; the figure is never a headline.
import fs from "fs";
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? "ok   " : "FAIL ") + m); };
const src = fs.readFileSync(new URL("../lib/onebox.js", import.meta.url), "utf8");
const i = src.indexOf("async function exactYearLineFor"), j = src.indexOf("\nexport async function runOneBoxModelChoice", i);
const fn = src.slice(i, j), call = src.slice(src.indexOf("EXACT-YEAR LINE (Sam"), i);
ok(/d\.tier === "thin" \|\| d\.noCluster/.test(call) && /vehicle\.trim/.test(call) && /Number\(vehicle\.year\)/.test(call) && /!\(env && env\.noExactYearLine\)/.test(call), "only for a thin or no-cluster answer of a car with a trim and a year, and never twice");
ok(/thinLine: \[d\.thinLine, ey\.text\]/.test(call), "the line joins thinLine, so Market Check, Find, Tasks and Sell show the same sentence");
ok(/d2\.fallbackRung !== "exact"/.test(fn) && /rf\.salesCount\) >= 8/.test(fn), "the exact-year pool must be the exact year and hold 8 or more sales with a range");
ok(/groups\.length < 2 \|\| !total \|\| groups\[0\]\.n \/ total >= 0\.9\) return null/.test(fn), "a single clean cluster adds nothing");
ok(/mixed trims \(/.test(fn) && /All \$\{name\}:/.test(fn), "the line states the trim mix: All {year} {model} {body}s: N sales, $low to $high, mixed trims (...)");
ok(!/referenceFigure\s*:|cluster\s*:/.test(call), "it sets no reference figure and no cluster: never the headline");
console.log(bad ? `exactYearLineCheck: ${bad} failed` : "exactYearLineCheck: all passed"); process.exit(bad ? 1 : 0);
