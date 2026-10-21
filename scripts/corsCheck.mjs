// ONE CORS HELPER (security F-06, Sam approved Oct 21 2026; Lane C): only GoAskSam's own hosts get a cross-origin answer;
// "*" only for the daily pulse and the page-view pixel (and mcp, a protocol endpoint, flagged for Sam). No network.
//   node scripts/corsCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { cors, allowedOrigin } from "../lib/_cors.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const run = (origin, opts) => { const h = {}; cors({ headers: origin ? { origin } : {} }, { setHeader: (k, v) => { h[k.toLowerCase()] = v; } }, opts); return h; };
ok(run("https://goasksam.com")["access-control-allow-origin"] === "https://goasksam.com", "the site gets its own origin back");
ok(run("https://www.goasksam.com")["access-control-allow-origin"] === "https://www.goasksam.com", "www too");
ok(run("https://goasksam-r49r3jxay-sam-s-projects-4277cbfa.vercel.app")["access-control-allow-origin"] === "https://goasksam-r49r3jxay-sam-s-projects-4277cbfa.vercel.app", "this project's preview hosts");
for (const o of ["https://evil.example", "https://goasksam.com.evil.example", "https://goasksam-x-other-team.vercel.app", "http://goasksam.com", "null", "https://notgoasksam.com"]) ok(!("access-control-allow-origin" in run(o)) && run(o).vary === "Origin", `${o}: no cross-origin answer`);
ok(!("access-control-allow-origin" in run(null)), "no Origin (same-origin or a server): no header needed");
ok(run("https://evil.example", { pub: true })["access-control-allow-origin"] === "*", "pub: '*' for a public static read");
ok(allowedOrigin("https://goasksam.com") && !allowedOrigin("https://goasksam.com/") && !allowedOrigin(""), "exact origins only");
const api = f => fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8");
for (const f of ["sellerDecision", "chat", "vehicleIdentity", "account", "hunts", "funnel", "submitSellerLead", "publicConfig", "desk", "usageDashboard"]) {
  const s = api(f);
  ok(!/Access-Control-Allow-Origin", "\*"/.test(s) && /import \{ cors as gasCors \} from "\.\.\/lib\/_cors\.js";/.test(s) && /gasCors\(req/.test(s), `${f}: through the helper, no "*"`);
}
for (const f of ["dailyPulse", "pageview"]) ok(/gasCors\(req, res, \{[^}]*pub: true \}\)/.test(api(f)), `${f}: "*" kept (public static read)`);
const all = fs.readdirSync(new URL("../api/", import.meta.url)).filter(f => f.endsWith(".js")).filter(f => /Access-Control-Allow-Origin", "\*"/.test(api(f.replace(/\.js$/, ""))));
ok(JSON.stringify(all) === JSON.stringify(["mcp.js"]), "the only literal '*' left is mcp (got " + all.join(",") + ")");
console.log(`corsCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
