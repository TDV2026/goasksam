// THE THREE FALLBACKS (Lane B, Nov 8 2026, crew only, not live): findExamples.fallback, tasksDemo.fallback, watchingDemo.fallback. A crew page never has nothing: when a live field is null the page prints the fallback, and a fallback is always a RECORD.
//   (1) FIND: three recent completed sales of Porsche 911s from the archive: photo, title, platform, priceLabel "Sold for $X" (the archive's own dollars through the reason table), dateLine; live false; nothing invented to fill three; a failed read keeps the last items
//   (2) TASKS / (3) WATCHING: the most recent car that passed every rule while live, kept after it ends: status "Ended", label "Recent example", car.live false, priceLabel "Last bid $X" (the recorded figure); a still-live car is served live, never as ended;
//       an unreadable car not yet past its end is not served; a failed or empty refresh never clears the record, a newer proved car replaces it
//   (4) THE CLASS: every figure printed on a fallback is a figure the source recorded (no price the record does not hold), no fallback car is live and labelled ended or ended and labelled live, no valuation word, crew gate and kill switch on each, zero OldCarsData,
//       and every crew live field is classified (a new one fails until it has a fallback or is named as without one)
//   node scripts/exampleFallbackCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js", TD = "lib/live/tasksDemo.js", WD = "lib/live/watchingDemo.js", RW = "lib/reasonWords.js";
  const muts = [
    [FE, "price = num(r.sale_price_usd)", "price = num(r.sale_price_usd) * 1.1", "(1) the Find fallback prints a price the archive does not hold"],
    [FE, "if (out.length >= MAX_ITEMS) break; if (out.some(o => o.url === it.url)) continue; out.push(it); }", "if (out.length >= MAX_ITEMS) break; if (out.some(o => o.url === it.url)) continue; out.push(it); }\n  while (out.length && out.length < MAX_ITEMS) out.push({ ...out[0] });", "(1) the Find fallback is padded with copies to make three"],
    [FE, "!genuinePhoto(r.img) || !isHttps(r.img) || !isHttps(url)", "!isHttps(url)", "(1) a placeholder or missing photo is a fallback sale"],
    [FE, "|| !isHttps(url) || !String(r.platform", "|| !String(r.platform", "(1) an http link is a fallback sale"],
    [FE, "!(price > 0) ||", "", "(1) a sale with no price is a fallback sale"],
    [FE, "if (NOT_SOLD.test(String(r.st || \"\") + \" \" + String(r.st2 || \"\"))) return null;", "", "(1) a sale that did not close is a fallback sale"],
    [FE, "&& /911/.test(String(r.listing_title || \"\") + \" \" + title)", "&& true", "(1) a car that is not a 911 is a fallback sale"],
    [FE, "/^porsche$/i.test(r.make) &&", "true &&", "(1) a car that is not a Porsche is a fallback sale"],
    [FE, "live: false, soldAt:", "live: true, soldAt:", "(1) a sale is labelled live"],
    [FE, "if (plats.has(norm(it.platform)) || titles.has(norm(it.title))) continue;", "", "(1) the same platform or car three times when others exist"],
    [FE, "if (!items.length) return { stored: null, why: \"none_found\" };", "if (!items.length) { await d.write(env, { key: FALLBACK_KEY, value: { v: FALLBACK_V, items: [], builtAt: new Date(now).toISOString() } }); return { stored: null, why: \"none_found\" }; }", "(1) an empty read wipes the last stored sales"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const now = d.now();", "if (process.env.FIND_EXAMPLES === \"0\") return null;\n  const now = d.now();", "(4) no cookie: the Find fallback"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const now = d.now();", "if (!isCrewRequest(reqOrCookie)) return null;\n  const now = d.now();", "(4) the kill switch: the Find fallback"],
    [TD, "live: false, priceLabel: reasonLine(\"demo.last_bid\"", "live: true, priceLabel: reasonLine(\"demo.last_bid\"", "(2) an ended car carries a live flag"],
    [TD, "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) })", "priceLabel: reasonLine(\"tasks.demo_current_bid\", { price: Number(st.priceUsd) })", "(2) an ended car is labelled Current bid"],
    [TD, "status: reasonLine(\"demo.ended\"), label: reasonLine(\"demo.recent_example\"), endedAt", "label: reasonLine(\"demo.recent_example\"), endedAt", "(2) an ended car carries no Ended status"],
    [TD, "status: reasonLine(\"demo.ended\"), label: reasonLine(\"demo.recent_example\"), endedAt", "status: reasonLine(\"demo.ended\"), endedAt", "(2) an ended car carries no Recent example label"],
    [TD, "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) })", "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) * 1.2 })", "(2) an ended car prints a bid that was never recorded"],
    [TD, "const stillLive = !!row && liveNow(row, now) && endsAt > now;", "const stillLive = false;", "(2) a car still live is served as ended"],
    [TD, "if (row === null && endsAt > now) return null;", "", "(2) a car that cannot be read is served as ended"],
    [TD, "if (process.env.TASKS_DEMO === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const rows = await d.select(env, `app_config?key=eq.${LAST_KEY}", "if (process.env.TASKS_DEMO === \"0\") return null;\n  const rows = await d.select(env, `app_config?key=eq.${LAST_KEY}", "(4) no cookie: the Tasks fallback"],
    [TD, "if (process.env.TASKS_DEMO === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const rows = await d.select(env, `app_config?key=eq.${LAST_KEY}", "if (!isCrewRequest(reqOrCookie)) return null;\n  const rows = await d.select(env, `app_config?key=eq.${LAST_KEY}", "(4) the kill switch: the Tasks fallback"],
    [TD, "await recordLast(env, d, keep, again.priceUsd, iso, row.vin_norm); return", "return", "(2) a kept car is not recorded"],
    [TD, "await recordLast(env, d, value, p.priceUsd, iso, c.r.vin_norm);", "", "(2) a selected car is not recorded"],
    [TD, "const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); return { stored: null, why }; };", "const drop = async why => { await Promise.resolve(d.clear(env)).catch(() => {}); await Promise.resolve(d.clear(env, LAST_KEY)).catch(() => {}); return { stored: null, why }; };", "(2) a failed refresh clears the record"],
    [WD, "live: false, priceLabel: reasonLine(\"demo.last_bid\"", "live: true, priceLabel: reasonLine(\"demo.last_bid\"", "(3) an ended watching car carries a live flag"],
    [WD, "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) })", "priceLabel: reasonLine(\"tasks.demo_current_bid\", { price: Number(st.priceUsd) })", "(3) an ended watching car is labelled Current bid"],
    [WD, "status: reasonLine(\"demo.ended\"), label: reasonLine(\"demo.recent_example\"), checkedAt", "label: reasonLine(\"demo.recent_example\"), checkedAt", "(3) an ended watching car carries no Ended status"],
    [WD, "status: reasonLine(\"demo.ended\"), label: reasonLine(\"demo.recent_example\"), checkedAt", "status: reasonLine(\"demo.ended\"), checkedAt", "(3) an ended watching car carries no Recent example label"],
    [WD, "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) })", "priceLabel: reasonLine(\"demo.last_bid\", { price: Number(st.priceUsd) + 5000 })", "(3) an ended watching car prints a bid that was never recorded"],
    [WD, "if (row && liveNow(row, now) && endsAt > now) {", "if (false) {", "(3) a watching car still live is served as ended"],
    [WD, "if (row === null && endsAt > now) return null;", "", "(3) a watching car that cannot be read is served as ended"],
    [WD, "norm(String(t.value.field.car.title).split(/\\s+/)[1]) === norm(st.make)) return null;", "false) return null;", "(3) the watching fallback repeats the Tasks card's make"],
    [WD, "if (process.env.WATCHING_DEMO === \"0\" || !isCrewRequest(reqOrCookie)) return null;\n  const s = await readKey(env, d, LAST_KEY)", "if (process.env.WATCHING_DEMO === \"0\") return null;\n  const s = await readKey(env, d, LAST_KEY)", "(4) no cookie: the watching fallback"],
    [WD, "await recordLast(env, d, pick.row, pick.facts, iso);", "", "(3) a selected watching car is not recorded"],
    [WD, "await d.write(env, { key: STORE_KEY, value: keep }); await recordLast(env, d, row, facts, iso);", "await d.write(env, { key: STORE_KEY, value: keep });", "(3) a kept watching car is not recorded"],
    [RW, "text: () => \"Recent example\"", "text: () => \"Live now\"", "(4) the label says live"],
    [RW, "text: p => `Last bid ${money(p.price)}`", "text: p => `Worth ${money(p.price)}`", "(4) a valuation word on a fallback"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exfb-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]); fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/exampleFallbackCheck.mjs"), dir], { encoding: "utf8" });
    const sec = (/^\((\d)\)/.exec(want) || [])[1], out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")"));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 2).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "exfb-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let ocdCalls = 0, fetched = []; globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) { ocdCalls++; fetched.push(String(u)); } return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), TD = await imp("lib/live/tasksDemo.js"), WD = await imp("lib/live/watchingDemo.js"), C = await imp("lib/_crew.js"), S = await imp("lib/live/search.js"), G = await imp("lib/live/geo.js"), RW = await imp("lib/reasonWords.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW = Math.floor(Date.now() / 3600e3) * 3600e3, IN = h => new Date(NOW + h * 3600e3).toISOString(), CREW = "gas_crew=" + C.mintCrewCookieValue();
