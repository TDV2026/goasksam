// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// A RESULTS PAGE NEVER ANSWERS WITH A QUESTION ALONE (Lane B, Nov 11 2026). /find?q=Porsche 911 as a visitor answered "Which generation? 3.2 Carrera, 996, 997, 991.1 or 992. Or say any, or just show me." and showed no cars. CAUSE: when the written answer is paused (the device's ceiling: api/buySearch answers
// {"fallback":true,"capped":"device"}) the page asks the scripted conversation (lib/live/converse.js), which RETURNED the question (type "question") and nothing else, for every narrowing question it has (generation, body, miles, budget, kind, where are you, how far). The written path shows the cars and the
// question beside them. NOW converse returns the cars as the result and the question as `offer` (results.offer, groups.offer), and the page prints the offer above the cards, as "Which body style?" is.
// CLASS: every narrowing question the conversation can ask, driven to the end through its own answers, with live matches, always returns results or groups with cards and an offer; "question" is never the whole answer. Offline: fetch is stubbed.
//   node scripts/findAlwaysCardsCheck.mjs [repo root]   (a tree without the fix fails: run it against origin/main); --mutants breaks one rule at a time.
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const NOW = Date.now(), DAY = 864e5, STATES = ["TX", "CA", "NY", "FL", "WA", "IL"], CITY = { TX: "Austin", CA: "Los Angeles", NY: "Albany", FL: "Miami", WA: "Seattle", IL: "Chicago" };
const YEARS = [1987, 1995, 2001, 2003, 2008, 2010, 2014, 2016, 2017, 2020, 2022, 2023], TRIMS = ["Carrera", "Carrera", "Carrera 4S", "Carrera", "Carrera S", "Turbo", "Carrera S", "GT3 RS", "Carrera GTS", "Carrera S", "Turbo S", "GT3"], BODY = ["coupe", "coupe", "coupe", "cabriolet", "coupe", "coupe", "coupe", "coupe", "cabriolet", "coupe", "coupe", "coupe"];
const rows = Array.from({ length: 48 }, (_, i) => { const k = i % 12, st = STATES[i % 6]; return { id: 100 + i, source: i % 3 ? "bringatrailer" : "carsandbids", source_listing_id: "s" + i, url: "https://auction.test/l/" + i, listing_title: `${YEARS[k]} Porsche 911 ${TRIMS[k]}`, make: "Porsche", model: "911", year: YEARS[k], vin_norm: null, mileage: 8000 + i * 2500, mileage_unit: "mi", body: BODY[k], transmission: i % 2 ? "Manual" : "Automatic", location: `${CITY[st]}, ${st}`, country: "US", currency: "USD", current_bid: 30000 + i * 6000, current_bid_usd: 30000 + i * 6000, end_time: new Date(NOW + (1 + i) * 3600e3 * 7).toISOString(), photo_url: "https://img.test/p" + i + ".jpg", status: "live", exterior_color: ["Red", "Black", "White", "Silver"][i % 4], description: "", bid_at: new Date(NOW - 3600e3).toISOString(), last_seen: new Date(NOW).toISOString(), first_seen: new Date(NOW - 5 * DAY).toISOString() }; });
// the reads behind a card (the stored markets, the archive, the VIN history) can be slow: DELAY.card is how slow, in ms (the timing section sets it)
const DELAY = { card: 0, pool: 0 };
globalThis.fetch = async (url) => { const u = String(url); if (/\/rest\/v1\/(spec_market_cache|sales_archive|vin_index|auction_attempts|vin_summary)/.test(u) && DELAY.card) await new Promise(r => setTimeout(r, DELAY.card)); if (/\/rest\/v1\/live_listings/.test(u) && DELAY.pool) await new Promise(r => setTimeout(r, DELAY.pool)); return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? rows : []), { status: 200 }); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { converse } = await imp("lib/live/converse.js"), { default: bs } = await imp("api/buySearch.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const post = async body => { let out = null; const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(o) { out = o; return this; }, end() { return this; } }; await bs({ method: "POST", headers: { cookie: "", host: "x", "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200) }, query: {}, body, url: "/api/buySearch" }, res); return out || {}; };
const cardsOf = w => (w.cards || []).length + (w.groups || []).reduce((n, g) => n + (g.cards || []).length, 0);
// (1) the report: a bare make-model search with live matches always draws cars
{ const r = await converse(env, { messages: ["Porsche 911"], answered: [], asked: 0 });
  ok("(1) converse: Porsche 911 with 48 live matches is results with the cars, never a question alone", r.type === "results" && (r.matches || []).length > 0, [r.type, (r.matches || []).length]);
  ok("(1) the generation question rides with them as the offer", r.offer && r.offer.key === "generation" && /^Which generation\?/.test(r.offer.prompt) && r.offer.options.length >= 2, r.offer && r.offer.prompt);
  const w = await post({ action: "converse", state: { id: "c1", messages: ["Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false } });
  ok("(1) the wire answer (what the page reads): results, cards drawn, the offer present", w.type === "results" && cardsOf(w) > 0 && w.offer && w.offer.key === "generation", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (2) every narrowing question the conversation can ask, driven through its own answers: the cars every time, the question as the offer
{ const seen = []; let st = { messages: ["Porsche 911"], answered: [], asked: 0, filters: null };
  for (let step = 0; step < 6; step++) {
    const w = await post({ action: "converse", state: { id: "c2", zip: null, place: null, showNow: false, ...st } });
    ok(`(2) step ${step + 1}: ${w.type}, never a question alone`, w.type !== "question" && (w.type === "results" || w.type === "groups") && cardsOf(w) > 0, [w.type, cardsOf(w)]);
    if (!w.offer) break;
    seen.push(w.offer.key);
    st = { messages: st.messages, answered: [...st.answered, w.offer.key], asked: st.asked + 1, filters: w.offer.filters || w.filters || st.filters };
  }
  ok("(2) the conversation offers at least generation, mileage and budget in turn, each beside the cars", ["generation", "mileage", "budget"].every(k => seen.includes(k)), seen); }
// (3) a year typed leaves the body question: still the cars
{ const w = await post({ action: "converse", state: { id: "c3", messages: ["2016 Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false } });
  ok("(3) 2016 Porsche 911: the cars, and any narrowing question is the offer", w.type !== "question" && cardsOf(w) > 0, [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (4) a broad search (no model): the groups, the kind question as the offer
{ const w = await post({ action: "converse", state: { id: "c4", messages: ["manual cars"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false } });
  ok("(4) a broad search with no model draws the groups, never a question alone, and the kind question is the offer", w.type === "groups" && cardsOf(w) > 0 && w.offer && w.offer.key === "kind", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (5) near me with no zip: the cars (unsorted) and the question, not the question alone
{ const w = await post({ action: "converse", state: { id: "c5", messages: ["Porsche 911 near me"], filters: null, answered: ["generation"], asked: 1, zip: null, place: null, showNow: false } });
  ok("(5) near me with no zip: the cars are drawn and where-are-you is the offer", w.type !== "question" && cardsOf(w) > 0 && w.offer && w.offer.key === "location", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (7) THE TIMING BUDGET PER STAGE (Nov 11 2026). Lane C measured /find?q=Porsche 911 at 15 s to the cards and a typed "Porsche 911" at over 60 s. Measured stages (production, Nov 11): live pool read 0.3 to 1.3 s, the first ten cards' market reads 6 to 9 s on a cold spec (the slowest held the whole answer),
// the written answer's tool round 0.25 to 3.8 s plus its model round 1.5 s, and a typed answer that ran out of time was asked again (25 s, 25 s, then the scripted search). The cards must draw within a few seconds whatever the reads behind them do: a card whose reads are not back in CARD_BUDGET_MS is
// drawn at once with the engine's being-read line and filled in place. Here the pool read is slow (400 ms) and every read behind a card takes 4.5 s: the answer still arrives inside its budget, with the cars.
{ const { CARD_BUDGET_MS, converseOut } = await imp("api/buySearch.js"); DELAY.pool = 400;
  const SLOW = 8000, slowEnrich = async (e, x) => { await new Promise(r => setTimeout(r, SLOW)); return { id: x.r.id, title: "slow", market: { kind: "range" } }; };   // a cold spec: the per-card read takes 8 s (Ford Bronco read 8.3 s cold in production)
  const BUDGET = { converse: 2500, cards: 3900, total: 5500 };   // fixed numbers, not derived from the code under test: the cards 3 s plus 0.9 s, the whole answer 5.5 s
  ok("(7) the first batch's own clock is three seconds", CARD_BUDGET_MS === 3000, CARD_BUDGET_MS);
  const t0 = Date.now(), w = await converseOut(env, { action: "converse", debug: true, state: { id: "t1", messages: ["Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false } }, { enrichOne: slowEnrich }), wall = Date.now() - t0;
  ok(`(7) the cars are drawn within ${BUDGET.total} ms whatever the reads behind them take (wall ${wall} ms, a read takes ${SLOW} ms)`, w.type === "results" && cardsOf(w) > 0 && wall <= BUDGET.total, [wall, w.type, cardsOf(w)]);
  const tm = w.times || {};
  ok(`(7) stage budgets: the live pool and the resolve inside ${BUDGET.converse} ms (${tm.converse}), the cards inside ${BUDGET.cards} ms (${tm.cards})`, tm.converse <= BUDGET.converse && tm.cards <= BUDGET.cards, tm);
  ok("(7) a card whose reads are late is drawn at once with the engine's being-read market (kind pending), never held back and never blank", (w.cards || []).filter(c => c.market && c.market.kind === "pending").length >= 1 && (w.cards || []).slice(0, 10).every(c => c.market !== undefined), (w.cards || []).slice(0, 3).map(c => c.market && c.market.kind));
  ok("(7) the stage times travel with the answer (times) so a slow answer is read from the answer itself", typeof tm.converse === "number" && typeof tm.cards === "number" && typeof tm.total === "number", tm);
  const fast = await converseOut(env, { action: "converse", debug: true, state: { id: "t2", messages: ["Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false } }, { enrichOne: async (e, x) => ({ id: x.r.id, title: "fast", market: { kind: "range" } }) });
  ok("(7) reads that are back in time are drawn whole (no card pending)", (fast.cards || []).slice(0, 10).every(c => c.market && c.market.kind === "range"), (fast.cards || []).slice(0, 3).map(c => c.market && c.market.kind));
  DELAY.card = 0; DELAY.pool = 0; }
// (6) the page prints the offer above the cards, from the server's own fields, and the client parses
{ const buy = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), m = /^const CLIENT = (".*");$/m.exec(buy); let parses = false, code = ""; try { code = eval(m[1]); new Function(code); parses = true; } catch (e) { parses = false; }
  ok("(6) the Find client draws the scripted answer at once (no wait on every first card's line) and does not ask a timed-out written answer again", parses && /THE CARDS ARE DRAWN AT ONCE/.test(code) && !/enrichThen\(pend, function\(\)\{ th\.done\(\); draw\(\); \}\)/.test(code) && /Date\.now\(\) - chatT0 < 10000/.test(code), parses);
  ok("(6) the Find client parses and prints d.offer through the same question line (offerAsk), above the results", parses && /offerAsk\(d\.offer\)/.test(code) && code.indexOf("offerAsk(d.offer)") < code.indexOf("lastResult = d;") && /if \(d\.type === "question"\) \{ offerAsk\(d\); input\.focus\(\); return; \}/.test(code), parses); }
console.log(`findAlwaysCardsCheck: ${fail ? fail + " FAIL" : "all pass"} (${pass})`); process.exit(fail ? 1 : 0);

function mutants() {
  const M = [
    ["lib/live/converse.js", "if (q) { offer = { ...q, key: q.key === \"body\" ? \"body\" : key, filters: f }; break; }", "if (q) return { type: \"question\", ...q, key: q.key === \"body\" ? \"body\" : key, filters: f };", "(1) converse: Porsche 911"],
    ["lib/live/converse.js", "if (q) { offer = { ...q, key, filters: f }; break; }", "if (q) return { type: \"question\", ...q, key, filters: f };", "(4) a broad search"],
    ["lib/live/converse.js", "    offer = { key: \"location\", prompt: \"Where are you?\", free: \"A ZIP or a city is fine, or say\", options: [{ label: \"anywhere\", value: \"__any\" }], noTail: true, filters: f };", "    return { type: \"question\", key: \"location\", prompt: \"Where are you?\", free: \"A ZIP or a city is fine, or say\", options: [{ label: \"anywhere\", value: \"__any\" }], noTail: true };", "(5) near me with no zip"],
    ["api/buySearch.js", "perCard: !!r.perCard, ...(r.offer ? { offer: r.offer } : {}) };", "perCard: !!r.perCard };", "(4) a broad search"],
    ["api/buySearch.js", "return { type: \"results\", ...(r.offer ? { offer: r.offer } : {}), say: say,", "return { type: \"results\", say: say,", "(1) the wire answer"],
    ["api/buy.js", "if (d.offer) offerAsk(d.offer);", "", "(6) the Find client parses"],
    ["lib/live/converse.js", "matches.length > 5 && !offer) {", "matches.length > 5) {", "(5) near me with no zip"],
    ["api/buySearch.js", "const head = keep.slice(0, n), pre = preFor(head), got = await moreBatch(head, { enrichOne: async x => { await pre; return (deps.enrichOne || enrichFast)(env, x); }, pendingOf: pendingCardOf, budgetMs: CARD_BUDGET_MS });", "const head = keep.slice(0, n), got = await Promise.all(head.map(x => (deps.enrichOne || enrichFast)(env, x)));", "(7) the cars are drawn within"],
    ["api/buySearch.js", "export const CARD_BUDGET_MS = BATCH_BUDGET_MS;", "export const CARD_BUDGET_MS = 60000;", "(7) the cars are drawn within"],
    ["api/buySearch.js", "times.total = Date.now() - T0; if (out && typeof out === \"object\") { Object.defineProperty(out, \"_times\", { value: times, enumerable: false }); if (b.debug) out.times = times; }", "", "(7) the stage times travel"],
    ["api/buy.js", "return draw();", "var th = thinking(); return enrichThen(pend, function(){ th.done(); draw(); });", "(6) the Find client draws the scripted answer at once"],
    ["api/buy.js", "Date.now() - chatT0 < 10000", "true", "(6) the Find client draws the scripted answer at once"]
  ];
  let bad = 0;
  for (const [file, from, to, name] of M) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fac-"));
    for (const d of ["lib", "api", "scripts", "public"]) fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true, filter: s => !/node_modules/.test(s) });
    for (const f of ["vercel.json", "package.json"]) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"));
    const fp = path.join(tmp, file), src = fs.readFileSync(fp, "utf8");
    if (!src.includes(from)) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + from.slice(0, 60)); bad++; continue; }
    fs.writeFileSync(fp, src.replace(from, to));
    const r = spawnSync("node", [path.join(tmp, "scripts/findAlwaysCardsCheck.mjs"), tmp], { encoding: "utf8", timeout: 180000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").filter(l => l.startsWith("FAIL")).slice(0, 3).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`findAlwaysCardsCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
