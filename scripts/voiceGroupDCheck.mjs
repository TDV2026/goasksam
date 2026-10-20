// COMPANY VOICE, GROUP D (Sam, Oct 20 2026: company 'we' only, never first-person Sam, no 'our records' or 'our data';
// Lane E's sweep and Lane F's drafts): the home platform notes, About, PowerSellers, the /sell PowerSeller disclosure and
// the Tasks page. No network.
//   node scripts/voiceGroupDCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const home = src("public/js/homepage.js"), about = src("public/about.html"), ps = src("public/powersellers.html"), entry = src("public/js/entry.js"), tasks = src("api/tasksPage.js");
ok(/across the tracked online auction platforms\./.test(home) && (home.match(/Its sold results are tracked\./g) || []).length === 6 && /Its sold results are tracked for Mercedes-Benz vehicles\./.test(home) && /"More online platforms are being added\."/.test(home), "home: the platform notes without 'we track'");
ok(!/we track|We track|data we track/.test(home), "home: no 'we track' left");
ok(/from the tracked auction platforms/.test(about) && /Every figure you see comes from a real recorded sale\./.test(about) && !/in our records|platforms we track/.test(about), "About: no 'our records', no 'we track'");
ok(/And where the data exists, it is shown\./.test(ps) && !/where we have the data/.test(ps), "PowerSellers: no 'where we have the data'");
ok(/GoAskSam has commercial arrangements with some of the PowerSellers it works with, and nobody can pay to be recommended\./.test(entry) && !/We have commercial arrangements/.test(entry), "the PowerSeller disclosure reads 'GoAskSam has ...'");
ok(/const HOW = "The cars Sam shows you come from a rules-based matching algorithm\. Sam helps understand the question and explain the results, but never invents the cars, the matches or the numbers\./.test(tasks), "Tasks: How it works, no 'our' and no 'AI helps'");
ok(/\["Who chooses the cars\?", "A rules-based matching algorithm decides which live cars match your Task/.test(tasks) && !/Does AI choose the cars|our rules-based|AI helps/.test(tasks), "Tasks: the FAQ, 'Who chooses the cars?', no 'AI' line, no possessive");
for (const [f, t] of [["home", home], ["about", about], ["powersellers", ps], ["tasks", tasks]]) ok(!/\bour (own )?(records?|data|archive|sales data)\b/i.test(t), `${f}: no 'our records' or 'our data'`);
ok(![home, about, ps, entry, tasks].some(t => /[–—]/.test(t.match(/tracked online auction platforms|Its sold results are tracked|real recorded sale|where the data exists|GoAskSam has commercial|rules-based matching algorithm/g)?.join("") || "")), "no dashes in the new lines");
console.log(`voiceGroupDCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