const VALUATION = /\b(worth|values?|valued|valuations?|estimates?|estimated|appraisals?|appraised|deal|bargain|undervalued|overvalued|steal|good buy)\b/i;
const dollars = s => (String(s).match(/\$([\d,]+)/g) || []).map(x => Number(x.replace(/[$,]/g, "")));

// ---- (1) FIND: the archive world
let sid = 0;
const sale = (o = {}) => ({ sale_date: "2026-10-" + String(28 - (sid % 20)).padStart(2, "0"), platform: ["Bring a Trailer", "Cars & Bids", "PCarMarket"][sid % 3], listing_title: `${1990 + sid} Porsche 911 Carrera`, year: 1990 + sid, make: "Porsche", model: "911", sale_price_usd: 100000 + 1000 * (sid++), img: "https://img.test/p" + sid + ".jpg", url: "https://auction.test/s" + sid, ...o });
function archiveWorld(rows) {
  const w = { store: new Map(), rows, fail: false, writes: 0, selects: 0 };
  w.d = { now: () => NOW, select: async (e, q) => { w.selects++; let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; } if (/^sales_archive/.test(q)) return w.fail ? null : w.rows; return []; },
    write: async (e, row) => { w.writes++; w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key || TD.STORE_KEY); } };
  return w;
}
{
  const rows = [sale(), sale(), sale(), sale()];
  const W = archiveWorld(rows), items = await FE.findExamplesFallback(env, CREW, W.d);
  ok("(1) three recent completed sales of Porsche 911s", Array.isArray(items) && items.length === 3 && items.every(i => /Porsche 911/.test(i.title)), JSON.stringify(items && items.map(i => i.title)));
  const SHAPE = ["dateLine", "fallback", "findUrl", "live", "photo", "platform", "priceLabel", "soldAt", "title", "url"];
  ok("(1) the shape posted for Lane E: title, platform, url, photo, priceLabel, dateLine (live false, fallback true, soldAt, findUrl)", items.every(i => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(SHAPE) && i.live === false && i.fallback === true));
  ok("(1) priceLabel is \"Sold for $X\" and X is the archive's own price for that sale", items.every(i => { const r = rows.find(x => x.url === i.url); return r && i.priceLabel === RW.reasonLine("demo.sold_for", { price: r.sale_price_usd }) && /^Sold for \$[\d,]+$/.test(i.priceLabel); }), JSON.stringify(items.map(i => i.priceLabel)));
  ok("(1) dateLine is the sale month, \"Sold October 2026\"", items.every(i => i.dateLine === "Sold October 2026"), JSON.stringify(items.map(i => i.dateLine)));
  ok("(1) three different platforms when the sales have them", new Set(items.map(i => i.platform)).size === 3, JSON.stringify(items.map(i => i.platform)));
  ok("(1) stored, and the second read is the stored row (no second archive read)", W.store.has(FE.FALLBACK_KEY) && (await FE.findExamplesFallback(env, CREW, W.d)).length === 3 && W.selects === 3, "selects " + W.selects);
}
{ // ineligible rows alone never appear
  const bads = [["a placeholder photo", { img: "https://img.test/placeholder.jpg" }], ["no photo", { img: null }], ["an http link", { url: "http://auction.test/x", url2: null }], ["no price", { sale_price_usd: null }], ["a zero price", { sale_price_usd: 0 }], ["a sale that did not close", { st: "reserve not met" }],
    ["a car that is not a 911", { listing_title: "1995 Porsche 928 GTS", model: "928" }], ["a car that is not a Porsche", { listing_title: "1995 Ferrari 911 replica", make: "Ferrari" }], ["no platform", { platform: "" }], ["no sale date", { sale_date: null }]];
  for (const [name, o] of bads) { const good = sale(), bad = sale(o), W = archiveWorld([bad, good]), items = await FE.findExamplesFallback(env, CREW, W.d);
    ok(`(1) ${name}: never a fallback sale (only the good sale stands, and no copy fills the gap)`, items && items.length === 1 && items[0].url === good.url, JSON.stringify(items && items.map(i => i.title))); }
}
{ // the chooser itself, without the serve filter behind it
  const good = sale(), bads = [sale({ img: "https://img.test/placeholder.jpg" }), sale({ img: null }), sale({ url: "http://auction.test/x", url2: null }), sale({ sale_price_usd: null }), sale({ st: "reserve not met" }), sale({ model: "928", listing_title: "1995 Porsche 928 GTS" }), sale({ make: "Ferrari", listing_title: "Ferrari 911 replica" })];
  ok("(1) the chooser alone refuses a placeholder or missing photo, an http link, no price, a sale that did not close, a 928 and a Ferrari", FE.chooseSales([...bads, good]).length === 1 && FE.chooseSales([...bads, good])[0].url === good.url);
  const a = sale({ platform: "Bring a Trailer" }), b = sale({ platform: "Bring a Trailer" }), c = sale({ platform: "Cars & Bids" }), d2 = sale({ platform: "PCarMarket" });
  ok("(1) the newest of each platform first, a platform and a car never twice while others exist", JSON.stringify(FE.chooseSales([a, b, c, d2]).map(x => x.url)) === JSON.stringify([a, c, d2].map(x => x.url)), JSON.stringify(FE.chooseSales([a, b, c, d2]).map(x => x.platform)));
}
{ const W = archiveWorld([sale()]);
  ok("(4) Find fallback crew gate: no cookie, a plain gas_crew=ok, a forged cookie: null", (await FE.findExamplesFallback(env, "", W.d)) === null && (await FE.findExamplesFallback(env, "gas_crew=ok", W.d)) === null && (await FE.findExamplesFallback(env, "gas_crew=v1.9999999999.forged", W.d)) === null);
  process.env.FIND_EXAMPLES = "0"; ok("(4) kill switch FIND_EXAMPLES=0: null", (await FE.findExamplesFallback(env, CREW, W.d)) === null); delete process.env.FIND_EXAMPLES; }
{ // nothing found is null, never invented; a failed read keeps the last stored items; an empty read does not wipe them
  const W = archiveWorld([]); ok("(1) no sales at all: null, nothing invented", (await FE.findExamplesFallback(env, CREW, W.d)) === null);
  const W2 = archiveWorld([sale(), sale()]); const first = await FE.findExamplesFallback(env, CREW, W2.d);
  ok("(1) two sales make two items, never padded to three", first.length === 2 && new Set(first.map(i => i.url)).size === 2);
  const old = W2.store.get(FE.FALLBACK_KEY); old.builtAt = new Date(NOW - 3 * 864e5).toISOString(); W2.store.set(FE.FALLBACK_KEY, old); W2.fail = true;
  const kept = await FE.findExamplesFallback(env, CREW, W2.d); ok("(1) a failed read keeps serving the last stored sales", kept && kept.length === 2);
  W2.fail = false; W2.rows = []; const again = await FE.findExamplesFallback(env, CREW, W2.d); ok("(1) an empty read does not wipe the last stored sales", again && again.length === 2 && W2.store.get(FE.FALLBACK_KEY).items.length === 2);
  const W3 = archiveWorld([sale()]); await FE.findExamplesFallback(env, CREW, W3.d); const st = W3.store.get(FE.FALLBACK_KEY); st.items[0].live = true; const served = await FE.findExamplesFallback(env, CREW, W3.d);
  ok("(1) a stored item that claims to be live is never served as a sale", served === null);
}

