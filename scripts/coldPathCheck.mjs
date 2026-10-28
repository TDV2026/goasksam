// NO DEAD END ON A COLD SPEC (Sam, Oct 28 2026). A spec whose answer is not stored yet is being computed. A page never tells the visitor to come back: it keeps the search in place under
// CR with a live indicator, asks again every 2 seconds (the engine's retryAfterMs) for up to 45 seconds, and draws the answer in place the moment it is stored.
// If the engine fails or the 45 seconds pass, one plain line, CM, with the Have Sam keep looking button, and a cold_miss event with the wait. The engine finishes the
// compute behind the response (lib/keepAlive.js) and stores it, one marker row stops the asks from starting a second compute. Pages: Market Check and Sell (public/js/onebox.js, lib/sell/sellMcClient.js),
// Find (api/buy.js), Tasks (api/tasksPage.js), the history hubs (api/history.js), the partner demos, the MCP tool (waits for the answer). Emails are not affected.
//   1. Market Check in Chrome (the clock scaled down for the check only, GAS_WAIT_SCALE): computing three times then an answer; computing for good; an engine failure;
//   2. the server contract and the pages' static lines; no page keeps a "try again" or "still reading" line for a market read.
//   node scripts/coldPathCheck.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { reasonLine } from "../lib/reasonWords.js";
const CR = reasonLine("cold.reading"), CS = reasonLine("cold.still"), CM = reasonLine("cold.missed");   // the engine's own wording (lib/reasonWords.js), never a copy here
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const rd = f => fs.readFileSync(f, "utf8");
const base = JSON.parse(rd("scripts/fixtures/m3Answer.json"));
const COMPUTING = { status: "one_box", tier: "unavailable", stillReading: true, computing: true, retry: true, retryAfterMs: 2000, waitMaxMs: 45000, samLine: CR, couldNotLine: CM, resolvedCar: { year: 2001, make: "BMW", model: "M3" } };
const FAILED = { status: "one_box", tier: "unavailable", samLine: CM, resolvedCar: { year: 2001, make: "BMW", model: "M3" } };

// 1. Market Check in Chrome
{
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(CHROME)) console.log("SKIP Market Check in Chrome: no Chrome at " + CHROME);
  else {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
    // answer(n): the n-th ask (1 based) -> a payload
    const run = async (answer, scale, settleMs) => {
      const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 }); p._posts = []; p._events = []; p._seen = [];
      await p.evaluateOnNewDocument(sc => { window.GAS_WAIT_SCALE = sc; window.gasTrack = (e, props) => { (window.__ev = window.__ev || []).push([e, props]); }; }, scale);
      await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url());
        if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
        const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
        if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
        if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { p._posts.push(Date.now()); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(p._posts.length)) }); }
        if (u.host === "goasksam.com" && u.pathname === "/api/watch") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ready: true }) });
        if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
        if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
      await p.type("#ob-input", "2001 BMW M3"); await p.keyboard.press("Enter");
      const t0 = Date.now();
      while (Date.now() - t0 < settleMs) { p._seen.push(await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " "))); await new Promise(r => setTimeout(r, 40)); }
      p._events = await p.evaluate(() => window.__ev || []);
      return p;
    };
    // a. computing three times, then the answer: the search stays, the reading line shows, the answer draws in place, nothing says try again
    { const p = await run(n => n <= 3 ? COMPUTING : { status: "one_box", ...base }, 0.05, 3500);
      const all = p._seen.join(" | "), last = p._seen[p._seen.length - 1] || "";
      ok(p._posts.length === 4, "a. asked four times: three computing answers and the answer (" + p._posts.length + ")");
      ok(all.includes(CR), "a. while it computes the page says: Sam is reading the sales for this one.");
      ok(!/try again|come back|still reading|taking longer/i.test(all.replace(/This one is taking longer than usual\./g, "")), "a. nothing says try again, come back or still reading");
      ok(/typical range|\$22,500/.test(last) && !/Sam is reading the sales/.test(last), "a. the answer is drawn in place the moment it is stored");
      ok(p._seen.every(x => /ob-input|Describe|Search|M3|Sam|Market|\$|sales/.test(x) || x.length > 0), "a. the page is never blank while it waits");
      const gaps = p._posts.slice(1).map((t, i) => t - p._posts[i]); ok(gaps.every(g => g >= 60 && g < 700), "a. it asks again at the engine's wait (2 seconds, scaled): " + JSON.stringify(gaps));
      ok(!p._events.some(e => e[0] === "cold_miss"), "a. no cold_miss when the answer came"); await p.close(); }
    // b. computing for good: after 45 seconds (scaled) one plain line, the keep looking button, a cold_miss with the wait, and it stops asking
    { const p = await run(() => COMPUTING, 0.04, 3500);
      const last = p._seen[p._seen.length - 1] || "", n = p._posts.length;
      ok(last.includes(CM), "b. after 45 seconds: Sam couldn't read this one yet.");
      ok(!/try again|come back/i.test(p._seen.join(" | ")), "b. nothing says try again or come back");
      ok(await p.evaluate(() => !!document.getElementById("ob-samonit") && /Have Sam keep looking/.test(document.getElementById("ob-samonit").textContent)), "b. the Have Sam keep looking button is there");
      const ev = p._events.filter(e => e[0] === "cold_miss"); ok(ev.length === 1 && ev[0][1].reason === "timeout" && ev[0][1].wait_ms > 0, "b. one cold_miss with the wait (" + JSON.stringify(ev) + ")");
      await new Promise(r => setTimeout(r, 700)); ok(p._posts.length === n, "b. it stops asking (" + n + " then " + p._posts.length + ")");
      ok(n >= 10 && n <= 30, "b. it asked for the whole wait, not once (" + n + " asks)"); await p.close(); }
    // c. the engine fails: the same line and button at once
    { const p = await run(() => FAILED, 1, 900);
      const last = p._seen[p._seen.length - 1] || "";
      ok(last.includes(CM) && !/try again|busy/i.test(last), "c. an engine failure prints the one plain line, not 'try again' or 'busy'");
      ok(await p.evaluate(() => !!document.getElementById("ob-samonit")), "c. with the Have Sam keep looking button");
      const ev = p._events.filter(e => e[0] === "cold_miss"); ok(ev.length === 1 && ev[0][1].reason === "failed", "c. one cold_miss, reason failed"); await p.close(); }
    await b.close();
  }
}

