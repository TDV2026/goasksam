// THE POOLED STATES (Sam, Oct 27 2026; Lane B's e95 engine fields): when a question's options (body, gearbox, edition) price apart or split, every consumer of the engine's answer
// prints it, never a blank, never one pooled range where an option line is due. The 2001 BMW M3 (scripts/fixtures/m3Answer.json, a real engine answer) is the fixture, taken to each state by the
// engine's own contract: ALIKE (no pooled field, the answer as today); SPLIT (pooledSplit: the pooled headline stays, each option's own range and count under the card); APART (pooledApart: no headline
// range, cluster null, each option's own range and count); APART with the chart withheld (trendHeld mix_changes: no chart, one plain line why). Consumers: Market Check (the real page, in Chrome, the
// option lines open the option), the shared card (Find, Tasks, Sell, emails, partner), Find's market object and card line, the history page, the MCP tool. Not consumers of this state, and why: the Desk
// (its own executor, no pooled answer) and the spec and hub pages (one page per generation, trim, body and gearbox; they read the archive pool and carry no option question).   No network.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname); process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
globalThis.fetch = async () => { throw new Error("no network in this check"); };
const base = JSON.parse(fs.readFileSync("scripts/fixtures/m3Answer.json", "utf8"));
const OPT = (dimension, label, value, n, low, high, median) => ({ dimension, label, value, n, low, high, ...(median ? { median } : {}) });
const THIN = "These sales split into options that sit in different price ranges, so no one typical range is shown. Pick an option below to read its own sales.";
const STATES = {
  alike: base,
  split: { ...base, pooledSplit: { flag: "pooled_split", thresholdPct: 15, floor: 3, dimensions: ["body"], options: [OPT("body", "Convertible", "convertible", 9, 29000, 42500, 35500), OPT("body", "Coupe", "coupe", 8, 22500, 31500, 27000)] } },
  apart: { ...base, cluster: null, referenceFigure: null, noCluster: true, thinReason: "pooled_apart", thinLine: THIN, pooledApart: { dimensions: ["body"], test: "splitMaterial", floor: 3, options: [OPT("body", "Convertible", "convertible", 9, 36000, 48000), OPT("body", "Coupe", "coupe", 8, 21000, 29000)] }, trend: null, trendHeld: { reason: "mix_changes", spreadPts: 22, limitPts: 10, periods: 5 } },
};
const LINES = { body: ["Convertible: $29,000 to $42,500, 9 sales.", "Coupe: $22,500 to $31,500, 8 sales."], apartBody: ["Convertible: $36,000 to $48,000, 9 sales.", "Coupe: $21,000 to $29,000, 8 sales."] };
const POOLED_RANGE = "$22,500 to $41,000", HELD = "The mix of cars changed from quarter to quarter, so a change here would not show the market moving.";
const flat = h => String(h || "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#8217;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const NOT_BLANK = (s, what) => ok(s.length > 20, `${what}: not blank`);

// 1. Market Check, the real page in Chrome
{
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(CHROME)) console.log("SKIP Market Check in Chrome: no Chrome at " + CHROME);
  else {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
    for (const [name, payload] of Object.entries(STATES)) for (const w of [1440, 390]) {
      const p = await b.newPage(); await p.setViewport({ width: w, height: 900 }); p._posts = [];
      await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url());
        if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
        const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
        if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
        if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") { let bd = {}; try { bd = JSON.parse(r.postData() || "{}"); } catch {} p._posts.push(bd); return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(p._posts.length === 1 ? payload : { ...base, status: "one_box" }) }); }
        if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
        if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
      await p.type("#ob-input", "2001 BMW M3"); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1800));
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " "));
      const lines = await p.evaluate(() => Array.from(document.querySelectorAll(".hero-poolline")).map(e => e.innerText.replace(/\s+/g, " ").trim()));
      const where = `Market Check ${name} at ${w}`;
      NOT_BLANK(t, where);
      ok(!/undefined|NaN|\[object/.test(t), `${where}: nothing broken prints`);
      if (name === "alike") {
        ok(t.includes(POOLED_RANGE) && /Which M3\? Convertible \(9\) · Coupe \(8\)/.test(t) && lines.length === 0, `${where}: as today, the pooled range and the count only line, no option lines`);
      } else if (name === "split") {
        ok(t.includes(POOLED_RANGE), `${where}: the pooled headline stays`);
        ok(LINES.body.every(l => t.includes(l)) && lines.length === 1, `${where}: each option's own range and count on a line under the card (${JSON.stringify(lines)})`);
        ok(!/Which M3\? Convertible \(9\)/.test(t), `${where}: the count only line is replaced`);
      } else {
        ok(!t.includes(POOLED_RANGE) && !/\$22,500 to \$41,000/.test(t), `${where}: no pooled headline range`);
        ok(t.includes(THIN), `${where}: the engine's line says why no one range is shown`);
        ok(LINES.apartBody.every(l => t.includes(l)) && lines.length === 2, `${where}: each option on its own line with its own range and count (${JSON.stringify(lines)})`);
        ok(!/Which M3\? Convertible \(9\)/.test(t), `${where}: the count only line is replaced`);
        ok(t.includes(HELD) && !/Too few to show movement/.test(t), `${where}: the chart is withheld with one plain line why, not the thin sales line`);
        ok(!/How this market has moved/.test(t), `${where}: no movement chart`);
      }
      if (name !== "alike" && w === 1440) {
        const before = p._posts.length;
        await p.click(".hero-poolline [data-bodyopt='convertible']").catch(() => {}); await new Promise(r => setTimeout(r, 1200));
        const last = p._posts[p._posts.length - 1] || {};
        ok(p._posts.length > before && last.refine && last.refine.body === "convertible", `${where}: the Convertible line opens the Convertible (refine ${JSON.stringify(last.refine || null)})`);
      }
      await p.close();
    }
    await b.close();
  }
}

