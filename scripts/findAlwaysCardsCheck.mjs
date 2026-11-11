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
const DELAY = { card: 0, pool: 0 }, MODEL = { calls: 0 };   // MODEL.calls counts the requests that reach the model (api.anthropic.com), which answer 500 here
globalThis.fetch = async (url) => { const u = String(url); if (/api\.anthropic\.com/.test(u)) { MODEL.calls++; return new Response("{}", { status: 500 }); } if (/\/rest\/v1\/(spec_market_cache|sales_archive|vin_index|auction_attempts|vin_summary)/.test(u) && DELAY.card) await new Promise(r => setTimeout(r, DELAY.card)); if (/\/rest\/v1\/live_listings/.test(u) && DELAY.pool) await new Promise(r => setTimeout(r, DELAY.pool)); return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? rows : []), { status: 200 }); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const { converse } = await imp("lib/live/converse.js"), { default: bs } = await imp("api/buySearch.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const post = async body => { let out = null; const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(o) { out = o; return this; }, end() { return this; } }; await bs({ method: "POST", headers: { cookie: "", host: "x", "x-forwarded-for": "203.0.113." + Math.floor(Math.random() * 200) }, query: {}, body, url: "/api/buySearch" }, res); return out || {}; };
const wire = state => converse(env, state);   // the conversation function itself (the nightly crossProductCheck reads it); its page endpoint is retired (lane-b-find-retire)
const cardsOf = w => (w.matches || []).length + [...(w.groups || []), ...(w.maybeGroups || [])].reduce((n, g) => n + (g.items || []).length, 0);
// (1) the report: a bare make-model search with live matches always draws cars
{ const r = await converse(env, { messages: ["Porsche 911"], answered: [], asked: 0 });
  ok("(1) converse: Porsche 911 with 48 live matches is results with the cars, never a question alone", r.type === "results" && (r.matches || []).length > 0, [r.type, (r.matches || []).length]);
  ok("(1) the generation question rides with them as the offer", r.offer && r.offer.key === "generation" && /^Which generation\?/.test(r.offer.prompt) && r.offer.options.length >= 2, r.offer && r.offer.prompt);
  const w = await wire({ id: "c1", messages: ["Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false });
  ok("(1) the wire answer (what the page reads): results, cards drawn, the offer present", w.type === "results" && cardsOf(w) > 0 && w.offer && w.offer.key === "generation", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (2) every narrowing question the conversation can ask, driven through its own answers: the cars every time, the question as the offer
{ const seen = []; let st = { messages: ["Porsche 911"], answered: [], asked: 0, filters: null };
  for (let step = 0; step < 6; step++) {
    const w = await wire({ id: "c2", zip: null, place: null, showNow: false, ...st });
    ok(`(2) step ${step + 1}: ${w.type}, never a question alone`, w.type !== "question" && (w.type === "results" || w.type === "groups") && cardsOf(w) > 0, [w.type, cardsOf(w)]);
    if (!w.offer) break;
    seen.push(w.offer.key);
    st = { messages: st.messages, answered: [...st.answered, w.offer.key], asked: st.asked + 1, filters: w.offer.filters || w.filters || st.filters };
  }
  ok("(2) the conversation offers at least generation, mileage and budget in turn, each beside the cars", ["generation", "mileage", "budget"].every(k => seen.includes(k)), seen); }
// (3) a year typed leaves the body question: still the cars
{ const w = await wire({ id: "c3", messages: ["2016 Porsche 911"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false });
  ok("(3) 2016 Porsche 911: the cars, and any narrowing question is the offer", w.type !== "question" && cardsOf(w) > 0, [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (4) a broad search (no model): the groups, the kind question as the offer
{ const w = await wire({ id: "c4", messages: ["manual cars"], filters: null, answered: [], asked: 0, zip: null, place: null, showNow: false });
  ok("(4) a broad search with no model draws the groups, never a question alone, and the kind question is the offer", w.type === "groups" && cardsOf(w) > 0 && w.offer && w.offer.key === "kind", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (5) near me with no zip: the cars (unsorted) and the question, not the question alone
{ const w = await wire({ id: "c5", messages: ["Porsche 911 near me"], filters: null, answered: ["generation"], asked: 1, zip: null, place: null, showNow: false });
  ok("(5) near me with no zip: the cars are drawn and where-are-you is the offer", w.type !== "question" && cardsOf(w) > 0 && w.offer && w.offer.key === "location", [w.type, cardsOf(w), w.offer && w.offer.key]); }
// (7) the timing budget of the retired page endpoint is gone with it (lane-b-find-retire); the written answer and action rerun are timed by findSpeed checks.
// (8) A PLAIN SEARCH CALLS NO MODEL (Nov 11 2026). A plain car search ran one model round that only routed it (the model's whole job was to call search_live with the make and model the code had already resolved; the reply was the fixed line): 1.5 s on every search and one of the device's 20 model
// turns a day. PLAIN = the typed words are the car and nothing else: a make and a model with any of a trim, a generation code, a year, a colour, a body, a gearbox and the filler words of asking. Not plain, so the model reads it: no model (a make alone), a budget, miles, a place, an ending time, a soft
// word, a question, a word the code cannot account for as the car, and every follow-up turn. The code runs the same search_live the model would have called; usage.calls stays 0, so the turn is not counted on the ceiling (afterTurn counts only turns that called the model).
{ const { runTurn } = await imp("lib/live/samChat.js");
  const turn = async (q, state = {}) => { MODEL.calls = 0; let out = null, err = null; try { out = await runTurn({ env, apiKey: "k", model: "m", messages: [{ role: "user", content: q }], state, deadlineMs: 8000 }); } catch (e) { err = String(e && e.message || e).slice(0, 80); } return { q, calls: MODEL.calls, usage: out && out.usage && out.usage.calls, cards: out && (out.cards || []).length, direct: !!(out && out.direct), rounds: out && out.times && out.times.rounds && out.times.rounds.length, err }; };
  const PLAIN = ["Porsche 911", "2016 Porsche 911", "red Porsche 911", "red 2016 Porsche 911", "Porsche 911 manual", "Porsche 911 coupe", "a Porsche 911 for sale", "Porsche 911 Carrera", "991 Porsche 911"];
  for (const q of PLAIN) { const r = await turn(q); ok(`(8) plain "${q}": no model call, no model turn counted, the cars answered by the code`, r.calls === 0 && r.usage === 0 && r.direct && !r.err && r.rounds === 0, r); }
  const t0 = Date.now(); const fastT = await turn("Porsche 911"); ok("(8) a plain search has no model round (rounds 0) and its cards are the search_live result (24 live)", fastT.cards === 24 && fastT.rounds === 0, fastT);
  const NEEDS = ["Porsche 911?", "cheap Porsche 911", "Porsche 911 under 60k", "Porsche 911 near me", "what is the best Porsche 911?", "Porsche", "Porsche 911 ending today", "Porsche 911 with low miles", "Porsche 911 vs Cayman", "Porsche 911 in Texas", "Porsche 911 with a sunroof"];
  for (const q of NEEDS) { const r = await turn(q); ok(`(8) not plain "${q}": the model is called`, r.calls >= 1 && !r.direct, r); }
  const f = await turn("Porsche 911 manual", { filters: { make: "Porsche", model: "911" } });
  ok("(8) a follow-up turn (a search already on screen) calls the model", f.calls >= 1 && !f.direct, f); }
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
    ["api/buy.js", "if (d.offer) offerAsk(d.offer);", "", "(6) the Find client parses"],
    ["lib/live/samChat.js", "directTool: async (lastUser, ctx) => {", "directTool: async (lastUser, ctx) => { return null;", "(8) plain \"Porsche 911\": no model call"],
    ["lib/live/chatCore.js", "if (surface.directTool && surface.endAfterTools && mustTool) {", "if (false) {", "(8) plain \"2016 Porsche 911\": no model call"],
    ["lib/live/samChat.js", ["if (Object.keys(p).some(k => !PLAIN_KEYS.has(k) && p[k] != null && p[k] !== \"\")) return null;", "    return null;   // a word the code cannot account for as the car: the model reads it"], ["", "    continue;"], "(8) not plain \"Porsche 911 under 60k\""],
    ["lib/live/samChat.js", "    return null;   // a word the code cannot account for as the car: the model reads it", "    continue;", "(8) not plain \"Porsche 911 with a sunroof\""],
    ["lib/live/samChat.js", "|| /[?]/.test(t) ||", "|| false ||", "(8) not plain \"Porsche 911?\""],
    ["lib/live/samChat.js", ["if (!ctx.speculative || (ctx.prevFilters && Object.keys(ctx.prevFilters).length)) return null;", "speculative: !Object.keys(prevFilters).length && lastUser ? speculativeSearch(env, lastUser, resolved) : null"], ["if (!ctx.speculative) return null;", "speculative: lastUser ? speculativeSearch(env, lastUser, resolved) : null"], "(8) a follow-up turn"],
    ["lib/live/converse.js", "matches.length > 5 && !offer) {", "matches.length > 5) {", "(5) near me with no zip"],
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
    const FR = [].concat(from), TO = [].concat(to);
    if (!FR.every(x => src.includes(x))) { console.log("MUTANT BROKEN (text not found): " + name + " :: " + FR.map(x => x.slice(0, 50)).join(" | ")); bad++; continue; }
    let mut = src; FR.forEach((x, i) => { mut = mut.replace(x, TO[i]); }); fs.writeFileSync(fp, mut);
    const r = spawnSync("node", [path.join(tmp, "scripts/findAlwaysCardsCheck.mjs"), tmp], { encoding: "utf8", timeout: 180000 }), out = (r.stdout || "") + (r.stderr || "");
    const named = out.split("\n").some(l => l.startsWith("FAIL") && l.includes(name));
    if (!(r.status !== 0 && named)) { console.log(`MUTANT SURVIVED: ${name}`); out.split("\n").filter(l => l.startsWith("FAIL")).slice(0, 3).forEach(l => console.log("   " + l.slice(0, 160))); bad++; }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`findAlwaysCardsCheck mutants: ${M.length - bad} of ${M.length} killed${bad ? `, ${bad} SURVIVED` : ""}`);
  return bad ? 1 : 0;
}
