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
const ENGINE_THIN = "These sales split into options that sit in different price ranges, so no one typical range is shown. Pick an option below to read its own sales.";   // what Lane B's engine says; the pages print the one plain sentence instead
const { POOLED_APART_LINE: THIN } = await import("../lib/pooledWords.js");
const STATES = {
  alike: base,
  split: { ...base, optionsState: "alike", options: [OPT("body", "Convertible", "convertible", 9, 29000, 42500, 35500), OPT("body", "Coupe", "coupe", 8, 22500, 31500, 27000)] },   // e96: the range stays and the options field rides with it
  apart: { ...base, cluster: null, referenceFigure: null, noCluster: true, thinReason: "pooled_apart", thinLine: ENGINE_THIN, pooledApart: { dimensions: ["body"], test: "splitMaterial", floor: 3, options: [OPT("body", "Convertible", "convertible", 9, 36000, 48000), OPT("body", "Coupe", "coupe", 8, 21000, 29000)] }, trend: null, trendHeld: { reason: "mix_changes", spreadPts: 22, limitPts: 10, periods: 5 } },
};
// The Coupe reads a longer window in its own answer (bodyOptions: 13 sales over the last 24 months), so its line carries the engine's words, not the pool's 8.
const COUPE_NOTE = "Based on 13 sales over the last 24 months.";
const LINES = { body: ["Convertible: $29,000 to $42,500, 9 sales.", "Coupe: $22,500 to $31,500. " + COUPE_NOTE], apartBody: ["Convertible: $36,000 to $48,000, 9 sales.", "Coupe: $21,000 to $29,000. " + COUPE_NOTE] };
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
        ok(t.includes(THIN) && !t.includes(ENGINE_THIN), `${where}: the one plain sentence says why no one range is shown, not the engine's wording`);
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
    if (name === "apart") ok(!t.includes(POOLED_RANGE) && t.includes(THIN) && !t.includes(ENGINE_THIN) && LINES.apartBody.every(l => t.includes(l)), `${where}: no pooled range, the engine's line, each option's own line`);
  }
  // Sell and Find hand the card only the fields on their lists: the pooled fields are on both lists
  const sf = await import("../lib/sell/sellFacts.js");
  for (const [name, a] of Object.entries(STATES)) {
    const kept = sf.cardAnswerOf(a);
    ok(name === "alike" || (name === "split" ? !!kept.options : !!kept.pooledApart && !!kept.trendHeld), `Sell's card fields keep the engine's pooled fields (${name})`);
    const t = flat(card.sellsForCardHtml(kept, {}));
    if (name === "split") ok(LINES.body.every(l => t.includes(l)), "Sell: the split options reach the card");
    if (name === "apart") ok(LINES.apartBody.every(l => t.includes(l)) && !t.includes(POOLED_RANGE), "Sell: the apart options reach the card, no pooled range");
  }
  const { CARD_FIELDS } = await import("../lib/engineFields.js");
  ok(["pooledApart", "pooledSplit", "trendHeld"].every(k => CARD_FIELDS.includes(k)) && /for \(const k of CARD_FIELDS\)/.test(fs.readFileSync("lib/live/search.js", "utf8")), "Find's card fields keep the engine's pooled fields (the one list)");
}

