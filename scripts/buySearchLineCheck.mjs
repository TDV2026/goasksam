// SEARCH TURN, NO MODEL SENTENCE (Lane E, E6, Sam's decision Oct 16 2026): a Buy search turn answers with the one fixed
// line built from the same facts the cards use ("Here's what's for sale: {search}.": the cards are live listings, cars at
// auction right now, so the line says for sale, never sold) and runs ONE model call (the forced tool call), never a
// reply round, never a guard regeneration; the page shows the box and the cards with no model sentence above them.
// Live, read-only, zero OldCarsData. Exits 1 on any search that breaks the rule.
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/buySearchLineCheck.mjs [--cars "a|b"] [--base https://goasksam.com]
import puppeteer from "puppeteer-core";

const arg = n => { const i = process.argv.indexOf("--" + n); if (i < 0) return null; const v = process.argv[i + 1]; return v == null || v.startsWith("--") ? "1" : v; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CARS = (arg("cars") || "Porsche 911|1965 Ford Mustang|2005 Porsche 911|2023 Porsche 911 GT3").split("|").map(s => s.trim()).filter(Boolean);
// Searches with nothing live (Lane C's catch, Oct 16 2026): one model call, NO "for sale" line, searchNote null, and the page
// draws no line under its "No ... are live right now" header. --empty "a|b" overrides the list. Default car (Oct 19 2026): the
// 1937 Bugatti, the zero-live turn where the model also read a market by name (the 2011 BMW M3 Coupe went live).
const EMPTY = (arg("empty") || "1937 Bugatti Type 57SC Atlantic").split("|").map(s => s.trim()).filter(Boolean);
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("buySearchLineCheck: no PROBE_KEY in the environment."); process.exit(2); }
const HOST = new URL(BASE).host, LINE = /^Here's what's for sale: .+\.$/, SOLD = /\bsold\b/i;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
let failed = 0;
try {
  for (const q of CARS.concat(EMPTY)) {
    const empty = EMPTY.includes(q) && !CARS.includes(q);
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
    // 1. The endpoint: one model call, the fixed line, search_live only, no guard.
    await page.goto(BASE + "/buy", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const api = await page.evaluate(async q => {
      const r = await fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", messages: [{ role: "user", content: q }], state: { filters: {} }, turns: 0, debug: true }) });
      const txt = await r.text(); const m = /event: done\ndata: (.*)\n/.exec(txt); let d = null; try { d = m ? JSON.parse(m[1]) : null; } catch {}
      return d ? { reply: d.reply, searchNote: d.searchNote, calls: d.usage && d.usage.calls, tools: (d.trace || []).map(t => t.tool), guards: (d.guards || []).length, live: d.meta && d.meta.live, rounds: d.times && d.times.rounds } : { error: "no done event", head: txt.slice(0, 200) };
    }, q);
    const reasons = [];
    if (api.error) reasons.push(api.error + " " + (api.head || ""));
    else if (empty) {
      if (api.live) reasons.push(`${api.live} live: not an empty search, pick another --empty car`);
      if (/for sale/i.test(String(api.reply || ""))) reasons.push(`a "for sale" line over an empty result: "${api.reply}"`);
      if (api.searchNote) reasons.push(`searchNote sent on an empty result: "${api.searchNote}"`);
      if (api.calls !== 1) reasons.push(`${api.calls} model calls (one expected)`);
      if (api.guards) reasons.push(`${api.guards} guard event(s)`);
    } else {
      if (!LINE.test(String(api.reply || ""))) reasons.push(`reply is not the fixed line: "${api.reply}"`);
      if (SOLD.test(String(api.reply || ""))) reasons.push(`the line says "sold" over live cards: "${api.reply}"`);
      if (api.searchNote !== api.reply) reasons.push(`searchNote differs from the reply: "${api.searchNote}"`);
      if (api.calls !== 1) reasons.push(`${api.calls} model calls (one expected: the tool call only)`);
      if (!api.tools.length || api.tools.some(t => t !== "search_live")) reasons.push(`tools ${JSON.stringify(api.tools)}`);
      if (api.guards) reasons.push(`${api.guards} guard event(s) on a search turn`);
    }
    // 2. The page: after the search draws, no model sentence sits above the cards (no .qa reply, no .reply paragraph in the results).
    await page.goto(BASE + "/buy?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 60 && !(await page.evaluate(() => !!document.querySelector(".msg.results[data-done]")).catch(() => false)); i++) await new Promise(r => setTimeout(r, 1000));
    const dom = await page.evaluate(() => { const res = document.querySelector(".msg.results[data-done]"); const above = []; let el = res ? res.previousElementSibling : null; while (el) { above.push((el.className || "") + ": " + (el.innerText || "").trim().slice(0, 80)); el = el.previousElementSibling; } return { drawn: !!res, qa: document.querySelectorAll(".msg.qa, .msg.results .reply").length, above, cards: document.querySelectorAll(".msg.results article.car:not(.skel)").length, forSale: /Here's what's for sale/.test(res ? res.innerText : "") }; }).catch(() => ({ drawn: false, qa: 0, above: [], cards: 0 }));
    if (!dom.drawn) reasons.push("the page did not draw the search within 60 s");
    if (dom.qa) reasons.push(`${dom.qa} model-reply element(s) on the page after a search`);
    if (empty && dom.forSale) reasons.push(`the page shows "for sale" over an empty result`);
    if (dom.above.length) reasons.push(`something sits above the results: ${JSON.stringify(dom.above)}`);
    const ok = !reasons.length; if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${q}  reply "${api.reply || ""}"  calls ${api.calls}  tools ${JSON.stringify(api.tools || [])}  live ${api.live}  cards on page ${dom.cards}`);
    for (const r of reasons) console.log("      " + r);
    await page.close();
  }
} finally { await browser.close(); }
console.log(failed ? `buySearchLineCheck: ${failed} FAIL` : "buySearchLineCheck: all pass");
process.exit(failed ? 1 : 0);
