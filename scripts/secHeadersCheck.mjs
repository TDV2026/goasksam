// SECURITY HEADERS (security F-05, Sam approved Oct 21 2026; Lane C): every path carries X-Frame-Options SAMEORIGIN and an
// enforced frame-ancestors 'self', nosniff, strict-origin-when-cross-origin, a Permissions-Policy that keeps the mic for the
// site itself, and the script policy in REPORT-ONLY mode reporting to /api/cspReport (nothing blocked until Sam says so).
// No network.   node scripts/secHeadersCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { reportLine, REPORT_MAX_BYTES } from "../api/cspReport.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const blk = (v.headers || []).find(h => h.source === "/(.*)"), H = Object.fromEntries(((blk && blk.headers) || []).map(h => [h.key, h.value]));
ok(H["X-Frame-Options"] === "SAMEORIGIN" && H["Content-Security-Policy"] === "frame-ancestors 'self'", "no other site can frame a page (X-Frame-Options and an enforced frame-ancestors)");
ok(H["X-Content-Type-Options"] === "nosniff" && H["Referrer-Policy"] === "strict-origin-when-cross-origin", "nosniff; referrers carry only the origin to other sites");
ok(/microphone=\(self\)/.test(H["Permissions-Policy"] || "") && /camera=\(\)/.test(H["Permissions-Policy"]) && /geolocation=\(\)/.test(H["Permissions-Policy"]), "the mic stays for the site (Buy and Sell use it); camera and location off");
const ro = H["Content-Security-Policy-Report-Only"] || "";
ok(/report-uri \/api\/cspReport/.test(ro) && /object-src 'none'/.test(ro) && /base-uri 'self'/.test(ro) && /default-src 'self'/.test(ro), "the script policy is report-only and reports to /api/cspReport");
ok(!Object.keys(H).some(k => k === "Content-Security-Policy" && /script-src/.test(H[k])), "no script policy is enforced yet");
ok(/script-src [^;]*https:\/\/www\.googletagmanager\.com[^;]*https:\/\/challenges\.cloudflare\.com/.test(ro) && /connect-src [^;]*https:\/\/otkmxyrglikdoychnmvy\.supabase\.co/.test(ro), "the hosts the pages load (analytics, Turnstile, Supabase) are named");
// The report endpoint: one trimmed line per report, never a full address, nothing over the size cap.
const l = reportLine(JSON.stringify({ "csp-report": { "document-uri": "https://goasksam.com/buy?q=my+car", "effective-directive": "script-src-elem", "blocked-uri": "https://cdn.example/x.js?token=abc" } }));
ok(l && l.length === 1 && l[0] === "csp_report script-src-elem blocked=https://cdn.example page=/buy", "a report becomes one line: directive, the blocked origin, the page path (no query)");
ok(reportLine("x".repeat(REPORT_MAX_BYTES + 1)) === null && reportLine("not json") === null, "oversized or broken reports are dropped");
ok(reportLine([{ type: "csp-violation", body: { documentURL: "https://goasksam.com/sell", effectiveDirective: "img-src", blockedURL: "inline" } }])[0] === "csp_report img-src blocked=inline page=/sell", "the newer Reporting API shape too");
console.log(`secHeadersCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
