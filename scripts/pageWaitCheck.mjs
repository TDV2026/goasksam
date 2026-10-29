// NO PAGE CARRIES A WAIT OF ITS OWN FOR A COLD ANSWER (Sam, Oct 29 2026; Lane B's cold wait, one engine constant: waitMaxMs, with retryAfterMs, on the computing answer, on market.waitMaxMs of a pending Find or Tasks card and on the partner answer).
// Cause: Find, Tasks, the history hubs and the partner demos each carried a literal 45 seconds (and a 2 second fallback) for how long to keep asking, while the engine keeps the compute alive 85. Class: a number in a page that belongs to the engine.
// 1) every page source is scanned for a literal wait next to the cold clock; 2) in Chrome, on a scaled clock (GAS_WAIT_SCALE), the engine sends waitMaxMs 85000 and the answer lands at 60 s: Find and Market Check must draw it, and with waitMaxMs 20000 and
// the answer at 30 s they must give up at the ENGINE's 20 s, never at a number of their own; 3) the history hub's placeholder takes its two numbers from the engine's market.   node scripts/pageWaitCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startBrowser, pageHtml, openMC, ROOT } from "./e98Render.mjs";
import { buildCards } from "./e98FindRender.mjs";
import { MC, BLACK_BMW } from "./e98Fixtures.mjs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// ---- 1. the page sources
const FILES = ["api/buy.js", "api/tasksPage.js", "api/history.js", "api/partnerDemo.js", "api/_amazonDemo.js", "api/partnerAnswer.js", "api/marketCheck.js", "api/home.js", "api/sellPage.js", "api/sellNext.js", "api/business.js", "api/about.js", "api/howSamDecides.js", "api/feedback.js", "api/specPage.js", "lib/startPage.js", "lib/appShell.js"];
const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && !/Fixture/.test(e.name)) FILES.push(p); } };
walk("public/js"); walk("lib/sell"); walk("lib/tasks");
const BAD = [[/\b(?:45|85|90)000\b/, "a cold-wait literal (45000, 85000, 90000)"], [/\b(?:COLD_MAX|WAIT_MAX|COLD_WAIT(?:_MS)?|COLDWAIT)\b/, "a wait constant of the page's own"], [/waitMaxMs\s*\)?\s*\|\|\s*\d/, "a fallback wait (waitMaxMs || <number>)"], [/retryAfterMs\s*\)?\s*\|\|\s*\d|retryAfterMs\s*>\s*0\s*\?\s*[\w.]*retryAfterMs\s*:\s*\d/, "a fallback retry (retryAfterMs || <number>)"], [/>=\s*\(?\s*(?:45|85)\s*\*\s*1000/, "seconds times 1000 against the cold clock"]];
let scanned = 0;
for (const f of new Set(FILES)) { if (!fs.existsSync(path.join(ROOT, f))) continue; let raw = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (f === "api/buy.js") { const m = /^const CLIENT = (".*");$/m.exec(raw); if (m) raw += "\n" + JSON.parse(m[1]); }   // the Find page's browser code is one JSON string
  const code = raw.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\s\/\/ .*$/, "")).join("\n"); scanned++;
  for (const [re, what] of BAD) { const m = re.exec(code); ok(!m, `${f}: no wait number of the page's own${m ? " (" + what + ": " + code.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, " ") + ")" : ""}`); } }