// 3. Find: the market object and the card line
{
  const { marketOf, coreOf } = await import("../lib/live/search.js");
  const mAlike = marketOf(STATES.alike), mSplit = marketOf(STATES.split), mApart = marketOf(STATES.apart);
  ok(mAlike.kind === "range" && !mAlike.options, "Find market, alike: a range, no options");
  ok(mSplit.kind === "range" && mSplit.low === 22500 && (mSplit.options || []).length === 2 && mSplit.options[0].label === "Convertible", "Find market, split: the range stays and the options ride with it");
  ok(mApart.kind === "count" && mApart.spread === false && (mApart.options || []).length === 2 && mApart.low === undefined, "Find market, apart: a count carrying the options, no range, never 'too spread out'");
  const s = fs.readFileSync("api/buy.js", "utf8"), i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
  const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
  const esc = new Function(block("function esc(s){", "function usd(n)") + "\nreturn esc;")();
  const usd = n => "$" + Math.round(Number(n)).toLocaleString("en-US");
  const samLine = new Function("esc", "thinSales", "READING_LINE", "rungHtml", "rungShown", "usd", "var REL_MC = true;\n" + block("  function rangeFirst(", "  function noRange(") + "\n" + block("  function noRange(", "  function compactNoRange(") + "\n" + block("  function compactNoRange(", "  function samLine(") + "\n" + block("  function samLine(l){", "  // SPEC CHIPS under the bid line") + "\nreturn samLine;")(esc, () => null, "reading", () => "", () => [], usd);
  for (const [name, m, lines] of [["alike", mAlike, ["Sam finds the range $22,500 to $41,000."]], ["split", mSplit, ["Sam finds the range $22,500 to $41,000."]], ["apart", mApart, [THIN]]]) {
    const out = samLine({ id: 1, market: m, sam_lines: [{ kind: "range", text: lines[0], rung: null }] });
    const t = flat(out && out.html);
    NOT_BLANK(t, `Find card, ${name}`);
    if (name === "split") ok(LINES.body.every(l => t.includes(l)), "Find card, split: each option's own range and count under the line");
    if (name === "apart") ok(LINES.apartBody.every(l => t.includes(l)) && !t.includes(POOLED_RANGE), "Find card, apart: the engine's line, then each option's own line, no pooled range");
    if (name === "alike") ok(!/Convertible:/.test(t), "Find card, alike: no option lines");
  }
}

{ const { coreOf } = await import("../lib/live/search.js");
  const core = coreOf(STATES.apart, { v: { make: "BMW", model: "M3", year: 2001 } }); ok(core && core.thinLine === THIN, "Find's core carries the one plain sentence, not the engine's (" + (core && core.thinLine) + ")");
  ok(coreOf(STATES.alike, { v: { make: "BMW", model: "M3", year: 2001 } }).thinLine === null, "Find's core, alike: no thin line");
  const copies = [["lib/sellsForCard.js", fs.readFileSync("lib/sellsForCard.js", "utf8")]];
  for (const [f, src] of copies) ok(src.includes('"' + THIN + '"'), `${f} carries the same sentence as lib/pooledWords.js`);
  const pa = await import("../api/partnerAnswer.js"); ok(typeof pa === "object", "the partner answer module loads with the helper"); }

