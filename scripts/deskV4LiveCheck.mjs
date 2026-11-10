// DESK V4 LIVE RENDER CHECK (Lane S, Nov 10 2026). After Lane C pushes, the V4 screen is loaded on the deployed site with the crew cookie in a real browser, at 1440, 1280, 1024 and 390, and a missing card is a RED, not a pass.
// READ ONLY: it loads the page, reads what the page was given and what it printed, and builds the DRAFT report (no case edit, no write; case_pdf with draft:true stores nothing).
//   GAS_CREW_COOKIE="gas_crew=$(security find-generic-password -s goasksam-crew -w | sed 's/^gas_crew=//')" GAS_BYPASS="$(security find-generic-password -s goasksam-bypass -w)" node scripts/deskV4LiveCheck.mjs [BASE] [CASE_ID]
//   (the Keychain values are read per command and never printed or written)
// ASSERTS, per width: every centre card drawn (head, car, documents, market, closest sales, next steps, for sale now) and the Reserve panel; the case head prints the engine's title and spec line; the market card prints the engine's typicalLine, medianLine, countLine, periodLine;
//   every closest sale prints its own priceLine, milesLine, dateLine and a photo or a No photo tile; the reserve input equals the case's figure (reserve.figureLine when the server sends it); the engine's reachedLine and positionLine are on the panel;
//   no figure or sentence the server did not send (the same trace as deskV4WireCheck); no sideways scroll; no page error; the top bar prints the server's handling clock; no cookie gets the platform 404.
//   At 1440 also: the Seller report tab builds Lane D's draft PDF (case_pdf) and frames it.
import path from "node:path"; import { createRequire } from "node:module";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
const puppeteer = createRequire(path.join(ROOT, "package.json"))("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2), BASE = (args.find(a => /^https?:\/\//.test(a)) || "https://goasksam.com").replace(/\/$/, ""), ID = args.find(a => !/^https?:\/\//.test(a)) || "pv_hm";
if (!process.env.GAS_CREW_COOKIE) { console.log("FAIL set GAS_CREW_COOKIE (gas_crew=v1....) to run the live check"); process.exit(1); }
const cookieVal = process.env.GAS_CREW_COOKIE.replace(/^gas_crew=/, "");
let pass = 0, fail = 0; const out = []; const ok = (c, m) => { if (c) pass++; else { fail++; out.push("FAIL " + m); } };
const byp = process.env.GAS_BYPASS ? { "x-vercel-protection-bypass": process.env.GAS_BYPASS } : {};
const wait = ms => new Promise(r => setTimeout(r, ms));
// without the cookie: the platform 404
{ const r = await fetch(`${BASE}/preview/desk/case/${ID}`, { headers: { ...byp, "user-agent": "Mozilla/5.0" }, redirect: "manual" }); ok(r.status === 404, `no cookie gets the platform 404 (${r.status})`); }

const PROBE = () => {
  const $ = i => document.getElementById(i), K = window.__v4 && window.__v4.K(), D = window.__v4 && window.__v4.D; if (!K) return { noClient: true };
  const e = (K.desk && K.desk.evidence) || {}, text = i => ($(i) || {}).textContent || "", cards = ["s-head", "s-car", "s-docs", "s-market", "s-closest", "s-steps"].filter(i => !$(i) || !$(i).getBoundingClientRect().height);
  const rows = [...document.querySelectorAll("#comps .comp")].map(r => ({ id: r.getAttribute("data-comp"), pr: (r.querySelector(".pr") || {}).textContent || "", m: (r.querySelector(".m") || {}).textContent || "", photo: !!r.querySelector(".im:not(.none)") || !!r.querySelector(".im.none"), title: (r.querySelector(".t a") || {}).textContent || "" }));
  const byId = {}; ((K.desk && K.desk.comparables) || []).forEach(c => { byId[String(c.id)] = c; });
  const lineMiss = []; for (const r of rows) { const c = byId[r.id]; if (!c) continue; if (c.priceLine && r.pr !== c.priceLine) lineMiss.push("price " + r.id); if (c.milesLine && !r.m.includes(c.milesLine)) lineMiss.push("miles " + r.id); if (c.dateLine && !r.m.includes(c.dateLine)) lineMiss.push("date " + r.id); }
  // the trace: every digit-bearing text on the centre column and the panel is a sent string, or sent strings joined
  const M = new Set(), walk = o => { if (o == null) return; if (typeof o === "string") M.add(o.trim()); else if (typeof o === "number") M.add(String(o)); else if (typeof o === "object") for (const k in o) walk(o[k]); }; walk(K); walk(D); const arr = [...M].filter(Boolean);
  const cov = (t, d = 0) => { t = t.replace(/\s*↗/g, "").replace(/^[\s·.]+/, "").replace(/[\s·.]+$/, ""); if (!t) return true; if (arr.some(m => m === t || m.replace(/[\s·.]+$/, "") === t)) return true; if (d > 4) return false; return arr.some(m => m.length >= 4 && t.startsWith(m.replace(/[\s·.]+$/, "")) && cov(t.slice(m.replace(/[\s·.]+$/, "").length), d + 1)); };
  const allowed = el => el.closest("#ccount,#pcount,#showall,#attN,#dcount,#stepAuto,.steps .num"), bad = [];
  for (const root of [$("col"), $("val")]) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { const t = n.nodeValue.trim(); if (!t || !/\d/.test(t) || n.parentElement.closest("script,style,#newcase,select") || allowed(n.parentElement)) continue; if (!cov(t)) bad.push(t); }
    for (const i of root.querySelectorAll("input,textarea")) { if (["file", "checkbox"].includes(i.type) || i.closest("#newcase")) continue; const t = String(i.value || "").trim(); if (t && /\d/.test(t) && !allowed(i) && !cov(t)) bad.push(t); } }
  return { cards, rows: rows.length, rowsNoPhoto: rows.filter(r => !r.photo).length, lineMiss, bad, title: text("ch-title"), spec: text("ch-spec"), wantTitle: D.title, wantSpec: K.desk && K.desk.specLine,
    band: text("mBand"), wantBand: e.typicalLine, med: text("mMed"), wantMed: e.medianLine, n: text("mN"), wantN: e.countLine, per: text("mPer"), wantPer: e.periodLine, insufficient: !!e.insufficient,
    val: ($("valIn") || {}).value, wantFig: K.reserve && K.reserve.figure, figureLine: K.reserve && K.reserve.figureLine, diff: text("diff"), wantReach: K.reserve && K.reserve.reachedLine, wantPos: K.reserve && K.reserve.positionLine,
    clock: text("clock"), wantClock: K.handling && K.handling.clock, hs: document.documentElement.scrollWidth > innerWidth + 1, plot: !!document.querySelector("#plot circle"), panel: !!$("val") && $("val").getBoundingClientRect().height > 100, steps: document.querySelectorAll("#steps input").length };
};
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
for (const w of [1440, 1280, 1024, 390]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); const err = []; p.on("pageerror", e => err.push(String(e).slice(0, 160))); p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) err.push("console: " + m.text().slice(0, 120)); });
  await p.setExtraHTTPHeaders(byp); await p.setCookie({ name: "gas_crew", value: cookieVal, domain: new URL(BASE).hostname, path: "/", secure: BASE.startsWith("https"), httpOnly: true });
  const res = await p.goto(`${BASE}/preview/desk/case/${ID}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(e => ({ status: () => "load error " + e.message })); await wait(800);
  ok(res && res.status && res.status() === 200, `@${w}: the page answers 200 (${res && res.status && res.status()})`);
  const r = await p.evaluate(PROBE).catch(e => ({ noClient: true, why: String(e).slice(0, 80) }));
  if (r.noClient) { ok(false, `@${w}: the client did not start (no case on the page?) ${r.why || ""}`); await p.close(); continue; }
  const bad = [];
  if (r.cards.length) bad.push("cards missing: " + r.cards.join(", ")); if (!r.panel) bad.push("no Reserve panel");
  if (!(r.title && r.title === r.wantTitle) || (r.wantSpec && r.spec !== r.wantSpec)) bad.push(`head (${r.title} | ${r.spec})`);
  if (!r.insufficient && (r.band !== r.wantBand || r.n !== r.wantN || r.per !== r.wantPer || (r.wantMed && r.med !== r.wantMed))) bad.push(`market card (${r.band} | ${r.med} | ${r.n} | ${r.per})`);
  if (!r.insufficient && !r.plot) bad.push("no dots on the plot"); if (!r.rows) bad.push("no closest sales"); if (r.lineMiss.length) bad.push("lines not printed as sent: " + r.lineMiss.slice(0, 4).join(", ")); if (r.rowsNoPhoto) bad.push(r.rowsNoPhoto + " rows with neither a photo nor a No photo tile");
  if (r.wantFig != null && String(r.val).replace(/[^0-9]/g, "") !== String(r.wantFig)) bad.push(`reserve input ${r.val} vs the case ${r.wantFig}`); if (r.figureLine && r.val !== r.figureLine) bad.push(`reserve input ${r.val} is not the server's figureLine ${r.figureLine}`);
  if (r.wantReach && !r.diff.includes(r.wantReach)) bad.push("the engine's reachedLine is not on the panel"); if (r.wantPos && !r.diff.includes(r.wantPos)) bad.push("the engine's positionLine is not on the panel");
  if (r.wantClock && r.clock !== r.wantClock) bad.push(`clock ${r.clock}`); if (r.hs) bad.push("scrolls sideways"); if (r.bad.length) bad.push("not from the server: " + r.bad.slice(0, 4).join(" / "));
  ok(!bad.length, `@${w}: ${r.rows} closest sales, ${r.steps} steps, market ${r.band}${bad.length ? " | " + bad.join("; ") : ""}`); ok(err.length === 0, `@${w}: no page error (${err.join(" | ")})`);
  if (w === 1440) { await p.click("#n-report").catch(() => {}); await wait(5000); const f = await p.evaluate(() => ({ frame: !!document.getElementById("pdfframe"), msg: (document.getElementById("pdfmsg") || {}).textContent || "" })); ok(f.frame && /Draft/.test(f.msg), `@1440: the Seller report tab builds the draft report and frames it (${f.msg.slice(0, 80)})`); }
  await p.close();
}
await b.close();
console.log(out.join("\n")); console.log(`deskV4LiveCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
