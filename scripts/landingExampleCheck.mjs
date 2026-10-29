// THE LANDING EXAMPLES NEVER SHOW EMPTY FOR A SPLIT CAR (Lane B e101, Sam Oct 29 2026). Since e96 the engine answers a split or apart car with cluster null and the options as headlineLines; the stored examples
// (lib/live/marketCheckExample.js, lib/live/deskExample.js via exampleAnswer.js) now keep that answer as it is. Rule: any page that reads a stored example's range (cluster) prints example.headlineLines when the
// range is null, and never prints a range of its own. Read today: NO page draws the Market Check example band (the landing is the start page; only usageDashboard and the nightly script read the row), and the
// Desk page (api/business.js) prints label and soldCount per generation, the compare and the three sales, never a range. So the check covers the CLASS: every page file that reads an example's cluster must also read
// headlineLines, and a split example rendered through each reader prints its lines, not an empty band.   node scripts/landingExampleCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const files = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules|\.git|docs|screens|proofs/.test(e.name)) walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); } };
["api", "lib", "public/js"].forEach(walk);
const READS = /marketCheckExample|deskExample|landing-example|desk-example|exampleAnswer/;
const SKIP = /^(lib\/live\/(marketCheckExample|deskExample|exampleAnswer)\.js|api\/usageDashboard\.js)$/;   // the builders and the ops task store, they do not draw
const readers = files.filter(f => !SKIP.test(f) && READS.test(fs.readFileSync(f, "utf8")));
ok(readers.length >= 1, `the pages that read a stored example are found (${readers.join(", ")})`);
for (const f of readers) { const s = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "");
  const readsRange = /\.cluster\b|clusterLow|low_usd|high_usd/.test(s);
  ok(!readsRange || /headlineLines/.test(s), `${f}: reads an example's range, so it also prints headlineLines when the range is null`);
  ok(!/\bexample\.cluster\[0\][^\n]*\bexample\.cluster\[1\]/.test(s) || /headlineLines/.test(s), `${f}: no band of its own from cluster ends`); }
// the one Desk reader renders a split generation (cluster null, headlineLines) without an empty or invented figure
const biz = fs.readFileSync("api/business.js", "utf8");
ok(!/g\.cluster|gens\[[^\]]*\]\.cluster/.test(biz) || /headlineLines/.test(biz), "api/business.js: the Desk worked example prints no generation range, or prints headlineLines beside it");
ok(/g\.soldCount/.test(biz) && /g\.label/.test(biz), "api/business.js: each generation row prints its label and sold count, which a split car has");
console.log(`landingExampleCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
