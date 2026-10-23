// VOICE ON ALL FOUR START PAGES (GoAskSam 2.0 Stage 3, Sam's block, Oct 23 2026; Lane C). OFFLINE: each page's real HTML is rendered
// in-process and loaded in Chrome with a SpeechRecognition stand-in (no network, no microphone). Proves, on Home, Find, Market Check
// and the new Sell: the mic button is shown when the browser can listen and hidden when it cannot; one tap starts, the heard words
// land in the box as EDITABLE text (typing after still works) and nothing is sent by the voice itself; a refusal, no microphone and
// no speech each say so in plain words in the box and put the button back to idle. A real microphone is Sam's device test.
//   node scripts/voiceStartCheck.mjs   (from the repo root; needs Chrome, CHROME_PATH or the Mac default)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SELL_NEXT_ON = "1";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const render = async (mod, url) => { const { default: h } = await import(pathToFileURL(path.join(ROOT, "api", mod + ".js")).href);
  return await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(b) { r(String(b)); return res; }, end(b) { r(String(b || "")); return res; }, json(o) { r(JSON.stringify(o)); return res; } }; Promise.resolve(h({ method: "GET", url, query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res)).catch(() => r("")); setTimeout(() => r(""), 25000); }); };
const PAGES = [["Home", "home", "/", "gst-home-q", "gst-home-mic"], ["Find", "buy", "/find", "hq", "hmic"], ["Market Check", "marketCheck", "/market-check", "ob-input", "ob-mic"], ["Sell (new)", "sellNext", "/api/sellNext", "ob-input", "ob-mic"]];
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
const STUB = mode => `(function(){ var mode = ${JSON.stringify(mode)}; if (mode === "none") { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; return; }
  function FakeSR(){ this.lang=""; window.__starts=(window.__starts||0)+1; } FakeSR.prototype.start=function(){ var t=this; setTimeout(function(){ t.onstart&&t.onstart(); },20);
    setTimeout(function(){ if (mode==="hear"){ var res=[[{transcript:"red manual Porsche 911"}]]; res[0].isFinal=true; t.onresult&&t.onresult({results:res}); setTimeout(function(){ t.onend&&t.onend(); },20); } else { t.onerror&&t.onerror({error:mode}); setTimeout(function(){ t.onend&&t.onend(); },20); } },60); };
  FakeSR.prototype.stop=function(){ var t=this; setTimeout(function(){ t.onend&&t.onend(); },10); }; FakeSR.prototype.abort=FakeSR.prototype.stop; window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR; })();`;
try {
  for (const [name, mod, url, inId, micId] of PAGES) {
    const html = await render(mod, url); ok(html.length > 2000, name + ": the page renders");
    for (const mode of ["hear", "none", "not-allowed", "no-speech", "audio-capture"]) {
      const p = await b.newPage(); await p.setViewport({ width: 1100, height: 800 });
      await p.evaluateOnNewDocument(STUB(mode)); await p.setRequestInterception(true);
      let sent = 0;
      p.on("request", r => { const u = new URL(r.url()); if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html }); if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname) && r.method() === "POST") sent++; const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null); if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(ROOT, loc))) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, loc), "utf8") });
      if (u.host === "goasksam.com" && !/\.(js|css)$/.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" }); if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com" + url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {}); await new Promise(r => setTimeout(r, 900));
      const shown = await p.evaluate(id => { const m = document.getElementById(id); return !!m && !m.hidden && m.offsetParent !== null; }, micId);
      if (mode === "none") { ok(!shown, `${name}: no speech recognition in the browser, no microphone button`); await p.close(); continue; }
      ok(shown, `${name}: the mic shows when the browser can listen (${mode})`);
      const before = sent;
      await p.evaluate(id => document.getElementById(id).click(), micId); await new Promise(r => setTimeout(r, 700));
      const st = await p.evaluate((id, mic) => { const i = document.getElementById(id), m = document.getElementById(mic); return { v: i.value, ph: i.getAttribute("placeholder"), pressed: m.getAttribute("aria-pressed"), on: m.classList.contains("on"), ro: i.readOnly || i.disabled }; }, inId, micId);
      if (mode === "hear") {
        ok(st.v === "red manual Porsche 911" && !st.ro, `${name}: the heard words land in the box as editable text`);
        await p.focus("#" + inId); await p.keyboard.type(" under $90k"); const v2 = await p.evaluate(id => document.getElementById(id).value, inId);
        ok(v2 === "red manual Porsche 911 under $90k", `${name}: the transcript can be edited by typing (got "${v2}")`);
        ok(sent === before && !st.on, `${name}: the voice sends nothing by itself and the button returns to idle`);
      } else {
        const want = { "not-allowed": /Microphone blocked/, "no-speech": /Didn.t catch that/, "audio-capture": /No microphone found/ }[mode];
        ok(!st.on && st.v === "", `${name}: ${mode}: the button returns to idle and the box stays empty`);
        ok(want.test(st.ph) , `${name}: ${mode}: says so in plain words ("${st.ph}")`);
      }
      await p.close();
    }
  }
} finally { await b.close(); }
console.log(`voiceStartCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
