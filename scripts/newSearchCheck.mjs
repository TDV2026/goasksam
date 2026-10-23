// NEW SEARCH, FOUR WAYS IN (Sam's order, Oct 21 2026; Lane C): (1a) Buy's bottom bar says 'Search any car, or tell Sam what to change'; (1b) '+ New search'
// is the FIRST line of the rail's own section on Buy (above the list), Market Check (its start page, /market-check) and Tasks (/tasks);
// (1c) the rail's Buy link opens Buy's start page; (1d) removing the last chip opens Buy's start page; Market Check's top box selects its
// text on focus. The pages' real handlers are rendered in-process. No network.   node scripts/newSearchCheck.mjs   (from the repo root)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
process.env.LAUNCH_STAGE = "2";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const render = async (mod, url, query) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(resolve => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { resolve(String(b)); return res; }, end(b) { resolve(String(b || "")); return res; }, json(o) { resolve(JSON.stringify(o)); return res; }, writeHead() { return res; }, write() {}, redirect() { resolve(""); return res; } };
    Promise.resolve(h({ method: "GET", url, query, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => resolve("")); setTimeout(() => resolve(""), 20000); }); };
const buy = await render("buy", "/buy", {}), mc = await render("marketCheck", "/market-check", {}), tk = await render("tasksPage", "/tasks", {}), tm = await render("tasksPage", "/tasks/mine", { app: "1" });
ok(/<div class="rh">Your searches<\/div><button type="button" class="newbtn" id="newsearch">\+ New search<\/button><div id="searches"><\/div>/.test(buy), "Buy: '+ New search' is the first line of Your searches, above the list");
ok(/<div class="gas-rail-extra"><a class="gas-navitem gas-newsearch" href="\/market-check">\+ New search<\/a><a class="gas-navitem" id="gas-nav-results"/.test(mc), "Market Check: '+ New search' first in its rail section, opening /market-check");
ok(/<div class="gas-rail-extra"><a class="gas-navitem gas-newsearch" href="\/tasks">\+ New search<\/a><\/div>/.test(tk) && /gas-newsearch" href="\/tasks"/.test(tm), "Tasks (landing and app view): '+ New search' opening /tasks");
const cl = JSON.parse(/^const CLIENT = (".*");$/m.exec(fs.readFileSync(path.join(ROOT, "api/buy.js"), "utf8"))[1]);
ok(/PH_FOLLOW_WIDE = "Search any car, or tell Sam what to change"/.test(cl), "Buy's bottom-bar placeholder: 'Search any car, or tell Sam what to change'");
ok(/closest\('#gas-rail a\.gas-navitem\[href="\/buy"\]'\)/.test(cl) && /return goStart\(true\);/.test(cl.slice(cl.indexOf("1c: the rail's own"))), "the rail's Buy link opens Buy's start page (goStart)");
ok(/if \(!filterParts\(cur\)\.length\) return goStart\(true\);/.test(cl), "removing the last chip opens Buy's start page");
ok(/\$\("newsearch"\)\.addEventListener\("click", function\(\)\{ goStart\(true\); \}\);/.test(cl) && /closest\("\[data-newsearch\]"\)/.test(cl), "'+ New search' (rail and phone list) opens Buy's start page");
const ob = fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8");
ok(/input\.addEventListener\("focus", function \(\) \{ try \{ input\.select\(\); \} catch \(e\) \{\} \}\);/.test(ob), "Market Check's top box selects its text on focus");
console.log(`newSearchCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
