// LIVE CHECKS DO NOT JUDGE A SLOW ANSWER ON A FIXED WAIT (Lane S, Nov 14 2026). Cause: deskV4LiveCheck clicked the Seller report tab, slept 5 s and judged whatever was there, so a report build that took 6 s failed the check and a fast one wasted time.
// CLASS: any live check that acts, sleeps a fixed 2 s or more, then asserts. The Desk live checks (deskV4LiveCheck, livePreviewCheck) must have none: they poll the read up to 20 s and fail only on timeout. Every other live script is held to the count swept on Nov 14 2026 (OTHERS below),
// so a new fixed wait fails here until it is polled or named. Offline: it reads the scripts' text only.
//   node scripts/liveWaitsCheck.mjs [repo root]
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let fail = 0, n = 0; const ok = (c, name, d) => { n++; if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && d ? "  " + d : ""}`); };
const FIXED = /\b(?:wait|settle)\(\s*(\d{4,})\s*\)|setTimeout\(\s*\w+2?\s*,\s*(\d{4,})\s*\)|waitForTimeout\(\s*(\d{4,})\s*\)/g;
const fixedIn = text => { const hits = []; text.split("\n").forEach((l, i) => { for (const m of l.matchAll(FIXED)) { const ms = Number(m[1] || m[2] || m[3]); if (ms >= 2000) hits.push(`${i + 1}:${ms}`); } }); return hits; };
const DESK = ["deskV4LiveCheck.mjs", "livePreviewCheck.mjs"];
const OTHERS = { "amazonTypedLive.mjs": 1, "buy1fLive.mjs": 2, "e98LiveCheck.mjs": 2, "goLiveLiveCheck.mjs": 15, "goLiveShots.mjs": 5, "goLiveSignedInCheck.mjs": 1 };   // swept Nov 14 2026, other lanes' pages (Buy, Sam box, goLive): left as they are, counts named here
const dir = path.join(root, "scripts"), files = fs.readdirSync(dir).filter(f => /live/i.test(f) && /\.(mjs|js)$/.test(f) && f !== "liveWaitsCheck.mjs");
for (const f of DESK) { const t = fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : ""; const h = fixedIn(t); ok(t.length > 0 && h.length === 0, `${f}: no fixed wait of 2 s or more before an assertion`, h.join(" ")); }
{ const t = fs.readFileSync(path.join(dir, "deskV4LiveCheck.mjs"), "utf8"); ok(/pollUntil\([\s\S]{0,400}20000\)/.test(t) && /pdfframe/.test(t), "deskV4LiveCheck polls for the Seller report up to 20 s"); }
for (const f of files.filter(x => !DESK.includes(x))) { const h = fixedIn(fs.readFileSync(path.join(dir, f), "utf8")), allow = OTHERS[f] ?? 0; ok(h.length <= allow, `${f}: fixed waits of 2 s or more ${h.length}, swept count ${allow}`, h.join(" ")); }
console.log(`liveWaitsCheck: ${n - fail} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