// 2. the shared card (Find, Tasks, Sell, the emails, the partner demo)
{
  const card = await import("../lib/sellsForCard.js");
  for (const [name, a] of Object.entries(STATES)) {
    const t = flat(card.sellsForCardHtml(a, { marketHref: "/market-check?q=x" })), where = `the shared card, ${name}`;
    NOT_BLANK(t, where);
    if (name === "alike") ok(t.includes(POOLED_RANGE) && !/Convertible: \$/.test(t), `${where}: as today`);
    if (name === "split") ok(t.includes(POOLED_RANGE) && LINES.body.every(l => t.includes(l)), `${where}: the headline stays and each option has its own line`);
    if (name === "apart") ok(!t.includes(POOLED_RANGE) && t.includes(THIN) && LINES.apartBody.every(l => t.includes(l)), `${where}: no pooled range, the engine's line, each option's own line`);
  }
  // Sell and Find hand the card only the fields on their lists: the pooled fields are on both lists
  const sf = await import("../lib/sell/sellFacts.js");
  for (const [name, a] of Object.entries(STATES)) {
    const kept = sf.cardAnswerOf(a);
    ok(name === "alike" || (name === "split" ? !!kept.pooledSplit : !!kept.pooledApart && !!kept.trendHeld), `Sell's card fields keep the engine's pooled fields (${name})`);
    const t = flat(card.sellsForCardHtml(kept, {}));
    if (name === "split") ok(LINES.body.every(l => t.includes(l)), "Sell: the split options reach the card");
    if (name === "apart") ok(LINES.apartBody.every(l => t.includes(l)) && !t.includes(POOLED_RANGE), "Sell: the apart options reach the card, no pooled range");
  }
  const srcSearch = fs.readFileSync("lib/live/search.js", "utf8");
  ok(/"pooledApart", "pooledSplit", "trendHeld"\]/.test(srcSearch), "Find's card fields keep the engine's pooled fields");
}

