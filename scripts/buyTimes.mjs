// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// BUY TIMES (Lane E, Buy speed, Oct 16 2026): where a Buy search's time goes, measured from outside through the
// public endpoints, one search at a time, read-only, zero OldCarsData (every Buy path is archive + live_listings).
// For each search, in this order:
//   ping     POST {action:"converse", state:{messages:[]}}  the function round trip with no database read
//   parse    POST {action:"parse"}                           the resolver alone (the page's chips + waiting line)
//   chat     POST {action:"chat", debug:true}                the real Buy search: the model turn with its tools, then the
//                                                            cards' enrichment; the stream's "text" event marks the end of
//                                                            the model turn (chatCore sends the reply only after the guard),
//                                                            "done" marks the end of enrichFast (the header + first cards)
//   explain  POST {action:"explain"} (probe)                 runSearch alone: resolver + the live_listings read + the fences
//   rerun    POST {action:"rerun", filters}                  the no-model path: toolSearchLive (nearest years, widen offers,
//                                                            asks, the cards' markets without blocking) + enrichFast
//   enrich   POST {action:"enrich", ids}                     the first ten cards' markets, blocking, + seen-before + timeline
// Derived: shape = done - text (enrichFast); tool = rerun - shape (toolSearchLive); model = text - tool.
//
//   PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)" node scripts/buyTimes.mjs [--cars "a|b"] [--runs 2]
// The key goes only in the x-ops-key header of same-origin requests (and the explain probe's body), never printed.
import puppeteer from "puppeteer-core";
import { crewCookie } from "./_crewCookie.mjs";

const arg = n => { const i = process.argv.indexOf("--" + n); if (i < 0) return null; const v = process.argv[i + 1]; return v == null || v.startsWith("--") ? "1" : v; };
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
const CARS = (arg("cars") || "Porsche 911|1965 Ford Mustang|2005 Porsche 911|2023 Porsche 911 GT3").split("|").map(s => s.trim()).filter(Boolean);
const RUNS = Math.max(1, Number(arg("runs")) || 1);
const LABEL = arg("label") || "";
const KEY = process.env.PROBE_KEY || null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!KEY) { console.log("buyTimes: no PROBE_KEY in the environment."); process.exit(1); }
const HOST = new URL(BASE).host;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 600000, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
await page.goto(BASE + "/buy", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 800));

// One POST to /api/buySearch from the page; JSON answers return {ms, j}; the chat stream returns its event times.
const post = (body, stream) => page.evaluate(async (body, stream) => {
  const t0 = performance.now(), ms = () => Math.round(performance.now() - t0);
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 180000);
  try {
    const r = await fetch("/api/buySearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
    const headersAt = ms();
    if (!stream || (r.headers.get("content-type") || "").indexOf("event-stream") < 0) { const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {} return { status: r.status, headersAt, ms: ms(), bytes: txt.length, j }; }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "", textAt = null, doneAt = null, done = null, firstByteAt = null, events = [];
    for (;;) {
      const x = await reader.read(); if (x.done) break;
      if (firstByteAt == null) firstByteAt = ms();
      buf += dec.decode(x.value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const name = (/^event: (.+)$/m.exec(ev) || [])[1], data = (/^data: (.*)$/m.exec(ev) || [])[1];
        events.push({ name, at: ms() });
        if (name === "text" && textAt == null) textAt = ms();
        if (name === "done") { doneAt = ms(); try { done = JSON.parse(data); } catch {} }
      }
    }
    return { status: r.status, headersAt, firstByteAt, textAt, doneAt, endAt: ms(), events, done };
  } catch (e) { return { status: 0, ms: ms(), error: String(e && e.message || e) }; } finally { clearTimeout(tm); }
}, body, stream);


