// LIVE: this script calls production (goasksam.com). Run it ONCE, after Lane C posts PAGES LIVE, in a gap Lane F names (GAP_OK=1), never inside a PUSH LOCK. Refuses without --live.
// E98 live visuals (Lane E): the crew cookie from the Keychain (CREW env, never printed), a test read first (the Task email preview, which is crew-gated: a non-200 means the cookie failed, post CREW COOKIE FAILED
// with the status code and stop), then ONE search per car (7 searches + the email = 8 reads, three at a time at most: here one at a time), each screenshotted at 1440 and then, on the same page without a new read, at 390.
// Every page is judged by scripts/e98DomCheck.mjs (the rules underlineCheck holds offline): no underlined or linked number, the large figure present, no stale wording, no card with more than two small lines.
// Then the real Task email (GET /api/tasks?carmails=1, the real builders on real live cars, never sent) is rendered and read for the same wording and underline rules. PNGs go to docs/screens/e98/live/.
//   CREW=$(security find-generic-password -s goasksam-crew -w) GAP_OK=1 node scripts/e98LiveCheck.mjs --live
import fs from "node:fs";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { inPage, judge } from "./e98DomCheck.mjs";
import { readEmails, judgeEmails } from "./e98EmailDom.mjs";
if (!process.argv.includes("--live") || process.env.GAP_OK !== "1") { console.log("e98LiveCheck: LIVE script (production). Pass --live and GAP_OK=1, in a gap Lane F names only."); process.exit(2); }
const BASE = "https://goasksam.com", CREW = process.env.CREW, OUT = "docs/screens/e98/live", BYP = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!CREW) { console.log("e98LiveCheck: no CREW in the environment."); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const now = () => new Date().toISOString().slice(11, 19) + "Z";
// THE LOCK CHECK (lockstate rules): a lock is a line starting "- PUSH LOCK (Lane X"; only a LATER line from the SAME lane starting "- PUSHED (Lane X" or "- LOCK RELEASED (Lane X" (or "... lock released") frees it.
const openLocks = () => { execSync("git fetch -q origin main"); const L = execSync("git show origin/main:docs/lane-notes.md", { maxBuffer: 1 << 28 }).toString().split("\n"), open = new Map();
  for (const l of L) { let m = /^- PUSH LOCK \(Lane (\w)/.exec(l); if (m) { open.set(m[1], l.slice(0, 80)); continue; } m = /^- (?:PUSHED|LOCK RELEASED) \(Lane (\w)/.exec(l) || /^- \(Lane (\w)[^)]*\):.*lock released/i.exec(l); if (m) open.delete(m[1]); } return [...open.values()]; };
const guard = () => { const a = openLocks(); if (a.length) { console.log("LOCK OPEN, stopping, no read made: " + a.join(" | ")); process.exit(4); } };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`FAIL ${m} (${now()})`); } };
guard();
// the test read, which is also the email read
const hdr = { Cookie: `gas_crew=${CREW}`, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) };
const er = await fetch(BASE + "/api/tasks?carmails=1", { headers: hdr });
if (er.status !== 200) { console.log(`CREW COOKIE FAILED: /api/tasks?carmails=1 answered ${er.status}. Post CREW COOKIE FAILED with that status in lane-notes and stop; do not ask for the code.`); process.exit(3); }
const emailHtml = await er.text(); fs.writeFileSync(OUT + "/task-email.html", emailHtml);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const slug = s => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const open = async () => { guard(); const p = await browser.newPage(); await p.setViewport({ width: 1440, height: 900 }); await p.setCookie({ name: "gas_crew", value: CREW, domain: "goasksam.com", path: "/" }); if (BYP) await p.setExtraHTTPHeaders({ "x-vercel-protection-bypass": BYP }); return p; };
const snap = async (p, name, check) => { for (const w of [1440, 390]) { await p.setViewport({ width: w, height: 900 }); await new Promise(r => setTimeout(r, 700)); await p.screenshot({ path: `${OUT}/${slug(name)}-${w}.png`, fullPage: true });
  const r = await p.evaluate(inPage); judge(ok, `${name} at ${w}`, r); if (check) check(r, w); } };
const wait = async (p, sel, ms = 70000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(s => !!document.querySelector(s), sel).catch(() => false)) return true; await new Promise(r => setTimeout(r, 1000)); } return false; };
const MC = [["2004 BMW M3", null], ["2001 BMW M3", null], ["1985 Land Rover Defender 110", null], ["1994 Porsche 911 Carrera Cabriolet", "27000"]];
try {
  for (const [car, miles] of MC) { const p = await open(); await p.goto(BASE + "/market-check", { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForSelector("#ob-input", { timeout: 20000 });
    await p.type("#ob-input", car); await p.keyboard.press("Enter"); const got = await wait(p, ".sfc-card"); ok(got, `Market Check ${car}: an answer card arrived (${got ? "" : "text: " + (await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, " ")))})`);
    if (got && miles) { await p.type("#ob-miles", miles); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 6000)); await wait(p, ".sfc-card", 40000); }
    if (got) await snap(p, `mc ${car}${miles ? " " + miles + " typed" : ""}`, (r, w) => ok(r.figure > 0, `${car} at ${w}: the large figure is present (${r.figure})`));
    await p.close(); }
  for (const [name, q] of [["Find card Alpina Roadster V8", "BMW Alpina Roadster V8"], ["Find card Porsche Boxster", "Porsche Boxster"], ["Find page black BMW", "black BMW"], ["Find single live match 1965 Corvette", "1965 Chevrolet Corvette"]]) { const p = await open();
    await p.goto(BASE + "/buy", { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForSelector("#hq", { timeout: 20000 }); await p.type("#hq", q); await p.keyboard.press("Enter");
    const got = await wait(p, "article.car .sl"); ok(got, `${name}: a live card with its Sam box arrived (${got ? "" : "text: " + (await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, " ")))})`);
    if (got) { await new Promise(r => setTimeout(r, 4000)); await snap(p, name, (r, w) => { ok(r.figure > 0 || r.text.join(" ").length > 0, `${name}: the Sam box prints`);
      if (/single live match/.test(name)) { ok(r.drawn === 1, `${name} at ${w}: exactly one live match is drawn (${r.drawn}); if not, the state is not live and the page proves nothing`); ok(new Set(r.sale).size <= 1, `${name} at ${w}: the sale lines carry one weight (${r.sale.length} lines)`);
        ok(r.text.join(" ").replace(/\s+/g, " ").match(/too few for a range|[Tt]hree sales|sales/) !== null, `${name} at ${w}: the engine's count or too-few line prints`); ok(!r.specs.some(s => /underlined/.test(s)), `${name} at ${w}: the chips row is not underlined (${r.specs.length} chips)`); } }); }
    await p.close(); }
  // the real Task email: the preview page holds each email in an iframe, so each email frame is read on its own
  { const E = await readEmails(browser, emailHtml, `${OUT}/task-email.png`); judgeEmails(ok, "task emails (live preview)", E); }
} finally { await browser.close(); }
console.log(`e98LiveCheck: ${pass} pass, ${fail} FAIL. PNGs in ${OUT}/. ${fail ? "Post the FAIL lines with LIVE VISUALS FAILED." : "Post LIVE VISUALS OK."}`);
process.exit(fail ? 1 : 0);
