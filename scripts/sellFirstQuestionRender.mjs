// clock: real-ok it measures real elapsed milliseconds between a page's first computing answer and its first question; the real clock is the thing measured, no date is asserted (Lane G, Oct 29 2026)
// THE FIRST SELL QUESTION IN A REAL BROWSER (Lane E, Oct 29 2026, review of 29bf08f0 onCarEarly). The real /sell page, the real onebox.js and sellMcClient.js, the engine stubbed (no network, no production read). Four shapes of answer, at 1440 and 390:
//  (1) cold, question-tier (2004 Porsche 911): computing answers, then a body question.   (2) stored (1973 Porsche 911): the answer at once.   (3) cold result-tier (1995 Toyota Supra): computing answers, then the result.   (4) the 1967 Corvette: computing, then the result.
// For each: the first question shows on the FIRST computing answer (ms after it, not after the final); the loading bar is gone when it is drawn; the question is drawn once; the later steps still go and the result request carries the answers; a new search straight after starts cleanly.
//   node scripts/sellFirstQuestionRender.mjs
import fs from "node:fs";
import { startBrowser, pageHtml, ROOT } from "./e98Render.mjs";
import path from "node:path";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const computing = car => ({ status: "one_box", tier: "unavailable", stillReading: true, computing: true, retry: true, retryAfterMs: 2000, waitMaxMs: 45000, samLine: "Sam is reading the sales for this one.", resolvedCar: car });
const result = car => ({ status: "one_box", tier: "result", resolvedCar: car, cluster: [22500, 47000], poolN: 63, cards: [], samLine: "x" });
const bodyQ = car => ({ status: "one_box", tier: "body_choice", resolvedCar: car, prompt: "These sold as Coupe, Cabriolet and Targa, and they price differently. Which one is it?", bodyOptions: ["Coupe", "Cabriolet", "Targa"], optionCounts: [20, 11, 7], askIndex: 1 });
const C = (year, make, model) => ({ year, make, model });
const html = await pageHtml("api/sell.js", "/sell", true);
const b = await startBrowser();
async function run(car, typed, script, w) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); p._posts = []; p._flow = []; p._t = {};
  await p.evaluateOnNewDocument(() => { window.GAS_WAIT_SCALE = 0.05; window.gasTrack = () => {}; });
  await p.setRequestInterception(true);
  p.on("request", r => { const u = new URL(r.url());
    if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
    const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
    if (u.host === "goasksam.com" && loc && fs.existsSync(path.join(ROOT, loc))) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(ROOT, loc), "utf8") });
    if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { p._posts.push(Date.now()); const n = p._posts.length; if (!p._t.first && script(n).computing) p._t.first = Date.now(); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(script(n)) }); }
    if (u.host === "goasksam.com" && u.pathname === "/api/sellChat") { let body = {}; try { body = JSON.parse(r.postData() || "{}"); } catch (e) {} p._flow.push(body); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "stub" }) }); }
    if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
    if (u.host !== "goasksam-nope" && u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
  await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" }).catch(() => {});
  await p.type("#ob-input", typed); await p.keyboard.press("Enter");
  return p;
}
const seeQ = p => p.evaluate(() => { const t = document.body.innerText; return { state: /Which state is it in/.test(t), how: /How would you like to sell it/.test(t), body: /Which one is it/.test(t), loader: !!document.querySelector(".loader"), n: (t.match(/Which state is it in/g) || []).length }; });
const until = async (p, f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await seeQ(p); if (f(s)) return { s, ms: Date.now() - t0 }; await new Promise(r => setTimeout(r, 30)); } return { s: await seeQ(p), ms: null }; };
for (const w of [1440, 390]) {
  // (1) cold, question-tier
  { const car = C(2004, "Porsche", "911"), p = await run(car, "2004 Porsche 911", n => n <= 4 ? computing(car) : n === 5 ? bodyQ(car) : n <= 7 ? computing(car) : result(car), w), at = `cold question-tier 2004 Porsche 911 at ${w}`;
    const q = await until(p, s => s.state); const sinceFirst = q.ms === null ? null : Date.now() - p._t.first;
    ok(q.s.state && q.s.n === 1 && !q.s.loader, `${at}: the first question shows on the first computing answer, loading bar gone, drawn once (${JSON.stringify(q.s)}, ${p._posts.length} asks so far)`);
    ok(p._posts.length <= 2, `${at}: it did not wait for the final answer (${p._posts.length} asks)`);
    const e = await until(p, s => s.body, 6000);
    ok(e.s.body && !e.s.state && !e.s.loader, `${at}: the body question replaces it, no bar, no second state question (${JSON.stringify(e.s)})`);
    const before = p._posts.length; await p.evaluate(() => { const c = [...document.querySelectorAll(".chip,button")].find(x => /^Coupe/.test(x.textContent.trim())); c && c.click(); });
    const again = await until(p, s => s.state || s.loader === false && !s.body, 5000);
    ok(again.s.state && !again.s.loader && again.s.n === 1, `${at}: a tap on the body question's chip starts a clean search and the first question shows (${JSON.stringify(again.s)}; asks ${before} to ${p._posts.length})`);
    await p.close(); }
  // (1b) cold, question-tier, the reader taps a state before the body question arrives: kept, not asked again, not lost
  { const car = C(2004, "Porsche", "911"), p = await run(car, "2004 Porsche 911", n => n <= 4 ? computing(car) : n === 5 ? bodyQ(car) : n <= 7 ? computing(car) : result(car), w), at = `question-tier, state tapped before the body question, at ${w}`;
    await until(p, s => s.state); await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")].find(x => /^Texas/.test(x.textContent.trim())); c && c.click(); });
    const e = await until(p, s => s.body, 6000); ok(e.s.body && !e.s.loader, `${at}: the body question arrives with no blank (${JSON.stringify(e.s)})`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip,button")].find(x => /^Coupe/.test(x.textContent.trim())); c && c.click(); });
    const h = await until(p, s => s.how || s.state, 5000); ok(h.s.how && !h.s.state && !h.s.loader, `${at}: after the body chip the next question is how to sell, the state is not asked again (${JSON.stringify(h.s)})`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); await new Promise(r => setTimeout(r, 300));
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); await new Promise(r => setTimeout(r, 800));
    ok(p._flow.some(f => /^(range|result)$/.test(f.step) && f.state === "Texas"), `${at}: the state tapped before the swap reaches the result request (${JSON.stringify(p._flow.map(f => f.step + ":" + (f.state || "")))})`);
    await p.close(); }
  // (2) stored
  { const car = C(1973, "Porsche", "911"), p = await run(car, "1973 Porsche 911", () => result(car), w), at = `stored 1973 Porsche 911 at ${w}`;
    const q = await until(p, s => s.state); ok(q.s.state && q.s.n === 1 && !q.s.loader, `${at}: the question shows once, no bar (${JSON.stringify(q.s)})`);
    await new Promise(r => setTimeout(r, 600)); const s2 = await seeQ(p); ok(s2.state && s2.n === 1, `${at}: still drawn once afterwards`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")].find(x => /^Texas/.test(x.textContent.trim())); c && c.click(); });
    const h = await until(p, s => s.how); ok(h.s.how, `${at}: answering the state goes to the next question`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); const r = await until(p, s => !s.how && !s.state, 3000);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); await new Promise(r => setTimeout(r, 800));
    ok(p._flow.some(f => /^(range|result)$/.test(f.step) && f.state === "Texas"), `${at}: after the three answers the result request carries the state (${JSON.stringify(p._flow.map(f => f.step + ":" + (f.state || "")))})`);
    await p.close(); }
  // (3) and (4) cold result-tier
  for (const [car, typed] of [[C(1995, "Toyota", "Supra"), "1995 Toyota Supra"], [C(1967, "Chevrolet", "Corvette"), "1967 Chevrolet Corvette"]]) {
    const p = await run(car, typed, n => n <= 4 ? computing(car) : result(car), w), at = `cold result-tier ${typed} at ${w}`;
    const q = await until(p, s => s.state); ok(q.s.state && !q.s.loader && q.s.n === 1 && p._posts.length <= 2, `${at}: the question shows at the first computing answer (${p._posts.length} asks), no bar, once`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")].find(x => /^Texas/.test(x.textContent.trim())); c && c.click(); });
    await new Promise(r => setTimeout(r, 1500));   // the final answer arrives while the how question is up
    const s3 = await seeQ(p); ok(s3.how && !s3.state && !s3.loader && s3.n === 0, `${at}: the final answer arriving does not redraw the state question or clear the how question (${JSON.stringify(s3)})`);
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); await new Promise(r => setTimeout(r, 300));
    await p.evaluate(() => { const c = [...document.querySelectorAll(".chip")][0]; c && c.click(); }); await new Promise(r => setTimeout(r, 800));
    ok(p._flow.some(f => /^(range|result)$/.test(f.step) && f.state === "Texas"), `${at}: the later steps run and the result request carries the answers (${JSON.stringify(p._flow.map(f => f.step + ":" + (f.state || "")))})`);
    await p.close(); }
}
await b.close();
console.log(`sellFirstQuestionRender: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
