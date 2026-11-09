// THE ENGINE CARD SHAPES (Lane B, Nov 8 2026, Lane E's refine8 SHAPES B; crew only, not live): findExamplesField, tasksDemoField and watchingDemoField hand the page the engine's own objects: Find's card (api/buySearch.js enrichFast: bid badge with its time, platform and
// time tag, chips, the SAM block's lines) and the Task and watching rows (summary, live count, criteria, detail, ends_at). The page draws them and computes nothing. This check runs the REAL enrichFast (no network: every database read answers empty) over the real fields.
//   (1) FIND: three live cars are [ { card } ]; fewer are { cars, fallback } with completed sales to make up to three; a sale is the same card ended, no bid, card.sold = { price: "$98,500", when: "October 12, 2026" } from the archive's own price and date
//   (2) TASKS: { task, card } live (the Task row: id, kind hunt, state running, summary "Sam is looking for ...", overview with the live count, criteria); { fallback: { label, task, card } } ended (research, done, "This auction has ended.", card.sold from that car's own sale, else the newest Porsche 911 sale)
//   (3) WATCHING: { row, card } live (lookingRows: ref, kind, what, detail, ends_at); { fallback: { label, row, card } } ended (detail "This auction has ended.", no ends_at, card.sold)
//   (4) EVERY CARD carries everything Find's card prints: the bid badge (current_bid_usd, bid_at, end_time), the platform tag (source), the pills (chips), the SAM block (sam_lines), photo, link, title; no card is live and sold at once; no valuation word; crew gate and kill switches
//   node scripts/engineCardShapeCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js", TD = "lib/live/tasksDemo.js", WD = "lib/live/watchingDemo.js", BS = "api/buySearch.js", RW = "lib/reasonWords.js";
  const muts = [
    [BS, "bid_at: r.bid_at || null, end_time: r.end_time,", "end_time: r.end_time,", "(4) the card has no bid time (the bid badge)"],
    [BS, "chips: specChips(r, facts) };", "chips: [] };", "(4) the card has no pills"],
    [BS, "source: houseName(r.source), sourceSlug: r.source,", "sourceSlug: r.source,", "(4) the card has no platform tag"],
    [BS, "return withSlots({ ...c, sam_lines: samLines(c) });\n}\n// A SHOW MORE BATCH", "return withSlots({ ...c });\n}\n// A SHOW MORE BATCH", "(4) the card has no SAM block lines"],
    [FE, "const c = await withClock(enrich(env, { r: row, facts, distance: null, gen: null, unknown: [] }), CARD_WAIT_MS);\n    return c && typeof c === \"object\" ? c : null;", "const c = await withClock(enrich(env, { r: row, facts, distance: null, gen: null, unknown: [] }), CARD_WAIT_MS);\n    return c && typeof c === \"object\" ? { ...c, photo_url: null } : null;", "(4) the card has no photo"],
    [FE, "const market = await withClock(Promise.resolve(readMarket(env, row, facts)), CARD_WAIT_MS);", "const market = { kind: \"none\" };", "(1) a sold card is read with no market (No sales yet, no range, no SAM lines)"],
    [FE, "if (!market || [\"pending\", \"none\", \"not_tracked\", \"unmatched\"].includes(market.kind)) return null;", "if (!market) return null;", "(1) a sold card with no read of its spec is drawn bare"],
    [FE, "unknown: [], market }), CARD_WAIT_MS);", "unknown: [], market: { kind: \"none\" } }), CARD_WAIT_MS);", "(1) the market read is thrown away and the card says No sales yet"],
    [FE, "transmission: s.transmission || null, exterior_color: s.exterior_color || null, body: s.body_style || null });", "transmission: null, exterior_color: null, body: null });", "(1) a sold card with no pills (gearbox and colour dropped)"],
    [FE, "sold: { price: reasonLine(\"demo.sold_price\", { price: Number(sale.sale_price_usd) }), when } };", "};", "(1) a completed sale carries no sold line"],
    [FE, "price: reasonLine(\"demo.sold_price\", { price: Number(sale.sale_price_usd) })", "price: reasonLine(\"demo.sold_price\", { price: Number(sale.sale_price_usd) * 1.1 })", "(1) the sold price is not the archive's"],
    [FE, "end_time: new Date(Date.parse(String(s.sale_date).slice(0, 10) + \"T00:00:00Z\")).toISOString()", "end_time: new Date(Date.now() + 864e5).toISOString()", "(1) a sold car is given a future end"],
    [FE, "if (cars.length >= MAX_ITEMS) return cars.slice(0, MAX_ITEMS);", "if (cars.length >= MAX_ITEMS) return { cars, fallback: [] };", "(1) three live cars are not the plain list"],
    [FE, "const fallback = await saleCards(env, d, deps, MAX_ITEMS - cars.length);", "const fallback = await saleCards(env, d, deps, MAX_ITEMS);", "(1) the sales are not just enough to make three"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const now = d.now(), rows = await liveExampleRows", "if (process.env.FIND_EXAMPLES === \"0\") return null;\n  const now = d.now(), rows = await liveExampleRows", "(4) no cookie: the Find field"],
    [TD, "summary: ended ? \"Sam looked for \" + phrase + \".\" : \"Sam is looking for \" + phrase + \".\"", "summary: \"Sam is looking for \" + phrase + \".\"", "(2) an ended Task still says it is looking"],
    [TD, "{ live: \"This auction has ended.\", liveCount: 0,", "{ live: \"1 live car\", liveCount: 1,", "(2) an ended Task counts a live car"],
    [TD, "kind: ended ? \"research\" : \"hunt\", state: ended ? \"done\" : state,", "kind: \"hunt\", state: \"running\",", "(2) an ended Task is running"],
    [TD, "criteria: Array.isArray(field && field.criteria) ? field.criteria.slice() : [],", "criteria: [],", "(2) the Task row has no criteria pills"],
    [TD, "words: field && field.request || null };", "words: null };", "(2) the Task row has no request words"],
    [TD, "if (card && task) return { task, card }; }\n  }\n  const fb", "if (card && task) return { task: { ...task, summary: \"\" }, card }; }\n  }\n  const fb", "(2) the Task row has no read back sentence"],
    [TD, "const sale = await endedSaleOf(env, d, last.vin, last.field.car.endsAt), card = sale ? await fe.soldCardOf(env, sale, d, deps) : null,", "const sale = null, card = null,", "(2) an ended car's own sale is never looked for"],
    [TD, "if (card && task) return { fallback: { label: fb.label, task, card } };", "if (card && task) return { fallback: { task, card } };", "(2) the ended example has no label"],
    [TD, "label: reasonLine(\"demo.recent_example\"), task, card: first.card } } : null;", "task, card: first.card } } : null;", "(2) the stand-in sale has no label"],
    [TD, "const [first] = await fe.saleCards(env, d, deps, 1);\n  if (!first) return null;", "const first = { card: { id: 1, title: \"2000 Porsche 911\", sold: { price: \"$1\", when: \"x\" } } };", "(2) a sale is invented when the archive has none"],
    [WD, "return ended ? { ...r, detail: L.LOOKING_WORDS.ended, ends_at: null } : r;", "return r;", "(3) an ended watch still says it is watching and has an end"],
    [WD, "identity: row.title }], [],", "identity: \"\" }], [],", "(3) the watching row names no car"],
    [WD, "{ [String(row.vin || id).toUpperCase()]: endsAt })[0];", "{})[0];", "(3) a live watch has no end time"],
    [WD, "return { fallback: { label: reasonLine(\"demo.recent_example\"), row: await watchRowOf({ vin: last.vin, title: last.car.title }, { ended: true, id: last.listingId }), card } };", "return { fallback: { row: await watchRowOf({ vin: last.vin, title: last.car.title }, { ended: true, id: last.listingId }), card } };", "(3) the ended watch has no label"],
    [WD, "const sales = await fe.saleCards(env, d, deps, 2), pick = sales[1] || sales[0];", "const sales = await fe.saleCards(env, d, deps, 2), pick = sales[0];", "(3) the watching stand-in repeats the Tasks example's sale"],
    [RW, "text: p => money(p.price) },", "text: p => \"Worth \" + money(p.price) },", "(4) a valuation word on the sold line"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ecs-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]); fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/engineCardShapeCheck.mjs"), dir], { encoding: "utf8" });
    const sec = (/^\((\d)\)/.exec(want) || [])[1], out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && (out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")")) || /Error/.test(out));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 2).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "ecs-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let metered = 0; globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) metered++; return new Response("[]", { status: 200 }); };
