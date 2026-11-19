// NO ERROR DETAIL TO THE BROWSER (Lane S review of a615b64a, Oct 27 2026): a 500 from sellerDecision, vehicleIdentity, chat, account, hunts, submitSellerLead, desk or tasks is one fixed
// plain sentence (lib/_fail.js); the detail (which can carry a table name, a path, a database reply) goes to the server log. The keyed ops routes (server credential only) are the one
// exception and are named below. No network.   node scripts/errorTextCheck.mjs
import fs from "node:fs";
import path from "node:path";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const { failBody, CALM_FAIL } = await import("../lib/_fail.js");
const logged = []; const realErr = console.error; console.error = (...a) => logged.push(a.join(" "));
const body = failBody("test", new Error('relation "public.secret_table" does not exist at /rest/v1/x?key=abc'));
console.error = realErr;
ok(body.error === CALM_FAIL && Object.keys(body).length === 1 && !/secret_table|rest\/v1|abc/.test(JSON.stringify(body)), "failBody returns the one fixed sentence and nothing of the error");
ok(logged.length === 1 && /secret_table/.test(logged[0]), "the detail goes to the server log");
ok(!/[–—]/.test(CALM_FAIL) && /^Something went wrong/.test(CALM_FAIL), "the sentence is plain, no dashes");
const OPS = new Set(["admin.js", "pullLive.js", "refreshSpecLiveCounts.js", "usageDashboard.js"]);   // keyed, server credential or cron only
for (const f of fs.readdirSync("api").filter(x => x.endsWith(".js") && !OPS.has(x))) {
  const src = fs.readFileSync(path.join("api", f), "utf8");
  const bad = src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /\.json\(/.test(l) && /\b(err|e|error|ex)\.message\b|String\(\(?(e|err) && (e|err)\.message/.test(l) && !/Resend|resend|api\.resend/.test(l));
  ok(bad.length === 0, `api/${f}: no response carries an error message` + (bad.length ? " (line " + bad.map(b => b[0]).join(",") + ")" : ""));
}
for (const f of ["sellerDecision", "vehicleIdentity", "chat", "account", "hunts", "submitSellerLead", "desk", "tasks"]) {
  const src = fs.readFileSync(`api/${f}.js`, "utf8");
  ok(/import \{ failBody \} from "\.\.\/lib\/_fail\.js"/.test(src) && /status\(500\)\.json\(failBody\(/.test(src), `api/${f}.js: its 500 is the fixed sentence (failBody)`);
}
console.log(`errorTextCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
