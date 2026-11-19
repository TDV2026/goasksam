// keyedCompareCheck: every comparison of a request value with PROBE_KEY, OPS_KEY, CRON_SECRET or a crew/tester code must go
// through lib/_credential.js (hasServerCredential / hasHeaderKey) or crypto.timingSafeEqual, never == / === / !==.
// Class: a secret compared with a plain operator leaks by timing and lets a route drift from the one shared gate.
import fs from "node:fs"; import path from "node:path";
const root = process.argv[2] || process.cwd();
const SECRET = "(?:PROBE_KEY|OPS_KEY|CRON_SECRET|CURTAIN_CREW_CODE|CURTAIN_TESTER_CODE|PARTNER_KEY|PARTNER_DEMO_CODE)";
const bad = [
  new RegExp("[!=]==?\\s*(?:`Bearer \\$\\{)?process\\.env\\." + SECRET),          // x === process.env.SECRET
  new RegExp("process\\.env\\." + SECRET + "\\}?`?\\s*[!=]==?"),                   // process.env.SECRET === x
  new RegExp("[!=]==?\\s*`Bearer \\$\\{process\\.env\\." + SECRET)                  // === `Bearer ${process.env.CRON_SECRET}`
];
const skip = new Set([path.join("lib", "_credential.js")]);
const hits = [];
(function walk(d) {
  for (const n of fs.readdirSync(path.join(root, d))) {
    const rel = path.join(d, n), st = fs.statSync(path.join(root, rel));
    if (st.isDirectory()) { if (n !== "node_modules") walk(rel); continue; }
    if (!/\.m?js$/.test(n) || skip.has(rel)) continue;
    fs.readFileSync(path.join(root, rel), "utf8").split("\n").forEach((l, i) => { if (!/^\s*\/\//.test(l) && bad.some(r => r.test(l))) hits.push(`${rel}:${i + 1}`); });
  }
})("api"); 
(function walk(d) { for (const n of fs.readdirSync(path.join(root, d))) { const rel = path.join(d, n), st = fs.statSync(path.join(root, rel)); if (st.isDirectory()) { walk(rel); continue; } if (!/\.m?js$/.test(n) || skip.has(rel)) continue; fs.readFileSync(path.join(root, rel), "utf8").split("\n").forEach((l, i) => { if (!/^\s*\/\//.test(l) && bad.some(r => r.test(l))) hits.push(`${rel}:${i + 1}`); }); } })("lib");
if (hits.length) { console.log("FAIL keyedCompareCheck: " + hits.length + " plain comparison(s) of a secret:\n  " + hits.join("\n  ")); process.exit(1); }
// Behaviour: the shared helpers accept only the header forms (a key in a body or address is never read).
process.env.PROBE_KEY = "pk-test"; process.env.CRON_SECRET = "cron-test";
const C = await import(path.join(path.resolve(root), "lib", "_credential.js"));
const beh = [
  [C.hasHeaderKey({ headers: { "x-ops-key": "pk-test" } }) === true, "hasHeaderKey accepts the key in x-ops-key"],
  [C.hasHeaderKey({ headers: {}, body: { key: "pk-test" }, query: { key: "pk-test" } }) === false, "hasHeaderKey refuses a key in the body or address"],
  [C.hasHeaderKey({ headers: { authorization: "Bearer cron-test" } }) === false, "hasHeaderKey refuses the cron bearer (no cron calls these routes)"],
  [typeof C.cronOk === "function" && C.cronOk({ headers: { authorization: "Bearer cron-test" } }) === true, "cronOk accepts the cron bearer"],
  [typeof C.cronOk === "function" && C.cronOk({ headers: { authorization: "Bearer nope" } }) === false && C.cronOk({ headers: { "x-ops-key": "pk-test" } }) === false, "cronOk refuses a wrong bearer and a probe key"]
];
const badBeh = beh.filter(([ok]) => !ok);
if (badBeh.length) { console.log("FAIL keyedCompareCheck behaviour:\n  " + badBeh.map(x => x[1]).join("\n  ")); process.exit(1); }
console.log("PASS keyedCompareCheck: no plain comparison of a secret in api/ or lib/; " + beh.length + " helper behaviours hold");
