// A PENDING FIND CARD IS NEVER STRANDED (Sam's live test, Oct 29 2026, "Porsche", 190 matches: three of the first six cards printed "The sales for this one are being read." and never changed until a refresh).
// A pending card keeps being asked for, on the engine's own cadence (market.retryAfterMs, from the engine's stillReadingMarket), until the engine answers, and the answer redraws in place with no refresh. When the engine's wait
// (market.waitMaxMs) passes the card prints the engine's own "couldn't read" line, never the pending line. This renders the real Find page (api/buy.js) in Chrome at 1440 and 390 with the engine stubbed per scenario:
//   computing then the answer (the engine's retry hints) / the first asks come back with nothing for the card (a failed or empty enrich) / a non-JSON 500 / a pending market that carries no retry hints / a card the first reply left out
//   / the answer never arriving. The clock is scaled down for the check only (GAS_WAIT_SCALE). FAIL: any card still showing the pending line after its answer arrived, or showing it after the limit.
//   node scripts/pendingCardFillCheck.mjs
import { FIND } from "./e98Fixtures.mjs";
import { startBrowser, pageHtml, ROOT } from "./e98Render.mjs";
import { buildCards } from "./e98FindRender.mjs";
import { reasonLine } from "../lib/reasonWords.js";
const READING = [reasonLine("cold.reading"), reasonLine("cold.still")], MISSED = reasonLine("cold.missed");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
console.log("pendingCardFillCheck reading " + ROOT);
const B0 = await startBrowser(); await B0.close();   // sets the stage the pages are built under
const defs = Object.values(FIND).slice(0, 3), good = await buildCards(defs);
const SR = { kind: "pending", stillReading: true, line: READING[0], retry: true, retryAfterMs: 2000, waitMaxMs: 85000 };
const html = await pageHtml("api/buy.js", "/buy", false);
// each scenario: how the engine answers each ask (n = this card's ask number, from 1) for a card id: "answer" | "computing" | "empty" (the card is missing from the reply) | "pending" (pending, no retry hints) | "http500"
const SCEN = {
  "computing twice, then the answer (the engine's retry hints)": { start: () => ({ ...SR }), reply: n => n <= 2 ? "computing" : "answer", fills: true },
  "the first two asks come back empty (a failed or empty enrich), then the answer": { start: () => undefined, reply: n => n <= 2 ? "empty" : "answer", fills: true },
  "the first two asks are a 500 that is not JSON, then the answer": { start: () => undefined, reply: n => n <= 2 ? "http500" : "answer", fills: true },
  "pending with no retry hints twice, then the answer": { start: () => ({ kind: "pending" }), reply: n => n <= 2 ? "pending" : "answer", fills: true },
  "computing, then a reply that leaves the card out, then the answer": { start: () => ({ ...SR }), reply: n => n === 1 ? "computing" : n === 2 ? "empty" : "answer", fills: true },
  "the answer never arrives (the engine keeps computing)": { start: () => ({ ...SR, waitMaxMs: 6000 }), reply: () => "computing", fills: false },
  "the answer never arrives (every ask comes back empty)": { start: () => undefined, reply: () => "empty", fills: false },
};
async function run(name, sc, width) {
  const b = await startBrowser(), asks = {}; let ok0 = true;
  try {
    const cards = good.map(c => ({ ...c, market: sc.start() })); cards.forEach(c => { if (c.market === undefined) delete c.market; });
    const p = await b.newPage(); await p.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; window.GAS_WAIT_SCALE = 0.01; });
    await p.setRequestInterception(true);
    p.on("request", r => { const u = new URL(r.url());
      if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
      if (u.host === "goasksam.com" && u.pathname === "/api/buySearch") { let q = {}; try { q = JSON.parse(r.postData() || "{}"); } catch {}
        if (q.action === "chat") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "Here is what is for sale.", turns: 1, state: { filters: { make: "Porsche" } }, meta: { count: cards.length, total: cards.length, narrow: "none" }, cards }) });
        if (q.action === "enrich") { const out = []; let bad = false;
          for (const id of q.ids || []) { const n = (asks[id] = (asks[id] || 0) + 1), how = sc.reply(n), g = good.find(c => c.id === id); if (!g) continue;
            if (how === "http500") bad = true; else if (how === "answer") out.push({ id, market: g.market, sam_lines: g.sam_lines, seen_before: g.seen_before });
            else if (how === "computing") out.push({ id, market: { ...SR, waitMaxMs: sc.start() ? sc.start().waitMaxMs : 85000 }, sam_lines: [] }); else if (how === "pending") out.push({ id, market: { kind: "pending" }, sam_lines: [] }); }
          if (bad) return r.respond({ status: 500, contentType: "text/html", body: "<html>Internal Server Error</html>" });
          return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ cards: out }) }); }
        return r.respond({ status: 200, contentType: "application/json", body: "{}" }); }
      if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
      if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
    await p.goto("https://goasksam.com/buy", { waitUntil: "networkidle2" }).catch(() => {});
    await p.waitForSelector("#hq", { timeout: 5000 }).catch(() => {}); await p.type("#hq", "Porsche"); await p.keyboard.press("Enter");
    const read = () => p.evaluate(() => [...document.querySelectorAll(".car")].map(c => c.innerText.replace(/\s+/g, " ")));
    await new Promise(r => setTimeout(r, 400)); const early = await read();
    ok(early.length === defs.length, `${name} at ${width}: ${defs.length} cards drawn at once (${early.length})`);
    // the clock is scaled by 0.01: 2 s asks run at 20 ms and the 6 s limit at 60 ms; give it a real moment for the page to settle
    await new Promise(r => setTimeout(r, 4000)); const late = await read();
    const pending = late.filter(t => READING.some(x => t.includes(x))), missed = late.filter(t => t.includes(MISSED)), range = late.filter(t => /\$[\d,]+ to \$[\d,]+/.test(t));
    if (sc.fills) ok(!pending.length && range.length === defs.length, `${name} at ${width}: after the answer arrived no card still shows the pending line and each card has its range (${pending.length} pending, ${range.length} of ${defs.length} with a range)`);
    else ok(!pending.length && missed.length === defs.length, `${name} at ${width}: past the engine's limit no card keeps the pending line; each prints the engine's own line (${pending.length} pending, ${missed.length} of ${defs.length} with it)`);
    ok(Object.values(asks).every(n => n >= 2) || !sc.fills, `${name} at ${width}: every card was asked for again (${JSON.stringify(Object.values(asks))})`);
    await p.close();
  } finally { await b.close(); }
}
for (const [name, sc] of Object.entries(SCEN)) for (const w of [1440, 390]) await run(name, sc, w);
// the page computes nothing: the retry cadence and the limit are the engine's (market fields), and the fallbacks come from the engine's own stillReadingMarket, not a number written in the client
{ const fs = await import("node:fs"), buy = fs.readFileSync(ROOT + "/api/buy.js", "utf8");
  ok(!/setTimeout\([^)]*,\s*(2000|3000|5000)\s*\)/.test(buy.slice(buy.indexOf("var nextAsk"), buy.indexOf("var retry") + 600)) , "the retry waits carry no number of the page's own"); }
console.log(`pendingCardFillCheck: ${fail ? pass + " pass, " + fail + " FAIL" : "all pass (" + pass + ")"}`); process.exit(fail ? 1 : 0);