// 3. Find: the market object and the card line
{
  const { marketOf } = await import("../lib/live/search.js");
  const mAlike = marketOf(STATES.alike), mSplit = marketOf(STATES.split), mApart = marketOf(STATES.apart);
  ok(mAlike.kind === "range" && !mAlike.options, "Find market, alike: a range, no options");
  ok(mSplit.kind === "range" && mSplit.low === 22500 && (mSplit.options || []).length === 2 && mSplit.options[0].label === "Convertible", "Find market, split: the range stays and the options ride with it");
  ok(mApart.kind === "count" && mApart.spread === false && (mApart.options || []).length === 2 && mApart.low === undefined, "Find market, apart: a count carrying the options, no range, never 'too spread out'");
  const s = fs.readFileSync("api/buy.js", "utf8"), i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
  const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
  const esc = new Function(block("function esc(s){", "function usd(n)") + "\nreturn esc;")();
  const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
  const samLine = new Function("esc", "thinSales", "READING_LINE", "rungHtml", "rungShown", "usd", "var REL_MC = true;\n" + block("  function rangeFirst(", "  function noRange(") + "\n" + block("  function noRange(", "  function compactNoRange(") + "\n" + block("  function compactNoRange(", "  function samLine(") + "\n" + block("  function samLine(l){", "  // SPEC CHIPS under the bid line") + "\nreturn samLine;")(esc, () => null, "reading", () => "", () => [], usd);
  for (const [name, m, lines] of [["alike", mAlike, ["Sam finds the range $22,500 to $41,000."]], ["split", mSplit, ["Sam finds the range $22,500 to $41,000."]], ["apart", mApart, [THIN.split(". ")[0] + "."]]]) {
    const out = samLine({ id: 1, market: m, sam_lines: [{ kind: "range", text: lines[0], rung: null }] });
    const t = flat(out && out.html);
    NOT_BLANK(t, `Find card, ${name}`);
    if (name === "split") ok(LINES.body.every(l => t.includes(l)), "Find card, split: each option's own range and count under the line");
    if (name === "apart") ok(LINES.apartBody.every(l => t.includes(l)) && !t.includes(POOLED_RANGE), "Find card, apart: the engine's line, then each option's own line, no pooled range");
    if (name === "alike") ok(!/Convertible:/.test(t), "Find card, alike: no option lines");
  }
}

// 4. the history page
{
  const { oneBoxBlock = () => "" } = await import("../api/history.js");
  const id = { make: "BMW", family: "M3", model: "M3", year: 2001, label: "BMW M3" };
  for (const [name, a] of Object.entries(STATES)) {
    const t = flat(oneBoxBlock(a, id, "/x", "")), where = `the history page, ${name}`;
    NOT_BLANK(t, where);
    if (name === "alike") ok(t.includes(POOLED_RANGE) && !/Convertible:/.test(t), `${where}: as today`);
    if (name === "split") ok(t.includes(POOLED_RANGE) && LINES.body.every(l => t.includes(l)), `${where}: the headline stays and each option has its own line`);
    if (name === "apart") ok(!t.includes(POOLED_RANGE) && /These sell in different price ranges, so one range would mislead\./.test(t) && LINES.apartBody.every(l => t.includes(l)) && !/too spread out/.test(t), `${where}: one plain line, each option's own line, never 'too spread out'`);
  }
}

// 5. the MCP tool
{
  const { toolAnswerOf = () => ({}) } = await import("../lib/tools/marketCheck.js");
  const r = { vehicle: { make: "BMW", model: "M3", year: 2001 } };
  for (const [name, a] of Object.entries(STATES)) {
    const o = toolAnswerOf(a, r) || {};
    ok(o && o.kind, `the MCP tool, ${name}: answers`);
    if (name === "alike") ok(o.kind === "answer" && !o.byOption, "the MCP tool, alike: as today");
    if (name === "split") ok(o.kind === "answer" && o.soldRangeHammerUsd && (o.byOption || []).length === 2 && o.byOption[0].option === "Convertible", "the MCP tool, split: the range stays and carries each option");
    if (name === "apart") ok(o.kind === "answer_by_option" && !o.soldRangeHammerUsd && (o.options || []).length === 2 && /different price ranges/.test(o.note) && !/spread out/.test(JSON.stringify(o)), "the MCP tool, apart: no band, each option's own range, never 'too spread out'");
  }
}
console.log(`pooledStatesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
