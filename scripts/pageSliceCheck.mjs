// A CHECK LOCATES PAGE CODE BY NAME, NEVER BY ITS SIGNATURE OR A LINE OF IT (Lane E, Nov 3 2026).
// 1) nearBandPagesCheck cut a function's option block out by text and ran the cut alone; when drawerHtml gained a variable above the cut (apart) it threw ReferenceError.
// 2) buyStage1cCheck and findSalesButtonCheck found drawerHtml and mdRowHtml by their full signature ("  function drawerHtml(l, j){"); drawerHtml gained a parameter (l, j, pk) and both crashed with "missing function".
// CLASS: any check that finds page code by a pinned signature with parameters, or by a typed-out indented line of code (a slice start or end inside a function), breaks the day that code moves or grows an argument.
// RULE: find a function by NAME ("  function name(") or with fnBlock(src, name) (scripts/_pageLift.mjs), and lift whole declarations. This scans every check: a locator argument (block/line/grab/fn/fnSrc/indexOf/lift/between) that is a signature with
// parameters, or a typed-out statement indented 4+ spaces, fails. Self-test: the old drawerHtml(l, j){ and "    lastDraw = d;" locators are flagged.
//   node scripts/pageSliceCheck.mjs
import fs from "fs";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const CALL = "(?:block|line|grab|fn|fnSrc|between|lift|indexOf)\\(\\s*(?:\\w+,\\s*)?(?:\"[^\"\\n]*\"\\s*,\\s*)?";
const SIG = new RegExp(CALL + "([\"'`]) *function\\s+\\w+\\s*\\(\\s*[^)\\s\"'`][^)\"'`]*\\)");
const STMT = new RegExp(CALL + "([\"'`]) {4,}(?:var|let|const|if|for|while|return|else|try|switch|[a-zA-Z_$][\\w$.]* =|[a-zA-Z_$][\\w$.]*\\()");
const runs = t => /new Function\(|runInContext\(|runInNewContext\(|\.indexOf\(|block\(/.test(t);
export const pinned = text => runs(text) && (SIG.test(text) || STMT.test(text));
ok("self-test: a pinned signature with parameters is flagged", pinned(`const dr = block("  function drawerHtml(l, j){", "  function openDrawer(btn){");`));
ok("self-test: a pinned end line inside a function is flagged", pinned(`const ds = block("  function drawSearch(", "    lastDraw = d;");`));
ok("self-test: a slice that starts at an indented statement is flagged", pinned(`const a = CL.indexOf("    var fa1 = m && m.findAnswer");`));
ok("self-test: a lookup by name is not flagged", !pinned(`const dr = block("  function drawerHtml(", "  function openDrawer("); const f = fnBlock(c, "drawSearch");`));
const bad = [];
for (const f of fs.readdirSync("scripts").filter(x => /\.(mjs|js)$/.test(x) && x !== "pageSliceCheck.mjs")) { const t = fs.readFileSync("scripts/" + f, "utf8"); if (pinned(t)) bad.push(f); }
ok(`no check finds page code by a pinned signature or a typed-out line (${bad.length ? bad.join(", ") : "every lookup is by name"})`, bad.length === 0);
console.log(`pageSliceCheck: ${failed ? failed + " FAIL" : "all pass"}`); process.exit(failed ? 1 : 0);
