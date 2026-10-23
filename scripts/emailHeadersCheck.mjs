// Every Task email send carries List-Unsubscribe and List-Unsubscribe-Post, and a text twin (Sam, Oct 23 2026). Static: reads the senders. Offline.
import fs from "node:fs"; import path from "node:path";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const root = new URL("..", import.meta.url).pathname, files = [];
const walk = d => { for (const f of fs.readdirSync(path.join(root, d))) { const p = path.join(d, f), st = fs.statSync(path.join(root, p)); if (st.isDirectory()) walk(p); else if (f.endsWith(".js")) files.push(p); } };
["api", "lib"].forEach(walk);
const EXEMPT = new Set(["api/businessLead.js"]);   // a request to Sam's own inbox from the Desk form, not a Task email
let n = 0;
for (const f of files) { if (EXEMPT.has(f)) continue; const s = fs.readFileSync(path.join(root, f), "utf8"); for (const m of s.matchAll(/sendTaskEmail\(\{([^}]*)\}\)/g)) { n++; const a = m[1]; ok(/headers/.test(a), `${f}: a sendTaskEmail call without headers (List-Unsubscribe): ${a.slice(0, 80)}`); ok(/text/.test(a), `${f}: a sendTaskEmail call without a text twin`); } }
ok(n >= 8, "found the senders (" + n + ")");
const em = fs.readFileSync(path.join(root, "lib/_email.js"), "utf8");
ok(/text, html, headers/.test(em), "sendTaskEmail passes text, html and headers to the provider");
console.log(`emailHeadersCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
