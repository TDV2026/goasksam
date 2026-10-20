// LIVE: this script loads production /buy. Run it only in a gap the lanes name, with the protection-bypass header.
// THE BUY MIC, WHAT A HEADLESS BROWSER CAN PROVE (Sam's Stage 1d item 7: keep the mic only if it works end to end; Lane E,
// Oct 20 2026). A real microphone cannot be tested headless, so a SpeechRecognition stand-in "hears" the words; this
// proves the page's own code path: the mic button is shown when the browser offers speech recognition, one tap starts,
// the heard words land in the box, the button returns to idle, and the send carries those words to the Buy chat. The
// real-device test (desktop Chrome, iPhone Safari) is Sam's, in lane-notes. Exits 1 on any failure.
//   PROBE_KEY=... VERCEL_AUTOMATION_BYPASS_SECRET=... node scripts/buyMicCheck.mjs --live [--words "only manuals"]
import puppeteer from "puppeteer-core";
if (!process.argv.includes("--live")) { console.log("buyMicCheck: REFUSED. This script loads production /buy and sends one chat turn. Run it only in a gap the lanes name, with --live."); process.exit(2); }
const arg = n => { const i = process.argv.indexOf("--" + n); return i < 0 ? null : process.argv[i + 1]; };
const WORDS = arg("words") || "only manuals", HOST = "goasksam.com";
const OWN = { "x-ops-key": process.env.PROBE_KEY, "x-launch-stage-test": "2", ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) };
let pass = 0, fail = 0; const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); c ? pass++ : fail++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
try {
  for (const [label, vp] of [["desktop 1440", { width: 1440, height: 900 }], ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage(); await p.setViewport(vp);
    await p.setRequestInterception(true);
    const sent = [];
    p.on("request", r => { const own = r.url().includes(HOST); if (own && /\/api\/buySearch$/.test(new URL(r.url()).pathname) && r.method() === "POST") { try { const j = JSON.parse(r.postData() || "{}"); if (j.action === "chat") sent.push(j); } catch {} } r.continue(own ? { headers: { ...r.headers(), ...OWN } } : undefined); });
    // The stand-in: a SpeechRecognition that "hears" WORDS shortly after start().
    await p.evaluateOnNewDocument(words => {
      class FakeSR { constructor() { this.lang = ""; this.interimResults = false; this.continuous = false; window.__srStarts = (window.__srStarts || 0) + 1; }
        start() { setTimeout(() => { this.onstart && this.onstart(); }, 50); setTimeout(() => { const res = [[{ transcript: words }]]; res[0].isFinal = true; this.onresult && this.onresult({ results: res, resultIndex: 0 }); }, 300); setTimeout(() => { this.onend && this.onend(); }, 500); }
        stop() { setTimeout(() => { this.onend && this.onend(); }, 20); } abort() { this.stop(); } }
      window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
    }, WORDS);
    await p.goto(`https://${HOST}/buy?q=` + encodeURIComponent("Porsche 911"), { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let i = 0; i < 60 && !(await p.evaluate(() => !!document.querySelector(".msg.results[data-done]")).catch(() => false)); i++) await new Promise(r => setTimeout(r, 1000));
    const shown = await p.evaluate(() => { const m = document.getElementById("mic"); return !!m && !m.hidden && m.offsetParent !== null; });
    ok(shown, `${label}: the composer mic is shown when the browser offers speech recognition`);
    const n0 = sent.length;
    await p.evaluate(() => { const m = document.getElementById("mic"); m && m.click(); });
    await new Promise(r => setTimeout(r, 900));
    const st = await p.evaluate(() => ({ value: (document.getElementById("q") || {}).value || "", starts: window.__srStarts || 0, pressed: (document.getElementById("mic") || {}).getAttribute && document.getElementById("mic").getAttribute("aria-pressed") }));
    ok(st.starts === 1, `${label}: one tap starts the recognizer once (${st.starts})`);
    ok(st.value.trim().toLowerCase() === WORDS.toLowerCase(), `${label}: the heard words land in the box ("${st.value}")`);
    ok(st.pressed !== "true", `${label}: the mic returns to idle after the words (aria-pressed ${st.pressed})`);
    // The send: the page's own submit for the composer (the Enter key in the box).
    await p.focus("#q"); await p.keyboard.press("Enter");
    for (let i = 0; i < 20 && sent.length === n0; i++) await new Promise(r => setTimeout(r, 300));
    const last = sent[sent.length - 1];
    const said = last && Array.isArray(last.messages) ? String((last.messages.filter(m => m.role === "user").pop() || {}).content || "") : "";
    ok(sent.length > n0 && said.toLowerCase().includes(WORDS.toLowerCase()), `${label}: the send carries the words to the Buy chat ("${said}")`);
    await p.close();
  }
} finally { await b.close(); }
console.log(`buyMicCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