const origErr = console.error; console.error = () => {}; const origLog = console.log; const noisy = l => /^\{"tag":/.test(String(l));
console.log = (...a) => { if (!noisy(a[0])) origLog(...a); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), TD = await imp("lib/live/tasksDemo.js"), WD = await imp("lib/live/watchingDemo.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js"), G = await imp("lib/live/geo.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW = Math.floor(Date.now() / 3600e3) * 3600e3, IN = h => new Date(NOW + h * 3600e3).toISOString(), CREW = "gas_crew=" + C.mintCrewCookieValue();
const VALUATION = /\b(worth|values?|valued|valuations?|estimates?|estimated|appraisals?|appraised|deal|bargain|undervalued|overvalued|steal|good buy)\b/i;
const car = (o = {}) => ({ id: 1, source: "bringatrailer", url: "https://example.test/lot/" + (o.id || 1), listing_title: "2007 Ferrari F430 6-Speed", year: 2007, make: "Ferrari", model: "F430", vin_norm: "ZFFEW59A670150000", mileage: 18500, mileage_unit: "miles", current_bid: 90000, current_bid_usd: 90000, currency: "USD", bid_at: IN(-0.5), location: "Williamsburg, VA", country: "US", transmission: "Manual", exterior_color: "Red", photo_url: "https://img.example.test/f430.jpg", end_time: IN(30), status: "live", ...o });
const facts = r => S.listingFacts(r);
const honest = (f, r) => { const fx = facts(r); return String(r.make).toLowerCase() === f.make.toLowerCase() && String(r.model).toLowerCase() === f.model.toLowerCase() && (!f.gearbox || fx.gearbox === f.gearbox) && (!f.colour || fx.colour === f.colour) && fx.miles <= f.miles_max && Number(r.current_bid_usd) <= f.budget_max && r.status === "live"; };
let sid = 0;
const sale = (o = {}) => ({ id: 7000 + sid, source_slug: ["bringatrailer", "carsandbids", "pcarmarket"][sid % 3], mileage: 40000 + sid, vin_norm: "WP0SALE" + String(sid).padStart(10, "0"), sale_date: "2026-10-" + String(28 - (sid % 20)).padStart(2, "0"), transmission: "Manual", exterior_color: "Red", body_style: "Coupe", platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][sid % 3], listing_title: `${1990 + sid} Porsche 911 Carrera`, year: 1990 + sid, make: "Porsche", model: "911", sale_price_usd: 100000 + 1000 * (sid++), img: "https://img.test/p" + sid + ".jpg", url: "https://auction.test/s" + sid, ...o });
function world(rows, sales = []) {
  const w = { store: new Map(), rows, sales, clock: NOW, ownSale: null };
  w.d = { now: () => w.clock, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }),  market: async () => w.market === undefined ? { kind: "range", low: 55000, high: 78000, count: 24, query: "2003 Porsche 911", basisLine: "Based on 24 sales, the latest in October 2026.", soldLine: "Cars like this sold for $55,000 to $78,000." } : w.market,
    select: async (e, q) => { let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
      if (/^sales_archive\?vin_norm=eq\./.test(q)) return w.ownSale ? [w.ownSale] : [];
      if (/^sales_archive/.test(q)) return w.sales;
      return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key || TD.STORE_KEY); },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: [] }), urlStatus: async () => 200, facts,
    geo: async () => ({ listingCoord: G.listingCoord, placeCoord: G.placeCoord, milesBetween: G.milesBetween }),
    read: async (e, text) => TD.readRequest(e, text), match: async (e, f) => w.rows.filter(r => honest(f, r)).map(r => ({ r })),
    reasons: async f => (await imp("lib/tasks/tasks.js")).matchReasonList(f) };
  return w;
}
const bidBadge = c => c && Number(c.current_bid_usd) > 0 && "bid_at" in c && Number.isFinite(Date.parse(c.end_time));
const printsAll = c => c && c.id != null && typeof c.title === "string" && /\S/.test(c.title) && typeof c.source === "string" && /\S/.test(c.source) && /^https:/.test(c.url) && /^https:/.test(c.photo_url) && Array.isArray(c.chips) && c.chips.length > 0 && Array.isArray(c.sam_lines) && "bid_at" in c && "current_bid_usd" in c && "end_time" in c;
const rowOk = r => r && /^[\w:-]+$/.test(r.ref) && ["car_watch", "spec_watch", "alert"].includes(r.kind) && /\S/.test(r.what) && /\S/.test(r.detail) && "ends_at" in r;
const SOLD = /^\$[\d,]+$/, WHEN = /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/;
const live3 = () => [car({ id: 1, make: "Ferrari", model: "F430", listing_title: "2007 Ferrari F430" }), car({ id: 2, make: "Porsche", model: "911", year: 1995, listing_title: "1995 Porsche 911 Carrera", vin_norm: "WP0AB2966SS320002", exterior_color: "Black" }), car({ id: 3, make: "BMW", model: "M3", year: 2006, listing_title: "2006 BMW M3", vin_norm: "WBSBL93496PN00003", exterior_color: "Blue" })];
// (1) FIND
{
  const W = world(live3(), [sale(), sale(), sale(), sale()]); await FE.refreshFindExamples(env, W.d);
  const three = await FE.findExamplesField(env, CREW, W.d);
  ok("(1) three live cars: the plain list of { card }", Array.isArray(three) && three.length === 3 && three.every(i => Object.keys(i).join() === "card"), JSON.stringify(three && three.map(i => i.card && i.card.title)));
  ok("(4) each live card carries the bid badge, the platform tag, the pills and the SAM block lines, a photo and a link", three.every(i => printsAll(i.card) && bidBadge(i.card)), JSON.stringify(three.map(i => [!!printsAll(i.card), !!bidBadge(i.card)])));
  ok("(1) a live card has no sold line and an end in the future", three.every(i => !i.card.sold && Date.parse(i.card.end_time) > NOW));
  W.rows = W.rows.slice(0, 1); const mix = await FE.findExamplesField(env, CREW, W.d);
  ok("(1) one live car: { cars: [1], fallback: [2] } so the row is three", mix && !Array.isArray(mix) && mix.cars.length === 1 && mix.fallback.length === 2, JSON.stringify(mix && [mix.cars.length, mix.fallback.length]));
  ok("(1) a completed sale is the same card ended: end in the past, no bid, card.sold = { price, when } in the engine's words", mix.fallback.every(i => Date.parse(i.card.end_time) < NOW && Number(i.card.current_bid_usd) === 0 && i.card.bid_at === null && SOLD.test(i.card.sold.price) && WHEN.test(i.card.sold.when)), JSON.stringify(mix.fallback.map(i => i.card.sold)));
  const row0 = W.sales[0];
  ok("(1) the sold price and date are the archive's own", mix.fallback.every(i => { const s = W.sales.find(x => x.url === i.card.url); return s && i.card.sold.price === "$" + s.sale_price_usd.toLocaleString("en-US") && i.card.sold.when.endsWith(s.sale_date.slice(0, 4)); }));
  ok("(4) a sale card carries the platform tag, a photo, a link and the title; its source is the sale's house", mix.fallback.every(i => /\S/.test(i.card.source) && /^https:/.test(i.card.photo_url) && /^https:/.test(i.card.url) && /911/.test(i.card.title)), JSON.stringify(mix.fallback.map(i => i.card.source)));
  ok("(1) a sold card carries the SAME market block, chips and SAM lines a live card does: a ranged market, not No sales yet; only the bid badge differs", mix.fallback.every(i => i.card.market && i.card.market.kind === "range" && i.card.market.low > 0 && i.card.market.high > i.card.market.low && Array.isArray(i.card.chips) && i.card.chips.length > 0 && Array.isArray(i.card.sam_lines) && i.card.sam_lines.length > 0 && !/No sales yet/i.test(JSON.stringify(i.card))), JSON.stringify(mix.fallback.map(i => [i.card.market && i.card.market.kind, i.card.chips, (i.card.sam_lines || []).length])));
  ok("(1) a sold card has every key a live card has (the card draws the same blocks), plus sold", Object.keys(three[0].card).every(k => k in mix.fallback[0].card) && "sold" in mix.fallback[0].card, JSON.stringify(Object.keys(three[0].card).filter(k => !(k in mix.fallback[0].card))));
  const Wn = world([], [sale(), sale()]); Wn.market = { kind: "none" }; const noMk = await FE.findExamplesField(env, CREW, Wn.d);
  ok("(1) the engine has no read for a sold car's spec: the card is dropped, never drawn with No sales yet", noMk === null || (noMk.fallback || []).length === 0, JSON.stringify(noMk && noMk.fallback && noMk.fallback.length));
  const W0 = world([], []); ok("(1) no live car and no sale: null", (await FE.findExamplesField(env, CREW, W0.d)) === null);
  const W1 = world([], [sale(), sale()]); const only = await FE.findExamplesField(env, CREW, W1.d); ok("(1) no live car: { cars: [], fallback } up to the sales there are", only && only.cars.length === 0 && only.fallback.length === 2);
  ok("(4) crew gate and kill switch: the Find field", (await FE.findExamplesField(env, "", W.d)) === null && (await FE.findExamplesField(env, "gas_crew=ok", W.d)) === null && await (async () => { process.env.FIND_EXAMPLES = "0"; const r = await FE.findExamplesField(env, CREW, W.d); delete process.env.FIND_EXAMPLES; return r === null; })());
  ok("(4) no valuation word on any Find card line", !VALUATION.test(JSON.stringify([...three.map(i => [i.card.sam_lines, i.card.chips]), mix.fallback.map(i => i.card.sold)])));
}
// (2) TASKS
{
  const W = world([car()], [sale(), sale(), sale()]); await TD.refreshTasksDemo(env, W.d);
  const f = await TD.tasksDemoField(env, CREW, W.d);
  ok("(2) a live example is { task, card }", f && Object.keys(f).sort().join() === "card,task", f && Object.keys(f).join());
  ok("(2) the Task row: id, kind hunt, state running, Sam's read back sentence", f.task.id.length === 36 && f.task.kind === "hunt" && f.task.state === "running" && /^Sam is looking for .*Ferrari F430/.test(f.task.summary), f.task.summary);
  ok("(2) the live count in the engine's words: One live car matches, liveCount 1, cars", f.task.overview.live === "One live car matches" && f.task.overview.liveCount === 1 && /car/.test(f.task.overview.cars), JSON.stringify(f.task.overview));
  ok("(2) the criteria pills and the request's words ride on the row", Array.isArray(f.task.criteria) && f.task.criteria.length >= 3 && /Ferrari F430/.test(f.task.words), JSON.stringify(f.task.criteria));
  ok("(4) the card is the matched car's whole card", printsAll(f.card) && bidBadge(f.card) && f.card.id === 1, "id " + f.card.id);
  // the car ends: its own sale is in the archive
  W.clock = NOW + 31 * 3600e3; W.ownSale = sale({ vin_norm: "ZFFEW59A670150000", listing_title: "2007 Ferrari F430", year: 2007, make: "Ferrari", model: "F430", sale_price_usd: 118000, sale_date: new Date(NOW + 30 * 3600e3).toISOString().slice(0, 10) });
  const ended = await TD.tasksDemoField(env, CREW, W.d);
  ok("(2) an ended example is { fallback: { label, task, card } }", ended && Object.keys(ended).join() === "fallback" && Object.keys(ended.fallback).sort().join() === "card,label,task", JSON.stringify(ended && Object.keys(ended.fallback)));
  ok("(2) label \"Recent example\"; the Task done, kind research, \"Sam looked for\", \"This auction has ended.\", no live count", ended.fallback.label === "Recent example" && ended.fallback.task.state === "done" && ended.fallback.task.kind === "research" && /^Sam looked for .*Ferrari F430/.test(ended.fallback.task.summary) && ended.fallback.task.overview.live === "This auction has ended." && ended.fallback.task.overview.liveCount === 0, JSON.stringify(ended.fallback.task));
  ok("(2) the card is that car's own sale: card.sold from the archive, $118,000", ended.fallback.card.sold && ended.fallback.card.sold.price === "$118,000" && WHEN.test(ended.fallback.card.sold.when) && ended.fallback.card.id === ended.fallback.card.id && Number(ended.fallback.card.current_bid_usd) === 0, JSON.stringify(ended.fallback.card.sold));
  W.ownSale = null; const stand = await TD.tasksDemoField(env, CREW, W.d);
  ok("(2) the archive does not hold that car's sale yet: the newest completed Porsche 911 sale, as a research Task", stand && stand.fallback && stand.fallback.label === "Recent example" && stand.fallback.card.sold && /911/.test(stand.fallback.card.title) && /^Sam looked for Porsche 911s/.test(stand.fallback.task.summary) && stand.fallback.task.overview.live === "This auction has ended.", JSON.stringify(stand && stand.fallback && stand.fallback.task.summary));
  W.sales = []; W.store.delete(FE.FALLBACK_KEY); ok("(2) neither: null, nothing invented", (await TD.tasksDemoField(env, CREW, W.d)) === null);
  ok("(4) crew gate and kill switch: the Tasks field", (await TD.tasksDemoField(env, "", W.d)) === null && (await TD.tasksDemoField(env, "gas_crew=ok", W.d)) === null && await (async () => { process.env.TASKS_DEMO = "0"; const r = await TD.tasksDemoField(env, CREW, W.d); delete process.env.TASKS_DEMO; return r === null; })());
  ok("(4) no valuation word on the Task row", !VALUATION.test(JSON.stringify([f.task, ended.fallback.task])));
}
// (3) WATCHING
{
  const W = world([car({ id: 7, make: "BMW", model: "M3", year: 2006, listing_title: "2006 BMW M3", vin_norm: "WBSBL93496PN00007", end_time: IN(20), current_bid: 40000, current_bid_usd: 40000 })], [sale(), sale(), sale()]); await WD.refreshWatchingDemo(env, W.d);
  const f = await WD.watchingDemoField(env, CREW, W.d);
  ok("(3) a live watch is { row, card }", f && Object.keys(f).sort().join() === "card,row", f && Object.keys(f).join());
  ok("(3) the watching row as the looking list returns it: ref, kind car_watch, the car, \"This exact car.\", when bidding ends", rowOk(f.row) && f.row.kind === "car_watch" && /BMW M3/.test(f.row.what) && f.row.detail === "This exact car." && f.row.ends_at === IN(20), JSON.stringify(f.row));
  ok("(4) the card is the watched car's whole card", printsAll(f.card) && bidBadge(f.card) && f.card.id === 7);
  W.clock = NOW + 21 * 3600e3; W.ownSale = sale({ vin_norm: "WBSBL93496PN00007", listing_title: "2006 BMW M3", year: 2006, make: "BMW", model: "M3", sale_price_usd: 41500, sale_date: new Date(NOW + 20 * 3600e3).toISOString().slice(0, 10) });
  const ended = await WD.watchingDemoField(env, CREW, W.d);
  ok("(3) an ended watch is { fallback: { label, row, card } }, row detail \"This auction has ended.\", no ends_at, card.sold $41,500", ended && ended.fallback && ended.fallback.label === "Recent example" && rowOk(ended.fallback.row) && ended.fallback.row.detail === "This auction has ended." && ended.fallback.row.ends_at === null && ended.fallback.card.sold && ended.fallback.card.sold.price === "$41,500", JSON.stringify(ended && ended.fallback && ended.fallback.row));
  W.ownSale = null; const stand = await WD.watchingDemoField(env, CREW, W.d);
  ok("(3) the archive does not hold the car's sale yet: a completed Porsche 911 sale, not the one the Tasks example stands in with", stand && stand.fallback && stand.fallback.card.sold && stand.fallback.row.detail === "This auction has ended." && stand.fallback.card.url !== (await FE.saleCards(env, W.d, W.d, 1))[0].card.url, JSON.stringify(stand && stand.fallback && stand.fallback.card.title));
  W.sales = []; W.store.delete(FE.FALLBACK_KEY); ok("(3) neither: null", (await WD.watchingDemoField(env, CREW, W.d)) === null);
  ok("(4) crew gate and kill switch: the watching field", (await WD.watchingDemoField(env, "", W.d)) === null && (await WD.watchingDemoField(env, "gas_crew=ok", W.d)) === null && await (async () => { process.env.WATCHING_DEMO = "0"; const r = await WD.watchingDemoField(env, CREW, W.d); delete process.env.WATCHING_DEMO; return r === null; })());
}
ok("(4) zero metered OldCarsData", metered === 0, "calls " + metered);
console.log = origLog; console.error = origErr;
console.log(`\nengineCardShapeCheck: ${n - failed} pass, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