// 2. the server contract and every page's lines
{
  const sd = rd("api/sellerDecision.js"), ls = rd("lib/live/search.js"), ka = rd("lib/keepAlive.js");
  ok(/retryAfterMs: 2000, waitMaxMs: 45000/.test(sd) && /export const COMPUTING_LINE = reasonLine\("cold\.reading"\)/.test(sd), "server: the computing answer asks again in 2 seconds, for up to 45, in the one line");
  ok(/keepAlive\(engineP\.then\(finishStore\)/.test(sd) && /markComputing\(/.test(sd) && /readComputing\(/.test(sd), "server: a compute that outlasts the page's clock is kept alive and stored; one marker stops a second compute");
  ok(/@vercel\/request-context/.test(ka) && /waitUntil/.test(ka), "keepAlive hands the promise to the platform's waitUntil");
  ok(/"api\/sellerDecision\.js": \{\s*"maxDuration": (\d+)/.test(rd("vercel.json")) && Number(/"api\/sellerDecision\.js": \{\s*"maxDuration": (\d+)/.exec(rd("vercel.json"))[1]) >= 90, "server: the function lives long enough for the compute to finish after the response (maxDuration 90)");
  ok(/retryAfterMs: 2000, waitMaxMs: 45000/.test(ls) && /keepAlive\(p\)/.test(ls), "Find/Tasks cards: the pending answer asks in 2 seconds and the compute is kept alive");
  const buy = rd("api/buy.js"); const i = buy.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(buy.slice(i, buy.indexOf('";\n', i) + 1));
  ok(/COLD_MAX = 45000/.test(c) && /COULD_NOT = __COLD_MISSED__/.test(c) && /__COLD_MISSED__/.test(buy) && buy.includes("reasonLine(\"cold.missed\")") && /gasTrack\("cold_miss"/.test(c), "Find: a card still being read is asked for 45 seconds, then the plain line and a cold_miss");
  ok(/COLD_MAX = 45000/.test(rd("api/tasksPage.js")) && /gasTrack\("cold_miss"/.test(rd("api/tasksPage.js")), "Tasks: the same 45 seconds and cold_miss");
  ok(/cold\(|coldAt|45000 \* \(Number\(window\.GAS_WAIT_SCALE\)/.test(rd("api/partnerDemo.js")) && /45000 \* \(Number\(window\.GAS_WAIT_SCALE\)/.test(rd("api/_amazonDemo.js")), "partner demos: the same 45 seconds");
  ok(/coldCardHtml/.test(rd("api/history.js")) && /readComputing/.test(rd("api/_historyData.js")) && /keepAlive/.test(rd("api/_historyData.js")), "history hubs: the reading placeholder asks again; the compute is kept and stored");
  ok(/cold_miss:/.test(rd("lib/track/catalog.js")), "the cold_miss event is in the catalog");
  // CLASS: no market-read state keeps a come-back line
  const BAN = /try again|Try again|still reading|come back/;
  const ALLOW = [/cars checked today/, /BUSY = /, /Sam is busy right now/, /That didn.t send/, /Sam couldn.t answer that just now/, /rate|limit|ceiling|Lots of/i, /\/\/ |\* /, /Didn.t catch that/, /That didn.t work just now/];
  const FILES = ["public/js/onebox.js", "lib/sell/sellMcClient.js", "api/tasksPage.js", "api/partnerDemo.js", "api/_amazonDemo.js", "lib/live/search.js", "api/sellerDecision.js", "api/history.js", "api/_historyData.js"];
  for (const f of FILES) { const bad = rd(f).split("\n").filter(l => BAN.test(l) && !ALLOW.some(a => a.test(l))); ok(bad.length === 0, `${f}: no come-back line on a market read (${bad.map(x => x.trim().slice(0, 90)).join(" || ") || "none"})`); }
  ok(!/still reading/.test(c.replace(/\/\/[^\n]*/g, "")), "Find's client carries no 'still reading' line");
}
console.log(`coldPathCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