ok(scanned > 30, `${scanned} page sources were scanned`);
// ---- 2. Chrome
const b = await startBrowser(), SC = 0.02;   // 85 s is 1.7 s; 60 s is 1.2 s; 45 s would be 0.9 s; 20 s is 0.4 s; 2 s is 40 ms
const { default: _x } = { default: null };
const cards = await buildCards([BLACK_BMW["2015 BMW Z4 sDrive35is"]]), real = cards[0].market;
const findRun = async (wait, landAfter) => {
  const html = await pageHtml("api/buy.js", "/buy", false), p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); let t0 = null;
  await p.evaluateOnNewDocument(sc => { window.GAS_WAIT_SCALE = sc; window.gasTrack = () => {}; }, SC);
  const pending = { kind: "pending", stillReading: true, line: "Sam is reading the sales for this one.", retry: true, retryAfterMs: 2000, waitMaxMs: wait };
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let q = {}; try { q = JSON.parse(r.postData() || "{}"); } catch {}
      if (q.action === "chat") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "ok", turns: 1, state: { filters: { make: "BMW" } }, meta: { count: 1, total: 1, narrow: "none" }, cards: [{ ...cards[0], market: pending, sam_lines: [] }] }) });
      if (q.action === "enrich") { t0 = t0 || Date.now(); const landed = Date.now() - t0 >= landAfter * SC; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: [{ id: cards[0].id, market: landed ? real : pending, sam_lines: landed ? cards[0].sam_lines : [] }] }) }); }
      return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/buy", { waitUntil: "networkidle2" }).catch(() => {}); await p.waitForSelector("#hq", { timeout: 5000 }).catch(() => {}); await p.type("#hq", "bmw"); await p.keyboard.press("Enter");
  await new Promise(r => setTimeout(r, wait * SC + 1200)); const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ")); await p.close(); return txt; };
{ const a = await findRun(85000, 60000); ok(/\$38,000 to \$52,000/.test(a) && !/could not be read yet|couldn.t read this one yet/i.test(a), "Find: waitMaxMs 85000 and the answer at 60 s: the card draws the answer, not the could-not line"); }
{ const a = await findRun(20000, 30000); ok(/could not be read yet|couldn.t read this one yet/i.test(a) && !/\$38,000 to \$52,000/.test(a), "Find: waitMaxMs 20000 and the answer at 30 s: the card gives up at the ENGINE's 20 s (not at a number of its own)"); }
const mcRun = async (wait, landAfter) => { let t0 = null; const fx = { ...MC["2001 BMW M3 (alike with options)"], respond: n => { t0 = t0 || Date.now(); return Date.now() - t0 >= landAfter * SC ? { status: "one_box", ...MC["2001 BMW M3 (alike with options)"].d } : { status: "one_box", tier: "unavailable", stillReading: true, computing: true, retry: true, retryAfterMs: 2000, waitMaxMs: wait, samLine: "Sam is reading the sales for this one.", couldNotLine: "Sam couldn't read this one yet.", resolvedCar: { year: 2001, make: "BMW", model: "M3" } }; } };
  const p = await openMC(b, fx, 1440, { scale: SC }).catch(() => null); if (!p) return ""; await new Promise(r => setTimeout(r, wait * SC + 1500)); const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ")); await p.close(); return txt; };
{ const a = await mcRun(85000, 60000); ok(/\$22,500 to \$41,000/.test(a) && !/could not be read yet|couldn.t read this one yet/i.test(a), "Market Check: waitMaxMs 85000 and the answer at 60 s: the page draws the answer, not the could-not line"); }
{ const a = await mcRun(20000, 30000); ok(/could not be read yet|couldn.t read this one yet/i.test(a) && !/\$22,500 to \$41,000/.test(a), "Market Check: waitMaxMs 20000 and the answer at 30 s: the page gives up at the ENGINE's 20 s"); }
await b.close();
// ---- 3. the history hub's placeholder: the engine's two numbers, nothing else
{ const h = await import(pathToFileURL(path.join(ROOT, "api/history.js")).href); const card = typeof h.coldCardHtml === "function" ? h.coldCardHtml({ retryAfterMs: 1234, waitMaxMs: 98765 }) : "";
  ok(/W=98765/.test(card) && /R=1234/.test(card) && !/\b(?:45000|85000|2000)\b/.test(card), "history hub placeholder: it carries the engine's waitMaxMs and retryAfterMs and no number of its own");
  const none = typeof h.coldCardHtml === "function" ? h.coldCardHtml({}) : ""; ok(/W=0/.test(none) && /R=0/.test(none), "history hub placeholder: with no engine numbers it asks no more and never gives up on its own"); }
console.log(`pageWaitCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