// ---- (2) TASKS and (3) WATCHING: the live world
const car = (o = {}) => ({ id: 1, source: "sothebysmotorsport", url: "https://example.test/lot/" + (o.id || 1), listing_title: "2007 Ferrari F430 6-Speed", year: 2007, make: "Ferrari", model: "F430", vin_norm: "ZFFEW59A670150000", mileage: 18500, mileage_unit: "miles", current_bid: 90000, current_bid_usd: 90000, currency: "USD", location: "Williamsburg, VA", country: "US", transmission: "Manual", exterior_color: "Red", photo_url: "https://img.example.test/f430.jpg", end_time: IN(30), status: "live", ...o });
const facts = r => S.listingFacts(r);
const honest = (f, r) => { const fx = facts(r); return String(r.make).toLowerCase() === f.make.toLowerCase() && String(r.model).toLowerCase() === f.model.toLowerCase() && (!f.gearbox || fx.gearbox === f.gearbox) && (!f.colour || fx.colour === f.colour) && fx.miles <= f.miles_max && Number(r.current_bid_usd) <= f.budget_max && r.status === "live"; };
function world(rows) {
  const w = { store: new Map(), rows, clock: NOW, failSelect: false, unreadableRow: false };
  w.d = { now: () => w.clock, head: async () => ({ status: 200, bytes: 1000, type: "image/jpeg" }), 
    select: async (e, q) => { if (w.failSelect) return null; let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /live_listings\?id=eq\.([^&]+)/.exec(q); if (m) { if (w.unreadableRow) return null; return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1); }
      if (/^live_listings\?status=eq\.live/.test(q)) return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > w.clock);
      return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key || TD.STORE_KEY); },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: [] }), urlStatus: async () => 200, facts,
    geo: async () => ({ listingCoord: G.listingCoord, placeCoord: G.placeCoord, milesBetween: G.milesBetween }),
    read: async (e, text) => TD.readRequest(e, text), match: async (e, f) => w.rows.filter(r => honest(f, r)).map(r => ({ r })),
    reasons: async f => (await imp("lib/tasks/tasks.js")).matchReasonList(f) };
  return w;
}
const ended = (w, h = 1) => { w.clock = NOW + 30 * 3600e3 + h * 3600e3; };   // past the Ferrari's end
{ // TASKS
  const W = world([car()]); const r = await TD.refreshTasksDemo(env, W.d), live = await TD.tasksDemo(env, CREW, W.d);
  ok("(2) a proved car is served live and its record is written beside it", r.why === "selected" && live && live.car.live === true && W.store.has(TD.LAST_KEY), r.why);
  ok("(2) while the car is live the fallback is the same live car, labelled live, with its current bid", await (async () => { const f = await TD.tasksDemoFallback(env, CREW, W.d); return f && f.car.live === true && !f.status && !f.label && /^Current bid \$90,000$/.test(f.car.priceLabel); })());
  // the pull has not run and the check is stale: the live field is null but the car is still live
  W.clock = NOW + 3 * 3600e3; const stale = await TD.tasksDemo(env, CREW, W.d), fbStale = await TD.tasksDemoFallback(env, CREW, W.d);
  ok("(2) a stale check: the live field is null and the fallback serves the still-live car as live, never as ended", stale === null && fbStale && fbStale.car.live === true && !fbStale.status && /^Current bid /.test(fbStale.car.priceLabel));
  W.store.delete(TD.LAST_KEY); const keptRun = await TD.refreshTasksDemo(env, W.d);
  ok("(2) a kept car is recorded again (the record follows the latest proof)", keptRun.why === "kept" && W.store.has(TD.LAST_KEY), keptRun.why);
  W.clock = NOW + 3 * 3600e3;
  // the auction ends
  ended(W); const gone = await TD.tasksDemo(env, CREW, W.d), fb = await TD.tasksDemoFallback(env, CREW, W.d);
  ok("(2) after the auction ends the live field is null and the fallback serves the car", gone === null && fb !== null);
  ok("(2) the ended car: status \"Ended\", label \"Recent example\", car.live false", fb.status === "Ended" && fb.label === "Recent example" && fb.car.live === false, JSON.stringify([fb.status, fb.label, fb.car.live]));
  ok("(2) the ended car's price is \"Last bid $90,000\", the figure recorded when it was proved, and never \"Current bid\"", fb.car.priceLabel === "Last bid $90,000" && !/Current bid/.test(JSON.stringify(fb)), fb.car.priceLabel);
  ok("(2) the car, its request and its criteria are the proved ones, unchanged", fb.car.title === "2007 Ferrari F430" && fb.car.url === "https://example.test/lot/1" && fb.car.photo === "https://img.example.test/f430.jpg" && /Ferrari F430/.test(fb.request) && Array.isArray(fb.criteria) && fb.criteria.length > 0);
  ok("(4) no ended-label on a live car and no live-label on an ended one across both reads", !(fbStale.status || fbStale.label) && fb.car.live === false && fb.status === "Ended");
  // the other states
  const W2 = world([car()]); await TD.refreshTasksDemo(env, W2.d); ended(W2); W2.failSelect = false; W2.unreadableRow = false;
  const r2 = await TD.refreshTasksDemo(env, W2.d);
  ok("(2) a refresh that finds no car (the pool is empty) stores nothing and leaves the record", r2.stored === null && W2.store.has(TD.LAST_KEY) && (await TD.tasksDemoFallback(env, CREW, W2.d)).status === "Ended", r2.why);
  W2.failSelect = true; const r3 = await TD.refreshTasksDemo(env, W2.d); W2.failSelect = false;
  ok("(2) a refresh that fails to read leaves the record too", r3.stored === null && W2.store.has(TD.LAST_KEY));
  const W3 = world([car()]); await TD.refreshTasksDemo(env, W3.d); W3.rows[0].end_time = IN(5); W3.clock = NOW + 3 * 3600e3; W3.unreadableRow = true;
  const unk = await TD.tasksDemoFallback(env, { headers: { cookie: CREW } }, W3.d);
  ok("(2) a car that cannot be read before its end is neither live nor ended: not served", unk === null);
  W3.unreadableRow = false; W3.clock = NOW + 31 * 3600e3 + 3600e3; W3.rows[0].end_time = IN(30); W3.unreadableRow = true;
  const pastEnd = await TD.tasksDemoFallback(env, CREW, W3.d); ok("(2) unreadable but past its end time: ended", pastEnd && pastEnd.status === "Ended");
  // a newer proved car replaces the record; the record never keeps an older car once a newer one passes
  const W4 = world([car({ id: 1 })]); await TD.refreshTasksDemo(env, W4.d); ended(W4); W4.rows.push(car({ id: 2, make: "Porsche", model: "911", listing_title: "2019 Porsche 911", year: 2019, vin_norm: "WP0CF2A94KS172236", end_time: IN(60), current_bid: 200000, current_bid_usd: 200000, exterior_color: "White", transmission: "Manual", mileage: 4783 }));
  await TD.refreshTasksDemo(env, W4.d); const rec = W4.store.get(TD.LAST_KEY);
  ok("(2) a newer proved car replaces the record", rec && String(rec.listingId) === "2" && rec.priceUsd === 200000, JSON.stringify(rec && rec.listingId));
  ok("(4) crew gate: no cookie, a plain gas_crew=ok, a forged cookie: null", (await TD.tasksDemoFallback(env, "", W.d)) === null && (await TD.tasksDemoFallback(env, "gas_crew=ok", W.d)) === null && (await TD.tasksDemoFallback(env, "gas_crew=v1.9999999999.forged", W.d)) === null);
  process.env.TASKS_DEMO = "0"; ok("(4) kill switch TASKS_DEMO=0: null", (await TD.tasksDemoFallback(env, CREW, W.d)) === null); delete process.env.TASKS_DEMO;
  ok("(4) no valuation word, and every dollar figure on the Tasks fallback is the recorded bid, the request's own ceiling or a recorded sale", !VALUATION.test(JSON.stringify(fb)) && dollars(fb.car.priceLabel).every(x => x === W.store.get(TD.LAST_KEY).priceUsd));
}
{ // WATCHING
  const W = world([car({ id: 7, make: "BMW", model: "M3", listing_title: "2006 BMW M3", year: 2006, vin_norm: "WBSBL93496PN00001", end_time: IN(20), current_bid: 40000, current_bid_usd: 40000 })]);
  const r = await WD.refreshWatchingDemo(env, W.d), live = await WD.watchingDemo(env, CREW, W.d);
  ok("(3) a proved watching car is served live and its record is written beside it", r.why === "selected" && live && live.car.live === true && W.store.has(WD.LAST_KEY), r.why);
  W.store.delete(WD.LAST_KEY); const keptW = await WD.refreshWatchingDemo(env, W.d);
  ok("(3) a kept watching car is recorded again", keptW.why === "kept" && W.store.has(WD.LAST_KEY), keptW.why);
  W.clock = NOW + 3 * 3600e3; const stale = await WD.watchingDemo(env, CREW, W.d), fbLive = await WD.watchingDemoFallback(env, CREW, W.d);
  ok("(3) a stale check: the live field is null and the fallback serves the still-live car as live, never as ended", stale === null && fbLive && fbLive.car.live === true && fbLive.status !== "Ended" && !fbLive.label && /^Current bid /.test(fbLive.car.priceLabel));
  W.clock = NOW + 21 * 3600e3; const gone = await WD.watchingDemo(env, CREW, W.d), fb = await WD.watchingDemoFallback(env, CREW, W.d);
  ok("(3) after the auction ends the live field is null and the fallback serves the car", gone === null && fb !== null);
  ok("(3) the ended watching car: status \"Ended\", label \"Recent example\", car.live false, timeLine \"Ended\"", fb.status === "Ended" && fb.label === "Recent example" && fb.car.live === false && fb.car.timeLine === "Ended", JSON.stringify([fb.status, fb.label, fb.car.live, fb.car.timeLine]));
  ok("(3) its price is \"Last bid $40,000\" (the recorded bid), never \"Current bid\"", fb.car.priceLabel === "Last bid $40,000" && !/Current bid/.test(JSON.stringify(fb)), fb.car.priceLabel);
  ok("(3) the car's own title, platform, link and photo", fb.car.title === "2006 BMW M3" && fb.car.platform === "Sotheby's Motorsport" && fb.car.url === "https://example.test/lot/7" && fb.car.photo === "https://img.example.test/f430.jpg", JSON.stringify([fb.car.title, fb.car.platform]));
  const r2 = await WD.refreshWatchingDemo(env, W.d); ok("(3) a refresh that finds no car leaves the record", r2.stored === null && W.store.has(WD.LAST_KEY) && (await WD.watchingDemoFallback(env, CREW, W.d)).status === "Ended", r2.why);
  W.unreadableRow = true; W.clock = NOW + 3 * 3600e3; ok("(3) unreadable before its end: not served", (await WD.watchingDemoFallback(env, CREW, W.d)) === null); W.unreadableRow = false;
  // never the Tasks fallback's make
  W.clock = NOW + 21 * 3600e3; W.store.set(TD.LAST_KEY, { v: 1, listingId: 99, priceUsd: 50000, recordedAt: IN(-1), field: { car: { title: "2008 BMW M5", endsAt: IN(-2) } } });
  ok("(3) never the same make as the Tasks card's record", (await WD.watchingDemoFallback(env, CREW, W.d)) === null);
  W.store.delete(TD.LAST_KEY); ok("(3) with no Tasks record to repeat, the ended watching car is served again", (await WD.watchingDemoFallback(env, CREW, W.d)) !== null);
  ok("(4) crew gate: no cookie, a plain gas_crew=ok, a forged cookie: null", (await WD.watchingDemoFallback(env, "", W.d)) === null && (await WD.watchingDemoFallback(env, "gas_crew=ok", W.d)) === null && (await WD.watchingDemoFallback(env, "gas_crew=v1.9999999999.forged", W.d)) === null);
  process.env.WATCHING_DEMO = "0"; ok("(4) kill switch WATCHING_DEMO=0: null", (await WD.watchingDemoFallback(env, CREW, W.d)) === null); delete process.env.WATCHING_DEMO;
  ok("(4) no valuation word on the watching fallback", !VALUATION.test(JSON.stringify(fb)));
}
// ---- (4) THE CLASS
{
  ok("(4) zero metered OldCarsData (/auctions) across every fallback read; the free /makes and /models lookups the request reader makes are not metered", ocdCalls === 0, "calls " + ocdCalls + " " + fetched.slice(0,3).join(" "));
  for (const id of ["demo.sold_for", "demo.sold_date", "demo.ended", "demo.recent_example", "demo.last_bid"]) ok(`(4) reason line ${id} is in the table and carries no valuation word`, !VALUATION.test(RW.reasonLine(id, { price: 90000, when: "October 2026" })), RW.reasonLine(id, { price: 90000, when: "October 2026" }));
  ok("(4) the three words a page prints on a record: Ended, Recent example, Last bid $X, Sold for $X", RW.reasonLine("demo.ended") === "Ended" && RW.reasonLine("demo.recent_example") === "Recent example" && RW.reasonLine("demo.last_bid", { price: 1234 }) === "Last bid $1,234" && RW.reasonLine("demo.sold_for", { price: 1234 }) === "Sold for $1,234");
  // every crew live field is classified: it has a fallback, or it is named as without one. A new exported crew reader fails here until it is classified.
  const read = f => fs.readFileSync(path.join(root, f), "utf8"), liveDir = path.join(root, "lib/live");
  const readers = []; for (const f of fs.readdirSync(liveDir).filter(x => /\.js$/.test(x))) { const src = read("lib/live/" + f); for (const m of src.matchAll(/export async function (\w+)\(env, (?:reqOrCookie|req)[,)][^{]*\{\s*(?:const [^\n]*\n\s*)?(?:[^\n]*\n\s*){0,2}[^\n]*isCrewRequest\(/g)) { if (!/(Fallback|Field)$/.test(m[1])) readers.push(f + ":" + m[1]); } }
  const KNOWN = { "findExamples.js:findExamples": "findExamplesFallback", "tasksDemo.js:tasksDemo": "tasksDemoFallback", "tasksDemo.js:tasksEmailExample": "tasksEmailExample", "watchingDemo.js:watchingDemo": "watchingDemoFallback", "featuredHistory.js:readFeaturedHistory": null };
  const unclassified = readers.filter(r => !(r in KNOWN)), missing = Object.entries(KNOWN).filter(([r, fb]) => fb && !read("lib/live/" + r.split(":")[0]).includes("export async function " + fb + "("));
  ok("(4) every crew live reader is classified (a fallback, or named as without one)", unclassified.length === 0 && missing.length === 0, "unclassified " + unclassified.join(", ") + " missing " + missing.map(m => m[1]).join(", ") + " found " + readers.join(", "));
}
console.log(`\nexampleFallbackCheck: ${n - failed} pass, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
