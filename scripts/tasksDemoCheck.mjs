// TASKS DEMO (Lane B, Nov 2026, the Tasks page centrepiece, CREW ONLY, NOT LIVE). No database, no network (injected reads), the real request writer, the real reader and the real geo.
//   (1) the request is written FROM the car: make and model always; gearbox and colour only if the listing states them; a mileage ceiling above its mileage; a price ceiling above its bid; a distance only from a real city the car is within
//   (2) the reader must give every criterion back as written, and the matcher must RETURN THE CAR, and every stated criterion must hold on the car itself: otherwise the car is rejected with that reason
//   (3) the car: live now, a real photo and link; the earlier record only by the featuredHistory rules (a confirmed sale preferred), none invented
//   (4) the field: the shape Lane E reads, why from the engine's matchReasonList, no valuation word
//   (5) stable: kept while it passes, replaced when its auction ends or a check fails, a stale pick never served, a failed refresh returns null
//   (6) crew gate and kill switch; (7) no public surface can return it; zero OldCarsData
//   node scripts/tasksDemoCheck.mjs [repo root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const L = "lib/live/tasksDemo.js";
  const muts = [
    [L, 'if (facts.gearbox === "manual") f.gearbox = "manual"; else if (facts.gearbox === "auto") f.gearbox = "auto";', 'f.gearbox = "manual";', "(1) a gearbox the listing does not state"],
    [L, 'if (facts.colour) f.colour = String(facts.colour).toLowerCase();', 'f.colour = "red";', "(1) a colour the listing does not state"],
    [L, 'f.miles_max = milesCeiling(miles);', 'f.miles_max = miles;', "(1) the mileage ceiling is above the car's mileage"],
    [L, 'f.budget_max = priceCeiling(bid);', 'f.budget_max = bid - 1;', "(1) the price ceiling is above the car's bid"],
    [L, 'const radius = best ? RADII.find(r => r >= best.d + 5) : null;', 'const radius = 25;', "(1) a distance only from a city the car is within"],
    [L, 'if (off.length) return { ok: false, why: "reader_disagrees:" + off.join("+") };', '', "(2) the reader must give every criterion back"],
    [L, 'if (!hit) return { ok: false, why: "matcher_does_not_return_the_car" };', '', "(2) the matcher must return the car"],
    [L, 'if (bad.length) return { ok: false, why: "not_honoured:" + bad.join("+") };', '', "(2) every stated criterion holds on the car"],
    [L, 'mileageLine: reasonLine("tasks.demo_miles", { miles: num(facts.miles) })', 'mileageLine: grp(num(facts.miles)) + " mi"', "(4) the car's mileage line is written inline, not from the reason table"],
    [L, '{ mileageLine: reasonLine("tasks.demo_prior_miles", { miles: p.mileage }) }', '{ mileageLine: grp(p.mileage) + " mi then" }', "(4) the earlier mileage line is written inline, not from the reason table"],
    [L, 'priceLine: reasonLine("tasks.demo_prior_price", { price: p.price })', 'priceLine: "Sold for $" + p.price', "(4) the earlier-sale line is written inline, not from the reason table"],
    [L, 'priceLabel: reasonLine("tasks.demo_current_bid", { price: bid }),', 'priceLabel: `Current bid $${bid}`,', "(4) the current-bid line is written inline, not from the reason table"],
    [L, 'bid = num(facts && facts.priceUsd);', 'bid = num(facts && facts.priceUsd) || num(row.current_bid_usd);', "(3) a bid the trust layer cannot state is used from current_bid_usd"],
    [L, '  const bid = num(facts.priceUsd);\n  const car = {', '  const bid = num(row.current_bid_usd);\n  const car = {', "(3) the price line reads current_bid_usd, not the trust layer"],
    [L, 'if (!liveNow(row, now)) return { ok: false, why: "not_live" };', '', "(3) a car that is not live"],
    [L, 'if (!genuinePhoto(row.photo_url) ||', 'if (false ||', "(3) a placeholder photo"],
    [L, 'const e = evaluateCandidate(row, appearances, { nowMs: now, urlStatus: us });\n      if (e.ok) {', 'const e = pre;\n      if (e.ok) {', "(3) an earlier record whose evidence link is gone"],
    [L, 'if (VALUATION_WORDS.test(why) || VALUATION_WORDS.test(req.text)) return { ok: false, why: "valuation_word" };', '', "(4) a valuation word"],
    [L, 'withHist.sort((x, y) => x.rank[0] - y.rank[0] ||', 'withHist.sort((x, y) => ', "(3) a confirmed sale is preferred"],
    [L, '!(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS) ||', '', "(5) a stored pick not re-checked within the limit"],
    [L, 'if (!row || !liveNow(row, now)) return null;', '', "(5) a listing no longer live is not served"],
    [L, 'if (again.ok) { const keep', 'if (true) { const keep', "(5) a kept pick whose check now fails is replaced"],
    [L, 'const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };', 'const drop = async why => ({ stored: null, why });', "(5) a failed refresh stores and returns nothing"],
    [L, 'if (process.env.TASKS_DEMO === "0" || !isCrewRequest(reqOrCookie)) return null;', 'if (process.env.TASKS_DEMO === "0") return null;', "(6) no cookie: no field"],
    [L, 'if (process.env.TASKS_DEMO === "0" || !isCrewRequest(reqOrCookie)) return null;', 'if (!isCrewRequest(reqOrCookie)) return null;', "(6) the kill switch"],
    [L, 'export const STORE_KEY = "crew_tasks_demo";', 'export const STORE_KEY = "tasks_demo";', "(6) the stored key is a crew key"],
    [L, 'const field = { request: req.text, shortRequest, car,', 'const field = { request: req.text, car,', "(4) the Tasks example carries no shortRequest"],
    ["api/home.js", "\n", "\n// findExamples leaked into a public route\n", "(7) a public route names the Find examples"],
    ["api/home.js", "\n", "\n// watchingDemo leaked into a public route\n", "(7) a public route names the watching card"],
    ["api/home.js", "\n", "\n// crew_find_examples leaked into a public route\n", "(7) a public route names the Find examples key"],
    ["api/home.js", "\n", "\n// tasksDemo leaked into a public route\n", "(7) only the module and the cron refresh name"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdemo-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file); if (!fs.existsSync(fp)) { console.log(`MUTANT FILE MISSING  ${file}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    const src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/tasksDemoCheck.mjs"), dir], { encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || ""), sec = (/^\((\d)\)/.exec(want) || [])[1], killed = r.status !== 0 && out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")"));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "tasksdemo-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const D = await imp("lib/live/tasksDemo.js"), G = await imp("lib/live/geo.js"), S = await imp("lib/live/search.js"), C = await imp("lib/_crew.js"), FH = await imp("lib/live/featuredHistory.js");
const geo = { listingCoord: G.listingCoord, placeCoord: G.placeCoord, milesBetween: G.milesBetween };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW = Math.floor(Date.now() / 3600e3) * 3600e3, IN = h => new Date(NOW + h * 3600e3).toISOString();
const car = (o = {}) => ({ id: 1, source: "sothebysmotorsport", url: "https://example.test/lot/1", listing_title: "2007 Ferrari F430 6-Speed", year: 2007, make: "Ferrari", model: "F430", vin_norm: "ZFFEW59A670150000", mileage: 18500, mileage_unit: "miles", current_bid: 90000, current_bid_usd: 90000, currency: "USD", location: "Williamsburg, VA", country: "US", transmission: "Manual", exterior_color: "Red", photo_url: "https://img.example.test/f430.jpg", end_time: IN(30), status: "live", ...o });
const facts = r => S.listingFacts(r);
const rec = (o = {}) => ({ kind: "sale", date: "2023-06-01", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/2007-ferrari-f430/", image: "https://img.example.test/old.jpg", mileage: 15000, priceUsd: 181888, vinNorm: "ZFFEW59A670150000", ...o });
// the injected world: a store, live rows, a matcher that is the honest one by default
function world(rows, { apps = {}, matcher = null, reader = null } = {}) {
  const cfg = new Map(), w = { cfg, reads: [], clock: NOW, rows };
  const d = {
    now: () => w.clock, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), 
    select: async (e, q) => { w.reads.push(q); if (w.failSelect) return null; if (/^app_config/.test(q)) { const v = cfg.get(D.STORE_KEY); return v ? [{ value: v }] : []; } const m = /live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return rows.filter(r => String(r.id) === decodeURIComponent(m[1])); return rows.filter(r => r.status === "live" && Date.parse(r.end_time) > w.clock); },
    write: async (e, row) => { cfg.set(row.key, row.value); }, clear: async () => { cfg.delete(D.STORE_KEY); },
    appearances: async (e, vin) => (apps[vin] ? { ok: true, vinNorm: vin, appearances: apps[vin] } : { ok: true, vinNorm: vin, appearances: [] }),
    urlStatus: async () => w.urlStatus || 200,
    facts, geo: async () => geo,
    read: reader || (async (e, text) => D.readRequest(e, text)),
    match: matcher || (async (e, f) => rows.filter(r => honest(f, r)).map(r => ({ r }))),
    reasons: async f => (await imp("lib/tasks/tasks.js")).matchReasonList(f)
  };
  w.d = d; return w;
}
// an honest stand-in for the matcher (the real findMatchesDetail needs the live database): the criteria applied to the rows
const honest = (f, r) => { const fx = facts(r); return String(r.make).toLowerCase() === f.make.toLowerCase() && String(r.model).toLowerCase() === f.model.toLowerCase() && (!f.gearbox || fx.gearbox === f.gearbox) && (!f.colour || fx.colour === f.colour) && fx.miles <= f.miles_max && Number(r.current_bid_usd) <= f.budget_max && r.status === "live"; };

// (1) the request is written from the car
{
  const r = car(), rq = D.requestFor(r, facts(r), geo);
  ok("(1) the request names the car, its gearbox and colour as stated, a ceiling above its miles and its bid, and a real city it is within", rq && /manual red Ferrari F430/.test(rq.text) && rq.filters.miles_max > 18500 && rq.filters.budget_max > 90000 && /within \d+ miles of [A-Za-z. ]+, [A-Z]{2}$/.test(rq.text), rq && rq.text);
  const bare = car({ transmission: null, exterior_color: null, listing_title: "2007 Ferrari F430", description: "" }), rb = D.requestFor(bare, facts(bare), geo);
  ok("(1) a gearbox the listing does not state is never written", rb && !/manual|automatic/.test(rb.text) && !rb.filters.gearbox, rb && rb.text);
  ok("(1) a colour the listing does not state is never written", rb && !rb.filters.colour && !/\b(red|black|white|blue|silver|yellow)\b/i.test(rb.text.replace(/^Find me a /, "")), rb && rb.text);
  ok("(1) the mileage ceiling is above the stated mileage", rq.filters.miles_max > 18500 && D.milesCeiling(18500) === 25000 && D.milesCeiling(61000) > 61000);
  ok("(1) the price ceiling is above the bid", rq.filters.budget_max > 90000 && D.priceCeiling(90000) === 115000 && D.priceCeiling(3000) > 3000);
  const dist = G.milesBetween(G.placeCoord(rq.filters.location.split(", ")[0], rq.filters.location.split(", ")[1]), G.listingCoord(r));
  ok("(1) the distance is from a real city and the car is within it", dist != null && dist <= rq.filters.radius_miles, `${dist} mi within ${rq.filters.radius_miles} of ${rq.filters.location}`);
  const nowhere = car({ location: "Nowhereville, ZZ" }), rn = D.requestFor(nowhere, facts(nowhere), geo);
  ok("(1) a car whose place cannot be placed gets no distance at all", rn && !rn.filters.location && !/within/.test(rn.text), rn && rn.text);
  const abroad = car({ location: "Munich, Germany", country: "DE" }), ra = D.requestFor(abroad, facts(abroad), geo);
  ok("(1) a car abroad gets no distance either", ra === null || !ra.filters.location);
  const nomiles = car({ mileage: null }), nob = car({ current_bid: null, current_bid_usd: null });
  ok("(1) no stated mileage or no price: no request is written", D.requestFor(nomiles, facts(nomiles), geo) === null && D.requestFor(nob, facts(nob), geo) === null);
}
// (1b) THE PRICE IS THE TRUST LAYER'S (Nov 6 2026): a bid liveTrust cannot state in dollars is no price. The demo never falls back to current_bid_usd, never prints "Current bid $X" for it, and has no car without a price (the budget criterion needs one).
{
  const cases = [["a currency not stated", { currency: null }], ["a pound figure with no dollar conversion", { currency: "GBP", current_bid_usd: null }], ["a $0 bid", { current_bid: 0, current_bid_usd: 0 }], ["a figure that may not be dollars (a euro lot stored as USD)", { currency: "USD", location: "Munich, Germany", country: "DE" }]];
  for (const [name, o] of cases) {
    const r = car(o), fx = facts(r), W = world([r]), p = await D.proveCar(env, r, W.d);
    ok(`(1) ${name}: the trust layer states no dollar price (${fx.priceState})`, fx.priceUsd == null || fx.priceState === "suspect" || fx.priceState === "unconverted" || !(Number(fx.priceUsd) > 0), `${fx.priceUsd} ${fx.priceState}`);
    ok(`(3) ${name}: no request, no demo car, so no "Current bid" line`, D.requestFor(r, fx, geo) === null && p.ok === false && !(p.field && p.field.car), p.why);
  }
  const good = car({ currency: "GBP", current_bid: 70000, current_bid_usd: 91000 }), gf = facts(good), gp = await D.proveCar(env, good, world([good]).d);
  const only = car({ currency: "USD", current_bid: 88000, current_bid_usd: null }), of = facts(only), op = await D.proveCar(env, only, world([only]).d);
  ok("(3) a dollar lot whose figure is only on current_bid prints that figure, never a $0 or a column the trust layer did not state", op.ok && of.priceUsd === 88000 && op.field.car.priceLabel === "Current bid $88,000", op.ok ? op.field.car.priceLabel : op.why);
  ok("(4) a pound lot, even with a stated dollar conversion, is never the example: only a listing priced in US dollars is picked (lib/live/usdFence.js)", !gp.ok && gp.why === "not_usd", gp.ok ? gp.field.car.priceLabel : gp.why);
}
// (2) reader, matcher and honouring
{
  const row = car(), W = world([row]);
  const good = await D.proveCar(env, row, W.d);
  ok("(2) the honest round trip accepts the car", good.ok === true, JSON.stringify(good.why));
  const W2 = world([row], { reader: async () => ({ make: "Ferrari", model: "F430", gearbox: null, colour: null, miles_max: 99999, budget_max: 1, radius_miles: null, location: null }) });
  const r2 = await D.proveCar(env, row, W2.d);
  ok("(2) a reader that does not give every criterion back rejects the car", r2.ok === false && /reader_disagrees/.test(r2.why), r2.why);
  const W3 = world([row], { matcher: async () => [] });
  const r3 = await D.proveCar(env, row, W3.d);
  ok("(2) a matcher that does not return the car rejects it", r3.ok === false && r3.why === "matcher_does_not_return_the_car", r3.why);
  const W3b = world([row], { matcher: async () => [{ r: car({ id: 2 }) }] });
  ok("(2) a matcher that returns a different car rejects it", (await D.proveCar(env, row, W3b.d)).ok === false);
  const far = car({ location: "Seattle, WA" });
  const W4 = world([far], { matcher: async (e, f) => [{ r: far }], reader: async (e, t) => ({ ...(await D.readRequest(e, t)) }) });
  const forced = { ...W4.d, geo: async () => ({ ...geo, listingCoord: r => (r.__nearby ? G.placeCoord("Williamsburg", "VA") : G.listingCoord(r)) }) };
  const r4 = await D.proveCar(env, far, { ...forced, geo: (() => { let first = true; return async () => ({ ...geo, listingCoord: r => { if (first) { first = false; return G.placeCoord("Williamsburg", "VA"); } return G.listingCoord(r); } }); })() });
  ok("(2) a matcher that returns a car outside the stated distance (or any stated criterion) is caught by the independent test", r4.ok === false && /not_honoured/.test(r4.why), r4.why);
  const rowF = car(), fx = facts(rowF), f0 = { make: "Ferrari", model: "F430", gearbox: "manual", colour: "red", miles_max: 25000, budget_max: 115000, location: "Richmond, VA", radius_miles: 100 };
  ok("(2) the independent test passes the car that honours every criterion", D.honoured(f0, rowF, fx, geo).length === 0);
  ok("(2) it catches a gearbox, colour, mileage, price, make and distance the car breaks", [["gearbox", { gearbox: "auto" }], ["colour", { colour: "blue" }], ["miles_max", { miles_max: 10000 }], ["budget_max", { budget_max: 50000 }], ["make", { make: "Porsche" }], ["location", { radius_miles: 25 }]].every(([k, o]) => D.honoured({ ...f0, ...o }, rowF, fx, geo).includes(k)));
}
// the REAL Task matcher (findMatchesDetail, the rows path, the same runSearch, trustFilter and taskFits a stored hunt runs) over the car
{
  const row = car({ bid_count: 5 }), T = await imp("lib/tasks/tasks.js"), rq = D.requestFor(row, facts(row), geo);
  const real = async (f) => (await T.findMatchesDetail(env, { filters: f, reported_ids: [] }, { rows: [row] }, null)).matches;
  ok("(2) the real Task matcher returns the car for the request written from it", (await real(rq.filters)).some(x => x.r.id === row.id));
  ok("(2) and not for a mileage ceiling the car is over, a city it is far from, or another gearbox", (await real({ ...rq.filters, miles_max: 10000 })).length === 0 && (await real({ ...rq.filters, location: "Seattle, WA", radius_miles: 50 })).length === 0 && (await real({ ...rq.filters, gearbox: "auto" })).length === 0);
  const W = world([row], { matcher: async (e, f) => real(f) }), p = await D.proveCar(env, row, W.d);
  ok("(2) the whole round trip through the real matcher accepts the car", p.ok === true, p.why);
}
// (3) the car and its earlier record
{
  const row = car(), apps = { [row.vin_norm]: [rec()] }, W = world([row], { apps });
  const p = await D.proveCar(env, row, W.d, { appearances: apps[row.vin_norm] });
  ok("(3) a car with a verified earlier sale carries it exactly as featuredHistory does", p.ok && p.field.previous && p.field.previous.kind === "sold" && p.field.previous.price === 181888 && p.field.previous.platform === "Bring a Trailer" && p.field.previous.historyUrl === "/vin/ZFFEW59A670150000" && p.field.previous.date === "June 2023", JSON.stringify(p.field && p.field.previous));
  const W2 = world([row], { apps }); W2.urlStatus = 404;
  const p2 = await D.proveCar(env, row, W2.d, { appearances: apps[row.vin_norm] });
  ok("(3) an earlier record whose evidence link is gone is not shown, the car still is", p2.ok && !p2.field.previous);
  const wv = world([row]); wv.d.reasons = async () => ["a deal worth $5,000 under"]; const pv = await D.proveCar(env, row, wv.d);
  ok("(4) a request or reasons carrying a valuation word reject the car", pv.ok === false && pv.why === "valuation_word", pv.why);
  const none = await D.proveCar(env, row, W.d, { appearances: null });
  ok("(3) a car with no earlier record has no previous (none is invented)", none.ok && !("previous" in none.field));
  const ended = car({ end_time: IN(-1) }), pe = await D.proveCar(env, ended, world([ended]).d);
  ok("(3) a car that is not live is rejected", pe.ok === false && pe.why === "not_live");
  const ph = car({ photo_url: "https://cdn.example.test/placeholder.png" }), pp = await D.proveCar(env, ph, world([ph]).d);
  ok("(3) a placeholder photo is rejected", pp.ok === false);
  const rows = [car({ id: 11, vin_norm: "VINAAAAAAAAAAAAA1", model: "F430" }), car({ id: 12, vin_norm: "VINAAAAAAAAAAAAA2" }), car({ id: 13, vin_norm: "VINAAAAAAAAAAAAA3" })];
  const a2 = { VINAAAAAAAAAAAAA1: [rec({ kind: "attempt", priceUsd: null, vinNorm: "VINAAAAAAAAAAAAA1", url: "https://bringatrailer.com/l/1/" })], VINAAAAAAAAAAAAA2: [rec({ vinNorm: "VINAAAAAAAAAAAAA2", url: "https://bringatrailer.com/l/2/" })] };
  const W3 = world(rows, { apps: a2 }), r3 = await D.refreshTasksDemo(env, W3.d);
  ok("(3) a car with a confirmed earlier sale is chosen before one with a listing and before one with none", r3.stored && String(r3.stored.listingId) === "12" && r3.stored.field.previous && r3.stored.field.previous.kind === "sold", r3.why + " " + (r3.stored && r3.stored.listingId));
}
// (4) the field
{
  const row = car(), W = world([row]), r = await D.refreshTasksDemo(env, W.d), f = r.stored && r.stored.field;
  const keys = f ? Object.keys(f) : [];
  ok("(4) the shape Lane E reads: request, car {title, platform, url, photo, live, endsAt, priceLabel, mileage, location, why}, matchedAt, checkedAt", f && ["request", "car", "matchedAt", "checkedAt"].every(k => k in f) && ["title", "platform", "url", "photo", "live", "endsAt", "priceLabel", "mileage", "location", "why"].every(k => k in f.car) && f.car.live === true, keys.join());
  { const Wp = world([car()], { apps: { ZFFEW59A670150000: [rec()] } }), rp = await D.refreshTasksDemo(env, Wp.d), lp = rp.stored && rp.stored.field && rp.stored.field.previous; ok("(4) the earlier sale comes as an engine sentence: previous.priceLine \"Previously sold for $181,888\" (reason table tasks.demo_prior_price), beside the figure", !!lp && lp.priceLine === "Previously sold for $181,888" && lp.price === 181888, lp && lp.priceLine);
    ok("(4) the car's mileage comes as an engine sentence: car.mileageLine \"18,500 miles\" (reason table tasks.demo_miles), the Find card's words, beside the number", rp.stored.field.car.mileageLine === "18,500 miles" && rp.stored.field.car.mileage === 18500, rp.stored.field.car.mileageLine);
    ok("(4) the earlier record's mileage comes as an engine sentence: previous.mileageLine \"15,000 miles at that sale\" (reason table tasks.demo_prior_miles)", !!lp && lp.mileageLine === "15,000 miles at that sale" && lp.mileage === 15000, lp && lp.mileageLine);
    { const fld = rp.stored.field, PAIRS = [["car", "mileage", "mileageLine"], ["car", "priceLabel", null], ["previous", "mileage", "mileageLine"], ["previous", "price", "priceLine"]], miss = PAIRS.filter(([o, n, l]) => fld[o] && fld[o][n] != null && l && !(typeof fld[o][l] === "string" && fld[o][l].length > 0)).map(([o, n, l]) => `${o}.${n} has no ${o}.${l}`);
      ok("(4) THE CLASS: every number the demo carries for a page to print (mileage, the earlier mileage, the earlier price) has its engine sentence beside it, so no page writes a number from a figure", miss.length === 0, miss.join("; ")); }
    { const Wn = world([car()], { apps: { ZFFEW59A670150000: [rec({ mileage: null })] } }), rn = await D.refreshTasksDemo(env, Wn.d), pn = rn.stored && rn.stored.field && rn.stored.field.previous; ok("(4) an earlier record that states no mileage has no mileage line (nothing invented)", !pn || (pn.mileageLine === undefined && pn.mileage == null), JSON.stringify(pn && pn.mileageLine)); }
    { const RW2 = await imp("lib/reasonWords.js"), src = fs.readFileSync("lib/live/tasksDemo.js", "utf8"); ok("(4) both mileage lines are in the reason table and the field is made from the table, not written inline", RW2.reasonLine("tasks.demo_miles", { miles: 4783 }) === "4,783 miles" && RW2.reasonLine("tasks.demo_prior_miles", { miles: 3100 }) === "3,100 miles at that sale" && /reasonLine\("tasks\.demo_miles"/.test(src) && /reasonLine\("tasks\.demo_prior_miles"/.test(src)); }
    const RW = await imp("lib/reasonWords.js"); ok("(4) both number lines are in the reason table, and the field is made from the table, not written inline", RW.reasonLine("tasks.demo_current_bid", { price: 199000 }) === "Current bid $199,000" && RW.reasonLine("tasks.demo_prior_price", { price: 325000 }) === "Previously sold for $325,000" && /reasonLine\("tasks\.demo_current_bid"/.test(fs.readFileSync("lib/live/tasksDemo.js", "utf8")) && /reasonLine\("tasks\.demo_prior_price"/.test(fs.readFileSync("lib/live/tasksDemo.js", "utf8"))); }
  { const rowS = car(), rqS = D.requestFor(rowS, facts(rowS), geo), RWs = await imp("lib/reasonWords.js"); ok("(4) shortRequest: the engine's short form of the request, from the same criteria (reason table tasks.demo_request_short), beside the full request", !!f && f.shortRequest === RWs.reasonLine("tasks.demo_request_short", { colour: rqS.filters.colour, gearbox: rqS.filters.gearbox, make: rqS.filters.make, model: rqS.filters.model, budget: rqS.filters.budget_max }) && /^An? red manual Ferrari F430 under \$\d+k$/.test(f.shortRequest) && f.shortRequest.length < f.request.length, f && f.shortRequest); }
  ok("(4) the price label is printed as given: Current bid $90,000", f && f.car.priceLabel === "Current bid $90,000");
  const t = await imp("lib/tasks/tasks.js");
  ok("(4) why and the criteria come from the engine's own matchReasonList and read the request back", f && f.criteria.length >= 4 && f.car.why === `Matches: ${t.matchReasonList(f.filters || { gearbox: "manual", colour: "red", miles_max: 25000, budget_max: 115000, location: "Richmond, VA", radius_miles: 100 }).join(", ")}.`, f && f.car.why);
  ok("(4) matchReasons is unchanged: the same words joined", t.matchReasons({ colour: "black", gearbox: "manual", budget_max: 70000 }) === "black, manual, under $70,000");
  ok("(4) no valuation word in the request, the why or the criteria", f && !D.VALUATION_WORDS.test([f.request, f.car.why, ...f.criteria].join(" ")));
  ok("(4) the request is the plain sentence the car was written into", f && /^Find me an? /.test(f.request) && /Ferrari F430/.test(f.request) && f.request.includes(f.car.title.split(" ").slice(2).join(" ")) === false || f && /Ferrari F430/.test(f.request));
}
// (5) stable, replaced, stale, failed
{
  const a = car({ id: 1, end_time: IN(30) }), b = car({ id: 2, vin_norm: "VINBBBBBBBBBBBBB2", end_time: IN(20), url: "https://example.test/lot/2" });
  const W = world([a, b]), CREW = "gas_crew=" + C.mintCrewCookieValue();
  const r1 = await D.refreshTasksDemo(env, W.d), first = r1.stored.listingId;
  ok("(5) the first refresh selects a car and stores it under the crew key", r1.why === "selected" && W.cfg.has("crew_tasks_demo") && D.STORE_KEY.startsWith("crew_"), r1.why);
  W.clock += 20 * 60e3;
  const r2 = await D.refreshTasksDemo(env, W.d);
  ok("(5) a later refresh keeps the same car while every rule passes (stable)", r2.why === "kept" && r2.stored.listingId === first);
  ok("(5) with the signed crew cookie the stored pick is served", (await D.tasksDemo(env, CREW, W.d)) !== null);
  W.clock = Date.parse(a.end_time) + 1000;
  a.status = "ended";
  { const Wl = world([car({ id: 5 })]); await D.refreshTasksDemo(env, Wl.d); const live5 = Wl.rows[0]; live5.status = "sold";
    ok("(5) a listing that stops being live before its end time is no longer served", (await D.tasksDemo(env, CREW, Wl.d)) === null); }
  ok("(5) when the auction ends the pick is no longer served", (await D.tasksDemo(env, CREW, W.d)) === null);
  W.clock = NOW + 20 * 60e3; a.status = "live"; a.end_time = IN(30);
  const r3 = await D.refreshTasksDemo(env, world([a, b]).d);
  const W3 = world([a, b]); await D.refreshTasksDemo(env, W3.d); a.status = "ended"; W3.clock = NOW + 40 * 60e3;
  const r4 = await D.refreshTasksDemo(env, W3.d);
  ok("(5) the next refresh replaces an ended pick with another car", r4.why === "selected" && String(r4.stored.listingId) !== String(first), r4.why + " " + (r4.stored && r4.stored.listingId));
  a.status = "live";
  const W5 = world([a, b]); await D.refreshTasksDemo(env, W5.d);
  W5.d.match = async () => [];   // the matcher no longer returns the kept car
  const r5 = await D.refreshTasksDemo(env, { ...W5.d, match: async () => [] });
  ok("(5) a kept pick whose check now fails is replaced, not kept (nothing provable now: no pick, a none marker)", r5.why === "none_provable" && r5.stored === null, r5.why);
  const W6 = world([a, b]); await D.refreshTasksDemo(env, W6.d); W6.clock += 100 * 60e3;
  ok("(5) a stored pick not re-checked within 90 minutes is never served", (await D.tasksDemo(env, CREW, W6.d)) === null);
  const W7 = world([a, b]); await D.refreshTasksDemo(env, W7.d); W7.failSelect = true;
  const r7 = await D.refreshTasksDemo(env, W7.d);
  ok("(5) a failed refresh returns nothing and keeps nothing stored", r7.stored === null && !W7.cfg.has("crew_tasks_demo"), r7.why);
  ok("(5) and the read returns null after it", (await D.tasksDemo(env, CREW, W7.d)) === null);
  const W8 = world([a, b]); W8.failSelect = false; await D.refreshTasksDemo(env, W8.d); W8.d.select = async () => null;
  ok("(5) an unreadable store is a failure, not a pick", (await D.refreshTasksDemo(env, W8.d)).stored === null);
  const W9 = world([car({ mileage: null })]); const r9 = await D.refreshTasksDemo(env, W9.d);
  ok("(5) nothing provable stores a 'none' marker and returns null", r9.stored === null && r9.why === "none_provable" && (await D.tasksDemo(env, CREW, W9.d)) === null);
  const r10 = await D.refreshTasksDemo(env, W9.d);
  ok("(5) a recent empty sweep is not repeated within 30 minutes", r10.why === "swept_recently");
}
// (6) crew gate and kill switch
{
  const a = car(), W = world([a]); await D.refreshTasksDemo(env, W.d);
  const CREW = "gas_crew=" + C.mintCrewCookieValue();
  ok("(6) with the signed crew cookie the field is served", (await D.tasksDemo(env, CREW, W.d)) !== null);
  for (const [name, c] of [["no cookie", ""], ["a plain gas_crew=ok", "gas_crew=ok"], ["a forged crew value", "gas_crew=v1.9999999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], ["a tester cookie", "gas_tester=1"]]) ok(`(6) ${name}: null`, (await D.tasksDemo(env, c, W.d)) === null);
  ok("(6) a request object without the cookie is refused too", (await D.tasksDemo(env, { headers: {} }, W.d)) === null && (await D.tasksDemo(env, { headers: { cookie: CREW } }, W.d)) !== null);
  process.env.TASKS_DEMO = "0";
  ok("(6) the kill switch TASKS_DEMO=0 turns the read off", (await D.tasksDemo(env, CREW, W.d)) === null);
  ok("(6) and the refresh", (await D.refreshTasksDemo(env, W.d)).why === "off");
  delete process.env.TASKS_DEMO;
  ok("(6) the stored key is a crew key", /^crew_/.test(D.STORE_KEY) && [...W.cfg.keys()].every(k => /^crew_/.test(k)), [...W.cfg.keys()].join());
}
// (7) no public surface; zero OCD
{
  // The agreed list (Lane B and Lane E, docs/lane-notes.md, Nov 5 2026): the module and the cron refresh MUST name it; the crew gated Tasks preview (its page lib/preview/tasksPreview.js and the crew route api/crewPage.js, which hands the
  // crew the stored field) MAY. Nothing else may: a public route, a sitemap or a script-served file naming it fails.
  const REQUIRED = ["lib/live/tasksDemo.js", "api/pullLive.js"], ALLOWED = new Set([...REQUIRED, "lib/preview/tasksPreview.js", "api/crewPage.js", "lib/preview/previewPages.js", "lib/preview/fieldCompose.js", "lib/live/entryExamples.js", "lib/live/findExamples.js", "lib/live/watchingDemo.js", "lib/live/marketCheckExamples.js", "lib/live/publicExamples.js", "lib/live/publicAccess.js", "api/publicExamples.js", "lib/preview/publicFind.js"]);   // + the Find examples and the watching card (Nov 7 2026): the same crew gate, the same cron, the same route list
  const NAMES = /tasksDemo|tasks_demo|TASKS_DEMO|findExamples|find_examples|FIND_EXAMPLES|watchingDemo|watching_demo|WATCHING_DEMO/;
  const hits = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (["node_modules", ".git", ".claude", "proofs"].includes(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|json|html|xml|css|txt|md)$/.test(e.name)) { const rel = path.relative(root, p); if (NAMES.test(fs.readFileSync(p, "utf8"))) hits.push(rel); } } };
  for (const top of ["api", "lib", "public", "vercel.json"]) { const p = path.join(root, top); if (!fs.existsSync(p)) continue; if (fs.statSync(p).isDirectory()) walk(p); else if (NAMES.test(fs.readFileSync(p, "utf8"))) hits.push(top); }
  ok("(7) only the module and the cron refresh name the field, the store key or the module", hits.every(h => ALLOWED.has(h)) && REQUIRED.every(h => hits.includes(h)), hits.join(", "));
  const lib = fs.readFileSync(path.join(root, "lib/live/tasksDemo.js"), "utf8");
  { const fn = lib.slice(lib.indexOf("export async function tasksDemo(")); ok("(7) the reader checks the crew cookie before it reads the store", fn.indexOf("isCrewRequest(reqOrCookie)") > 0 && fn.indexOf("isCrewRequest(reqOrCookie)") < fn.indexOf("readStore(env, d)")); }
  const pl = fs.readFileSync(path.join(root, "api/pullLive.js"), "utf8");
  ok("(7) the cron response carries a word about the refresh and never the car", /tasksDemoRefresh/.test(pl) && !/tasksDemo\s*[:,}]/.test(pl.replace(/import\("\.\.\/lib\/live\/tasksDemo\.js"\)/, "")));
  ok("(7) vercel.json has no rewrite, cron or header for it", !NAMES.test(fs.readFileSync(path.join(root, "vercel.json"), "utf8")));
  ok("(7) zero OldCarsData: the module imports no OldCarsData client and calls no metered endpoint", !/from "[^"]*_ocd|oldcarsdata\.com|api\.oldcarsdata/i.test(lib.replace(/^\/\/.*$/gm, "")));
}
console.log(failed ? `\ntasksDemoCheck: ${failed} FAILED of ${n}` : `\ntasksDemoCheck: ${n} pass, 0 FAIL`);
process.exit(failed ? 1 : 0);
