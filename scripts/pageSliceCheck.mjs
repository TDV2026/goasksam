// A CHECK MAY NOT RUN A FRAGMENT OF A PAGE FUNCTION (Lane E, Nov 3 2026). nearBandPagesCheck cut the option block out of api/buy.js drawerHtml by text (from "    var fa1") and ran the cut alone; when drawerHtml gained a variable
// declared above the cut (apart) the cut threw ReferenceError and the check crashed. CLASS: any check that lifts page code by text and runs it, starting INSIDE a function body, breaks the day the function declares something above the cut.
// RULE: a check lifts a whole declaration (from "  function name(" to the next declaration) and stubs only what it calls. This scans every check for a lift that starts at an indented statement (4+ spaces then var/if/for/return/else)
// beside new Function / vm.runInContext, and fails on it. Self-test: the old nearBandPagesCheck lift is flagged.
//   node scripts/pageSliceCheck.mjs
import fs from "fs";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const MID = /indexOf\(\s*["'`] {4,}(?:var|if|for|while|return|else|try|switch)\b/;
const runs = t => /new Function\(|runInContext\(|runInNewContext\(/.test(t);
export const midFunctionLift = text => runs(text) && MID.test(text);
const old = `const a = CL.indexOf("    var fa1 = m && m.findAnswer"); const f = new Function("esc", "m", CL.slice(a, b));`;
ok("self-test: a lift that starts at an indented statement inside a function is flagged", midFunctionLift(old));
ok("self-test: a lift of a whole declaration is not flagged", !midFunctionLift(`const s = CL.indexOf("  function drawerHtml("); const f = new Function(CL.slice(s, e));`));
const bad = [];
for (const f of fs.readdirSync("scripts").filter(x => /\.(mjs|js)$/.test(x) && x !== "pageSliceCheck.mjs")) { const t = fs.readFileSync("scripts/" + f, "utf8"); if (midFunctionLift(t)) bad.push(f); }
ok(`no check runs a fragment of a page function (${bad.length ? bad.join(", ") : "all lifts start at a declaration"})`, bad.length === 0);
console.log(`pageSliceCheck: ${failed ? failed + " FAIL" : "all pass"}`); process.exit(failed ? 1 : 0);