// 4. the history page
{
  const { oneBoxBlock = () => "" } = await import("../api/history.js");
  const id = { make: "BMW", family: "M3", model: "M3", year: 2001, label: "BMW M3" };
  for (const [name, a] of Object.entries(STATES)) {
    const t = flat(oneBoxBlock(a, id, "/x", "")), where = `the history page, ${name}`;
    NOT_BLANK(t, where);
    if (name === "alike") ok(t.includes(POOLED_RANGE) && !/Convertible:/.test(t), `${where}: as today`);
    if (name === "split") ok(t.includes(POOLED_RANGE) && LINES.body.every(l => t.includes(l)), `${where}: the headline stays and each option has its own line`);
    if (name === "apart") ok(!t.includes(POOLED_RANGE) && t.includes(THIN) && LINES.apartBody.every(l => t.includes(l)) && !/too spread out/.test(t), `${where}: one plain line, each option's own line, never 'too spread out'`);
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
    if (name === "apart") ok(o.kind === "answer_by_option" && !o.soldRangeHammerUsd && (o.options || []).length === 2 && String(o.note || "").includes(THIN) && !/spread out/.test(JSON.stringify(o)), "the MCP tool, apart: no band, each option's own range, never 'too spread out'");
  }
}
// the window travels with the option: the lookup is the same on every surface, and a line never prints the pool's count where the option's own answer reads another
{ const { pooledNoteOf = () => "" } = await import("../lib/pooledWords.js");
  const grabFn = (src, name) => { const i = src.indexOf("function " + name + "("); let dd = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") dd++; else if (src[k] === "}" && !--dd) return src.slice(i, k + 1); } return ""; };
  const clientFn = new Function("return (" + grabFn(fs.readFileSync("public/js/onebox.js", "utf8"), "pooledNoteOf") + ")")();
  const cardFn = new Function("return (" + grabFn(fs.readFileSync("lib/sellsForCard.js", "utf8"), "pooledNoteOf") + ")")();
  const gbAnswer = { inlineSplits: [{ key: "gearbox", sides: [{ label: "Manuals", n: 9, windowLonger: true, windowNote: "Based on 12 sales over the last 30 months." }, { label: "PDKs", n: 8 }] }] };
  const edAnswer = { variantOptionsLine: [{ key: "edition", options: [{ value: "csl", label: "CSL", n: 4, windowLonger: true, windowNote: "Based on 5 sales over the last 36 months." }, { value: "std", label: "Standard", n: 20 }] }] };
  const CASES = [[base, { dimension: "body", value: "coupe" }, COUPE_NOTE], [base, { dimension: "body", value: "convertible" }, ""], [gbAnswer, { dimension: "gearbox", value: "manual" }, "Based on 12 sales over the last 30 months."], [gbAnswer, { dimension: "gearbox", value: "auto" }, ""],
    [edAnswer, { dimension: "edition", value: "csl" }, "Based on 5 sales over the last 36 months."], [edAnswer, { dimension: "edition", value: "std" }, ""], [base, { dimension: "body", value: "coupe", windowLonger: true, windowNote: "Based on 99 sales over the last 12 months." }, "Based on 99 sales over the last 12 months."]];
  for (const [a, o, want] of CASES) ok(pooledNoteOf(a, o) === want && clientFn(a, o) === want && cardFn(a, o) === want, `the option window is the same on every surface (${o.dimension} ${o.value}: ${JSON.stringify(want)})`);
  // the same case rendered on each surface: the Coupe's line never says 8 sales
  const card = await import("../lib/sellsForCard.js");
  for (const [name, a] of [["split", STATES.split], ["apart", STATES.apart]]) { const t = flat(card.sellsForCardHtml(a, {})); ok(!/Coupe: [^.]*\$\d[\d,]* to \$\d[\d,]*, 8 sales/.test(t) && t.includes(COUPE_NOTE), `the shared card, ${name}: the Coupe line carries its own window, not the pool's 8`); }
  const { marketOf } = await import("../lib/live/search.js");
  for (const [name, a] of [["split", STATES.split], ["apart", STATES.apart]]) { const o = (marketOf(a).options || []).find(x => x.label === "Coupe"); ok(o && o.note === COUPE_NOTE, `Find's market object, ${name}: the Coupe option carries the engine's window words`); }
  const { oneBoxBlock: hb = () => "" } = await import("../api/history.js");
  for (const [name, a] of [["split", STATES.split], ["apart", STATES.apart]]) ok(flat(hb(a, { make: "BMW", family: "M3", model: "M3", year: 2001, label: "BMW M3" }, "/x", "")).includes(COUPE_NOTE), `the history page, ${name}: the Coupe line carries its own window`);
  const { toolAnswerOf: ta = () => ({}) } = await import("../lib/tools/marketCheck.js");
  const tool = ta(STATES.apart, { vehicle: { make: "BMW", model: "M3", year: 2001 } }); ok(((tool.options || []).find(x => x.option === "Coupe") || {}).windowNote === COUPE_NOTE, "the MCP tool, apart: the Coupe carries its window note"); }
console.log(`pooledStatesCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