// --page: the page itself, the way scripts/pushCheck.mjs measures it (crew cookie + key, from the start of the load to the
// header and to the first card on screen), plus every same-origin request the page made, with its action, start and length.
if (arg("page")) {
  const CREW = await crewCookie();
  console.log(`buyTimes PAGE ${LABEL} ${new Date().toISOString()} base ${BASE} runs ${RUNS} crew ${CREW ? "yes" : "no"}`);
  for (let run = 1; run <= RUNS; run++) for (const q of CARS) {
    const pg = await browser.newPage(); await pg.setViewport({ width: 1280, height: 900 });
    if (CREW) await pg.setCookie({ name: "gas_crew", value: CREW, domain: new URL(BASE).hostname, path: "/" });
    await pg.setRequestInterception(true);
    const reqs = new Map(); let T0 = 0;
    pg.on("request", r => { let own = false; try { own = new URL(r.url()).host === HOST; } catch {} if (own) { let act = ""; try { act = JSON.parse(r.postData() || "{}").action || (r.postData() ? "q" : ""); } catch {} reqs.set(r, { url: r.url().replace(BASE, "").replace(/\?.*$/, m => m.slice(0, 40)), act, start: Date.now() - T0 }); }
      r.continue(own ? { headers: { ...r.headers(), "x-ops-key": KEY, "x-launch-stage-test": "2" } } : undefined); });
    pg.on("requestfinished", r => { const x = reqs.get(r); if (x) { x.end = Date.now() - T0; x.status = r.response() && r.response().status(); } });
    pg.on("requestfailed", r => { const x = reqs.get(r); if (x) { x.end = Date.now() - T0; x.status = "failed"; } });
    await pg.evaluateOnNewDocument(() => { const T0 = performance.now(); window.__buyT = {}; const tick = () => { const t = window.__buyT, now = Math.round(performance.now() - T0);
      if (!t.header && document.querySelector(".msg.results:not(.stale) .shead, .msg.searching .sq-count .sc-1")) t.header = now;
      if (!t.card && [...document.querySelectorAll(".msg.results:not(.stale) article.car:not(.skel)")].some(a => a.offsetParent)) t.card = now;
      if (!t.still && /still finding the sales/.test(document.body ? document.body.innerText : "")) t.still = now;
      if (!t.named && /Sam is (finding live|searching )/.test(document.body ? document.body.innerText : "")) t.named = now;
      if (!(t.header && t.card)) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    T0 = Date.now();
    await pg.goto(BASE + "/buy?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(e => console.log("load error " + e.message));
    for (let i = 0; i < 90; i++) { const t = await pg.evaluate(() => window.__buyT || {}).catch(() => ({})); if (t.header && t.card) break; await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 1500));
    const t = await pg.evaluate(() => window.__buyT || {}).catch(() => ({}));
    const sec = ms => ms ? (ms / 1000).toFixed(1) + " s" : "never";
    console.log(`${q} | run ${run} | named ${sec(t.named)} | header ${sec(t.header)} | first card ${sec(t.card)}${t.still ? " | still finding at " + sec(t.still) : ""}`);
    const list = [...reqs.values()].filter(x => /\/api\/|part=/.test(x.url)).sort((a, b) => a.start - b.start);
    for (const x of list) console.log(`    ${String(x.start).padStart(6)} ms  ${x.end != null ? String(x.end - x.start).padStart(6) + " ms" : "   open   "}  ${x.act || ""} ${x.url} ${x.status || ""}`);
    await pg.close();
  }
  await browser.close();
  process.exit(0);
}

const fmt = v => v == null ? "-" : String(v);
const isPend = c => !c || c.market === undefined || (c.market && c.market.kind === "pending");
console.log(`buyTimes ${LABEL} ${new Date().toISOString()} base ${BASE} runs ${RUNS}`);
console.log("search | run | ping | parse | chat: headers / text / done | server turn ms | model calls (cache read) | tools | live | cards (pending) | explain | rerun (pending) | enrich n | DERIVED model / tool / shape");
const rows = [];
for (let run = 1; run <= RUNS; run++) {
  for (const q of CARS) {
    const ping = await post({ action: "converse", state: { messages: [] } });
    const parse = await post({ action: "parse", text: q });
    const chat = await post({ action: "chat", messages: [{ role: "user", content: q }], state: { filters: {} }, turns: 0, debug: true }, true);
    const d = chat.done || {};
    const trace = d.trace || [], sl = trace.find(t => t.tool === "search_live"), filters = (sl && sl.input) || (d.state && d.state.filters) || {};
    const usage = d.usage || {}, cards = d.cards || [], pend = cards.filter(isPend).length;
    const explain = await post({ action: "explain", key: KEY, p: filters });
    const rerun = await post({ action: "rerun", filters, turns: 1 });
    const rc = (rerun.j && rerun.j.cards) || [], rpend = rc.filter(isPend).length;
    const ids = cards.slice(0, 10).map(c => c.id).filter(Boolean);
    const enrich = ids.length ? await post({ action: "enrich", ids }) : { ms: null };
    const shape = chat.doneAt != null && chat.textAt != null ? chat.doneAt - chat.textAt : null;
    const tool = shape != null && rerun.ms != null ? Math.max(0, rerun.ms - shape) : null;
    const model = tool != null && chat.textAt != null ? Math.max(0, chat.textAt - tool) : null;
    const row = { q, run, ping: ping.ms, parse: parse.ms, headersAt: chat.headersAt, textAt: chat.textAt, doneAt: chat.doneAt, serverMs: d.ms, calls: usage.calls, cacheRead: usage.cache_read_input_tokens, tools: trace.map(t => t.tool).join("+"), live: d.meta && d.meta.live, cards: cards.length, pend, explain: explain.ms, rerun: rerun.ms, rpend, enrich: enrich.ms, enrichN: ids.length, model, tool, shape, filters, error: chat.error || null, guards: d.guards || null, reply: d.reply };
    rows.push(row);
    console.log(`${q} | ${run} | ${fmt(ping.ms)} | ${fmt(parse.ms)} | ${fmt(chat.headersAt)} / ${fmt(chat.textAt)} / ${fmt(chat.doneAt)} | ${fmt(d.ms)} | ${fmt(usage.calls)} (${fmt(usage.cache_read_input_tokens)}) | ${row.tools || "-"} | ${fmt(row.live)} | ${cards.length} (${pend}) | ${fmt(explain.ms)} | ${fmt(rerun.ms)} (${rpend}) | ${fmt(enrich.ms)} ${ids.length} | ${fmt(model)} / ${fmt(tool)} / ${fmt(shape)}${chat.error ? " ERROR " + chat.error : ""}`);
    if (arg("verbose")) console.log("   filters " + JSON.stringify(filters) + " events " + JSON.stringify(chat.events || []) + (d.guards && d.guards.length ? " guards " + JSON.stringify(d.guards.map(g => g.reasons)) : "") + " reply " + JSON.stringify(d.reply || ""));
  }
}
await browser.close();
if (arg("json")) console.log(JSON.stringify(rows));
