// COMPANY VOICE, GROUP A (Sam, Oct 20 2026, "company we only"; Lane E's sweep): the visible bid label reads "Last bid
// seen", never "Last bid we saw", on Buy, Market Check, the VIN pages and the Tasks page. No network.
//   node scripts/voiceGroupACheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const code = s => s.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
const buy = src("api/buy.js"), client = code(JSON.parse(/^const CLIENT = (".*");$/m.exec(buy)[1]));
ok(/"Last bid seen " \+ amt \+ bidAt\(/.test(client) && /<p class="bid">Last bid seen: <span class="amt">/.test(client), "Buy: the card's bid text and line read 'Last bid seen'");
ok(/<th class="colhead">Last bid seen<\/th>/.test(src("public/js/onebox.js")), "Market Check: the live table's column reads 'Last bid seen'");
ok(/el\.textContent = "Last bid seen: " \+/.test(src("api/history.js")), "VIN pages: 'Last bid seen: {amount} at {time}'");
ok(/return "Last bid seen: " \+ money\(c\.bid_usd\)/.test(src("api/tasksPage.js")), "Tasks page: 'Last bid seen'");
for (const f of ["api/history.js", "public/js/onebox.js", "api/tasksPage.js"]) ok(!/Last bid we saw/.test(code(src(f))), `${f}: no 'Last bid we saw' left in live code`);
ok(!/Last bid we saw/.test(client), "Buy client: no 'Last bid we saw' left");
console.log(`voiceGroupACheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
