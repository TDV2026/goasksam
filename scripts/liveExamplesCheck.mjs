// THE FIND EXAMPLES AND THE WATCHING CARD (Lane B, Nov 7 2026, crew only, not live). Lane E's names and shapes (docs/lane-notes.md, cf59a345): findExamples(env, req) -> up to three items or null; watchingDemo(env, req) -> { car, status?, checkedAt } or null;
// tasksDemo.shortRequest. No database, no network (injected reads), the real eligibility, the real reason table, the real crew cookie.
//   (1) ELIGIBILITY: live now (at selection and at every serve, by a keyed read), a real photo, a real https link, a price the trust layer states in dollars; a placeholder photo, an http link, an unconverted price, an ended auction, one with minutes left and one with no model are never chosen
//   (2) DIFFERENT MAKES, visual variety, at most three; (3) soldBefore only on a VIN-confirmed completed sale (a listed-only earlier record, another car's VIN and an evidence link that is gone are false) and a sold car is chosen when one is available
//   (4) STABLE while live, an ended car replaced and the others kept; (5) null when fewer than one, a stored pick not re-checked in 90 minutes never served; (6) crew gate and kill switches; (7) zero OldCarsData
//   (8) THE WATCHING CARD: a different make from the Tasks example, a Ferrari or a BMW preferred, status only within 24 hours, no sentence that claims a reminder; (9) shortRequest from the same criteria
//   node scripts/liveExamplesCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
// clock: real-ok every moment is built from one NOW read at the top, so the verdict does not change with the day
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), root = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const FE = "lib/live/findExamples.js", WD = "lib/live/watchingDemo.js", RW = "lib/reasonWords.js";
  const muts = [
    [FE, "if (!genuinePhoto(row.photo_url) || !isHttps(row.url)) return false;", "if (!isHttps(row.url)) return false;", "(1) a placeholder photo is chosen"],
    [FE, "if (!genuinePhoto(row.photo_url) || !isHttps(row.url)) return false;", "if (!genuinePhoto(row.photo_url)) return false;", "(1) an http link is chosen"],
    [FE, "return p > 0 && facts.priceState !== \"suspect\" && facts.priceState !== \"unconverted\";", "return true;", "(1) a price the trust layer cannot state is chosen"],
    [FE, "if (!liveNow(row, now) || Date.parse(row.end_time) - now < minLeftMs) return false;", "if (!liveNow(row, now)) return false;", "(1) a car with minutes left is chosen"],
    [FE, "return cands.filter(c => !makes.has(norm(c.row.make))).sort(", "return cands.sort(", "(2) two cars of one make"],
    [FE, "(!haveSold && c.sold ? 1000 : 0) + ", "0 + ", "(3) a sold-before car is not preferred when one is available"],
    [FE, "return !!(e.ok && e.featured.kind === \"sold\");", "return !!e.ok;", "(3) a listed-only earlier record counts as sold before"],
    [FE, "us[u] = await d.urlStatus(u);", "us[u] = 200;", "(3) a gone evidence link still counts as sold before"],
    [FE, "if (eligibleRow(row, facts, now) && !kept.some(", "if (false && !kept.some(", "(4) a stored car is not kept while it passes"],
    [FE, "if (!eligibleRow(row, facts, now) || seen.has(norm(row.make))) continue;", "if (seen.has(norm(row.make))) continue;", "(1) a car not live right now is served"],
    [FE, "|| !(Date.parse(st.checkedAt) > now - MAX_CHECK_AGE_MS)", "", "(5) a stored pick not re-checked in 90 minutes is served"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !isCrewRequest(reqOrCookie)) return null;", "if (process.env.FIND_EXAMPLES === \"0\") return null;", "(6) no cookie: the examples"],
    [FE, "if (process.env.FIND_EXAMPLES === \"0\" || !isCrewRequest(reqOrCookie)) return null;", "if (!isCrewRequest(reqOrCookie)) return null;", "(6) the kill switch: the examples"],
    [FE, "findUrl: \"/find?q=\" + encodeURIComponent(title)", "findUrl: \"/buy?q=\" + encodeURIComponent(title)", "(1) the Find address is not the Find result"],
    [WD, "if (process.env.WATCHING_DEMO === \"0\" || !isCrewRequest(reqOrCookie)) return null;", "if (process.env.WATCHING_DEMO === \"0\") return null;", "(6) no cookie: the watching card"],
    [WD, "if (tm.failed || (tm.make && tm.make === norm(row.make))) return null;", "if (tm.failed) return null;", "(8) the watching card serves the Tasks example's make"],
    [WD, "for (const row of live) { if (tm.make && tm.make === norm(row.make)) continue;", "for (const row of live) {", "(8) the watching card is chosen from the Tasks example's make"],
    [WD, "(PREFERRED.test(a.row.make) ? 0 : 1) - (PREFERRED.test(b.row.make) ? 0 : 1) || ", "", "(8) a Ferrari or a BMW is not preferred"],
    [WD, "...(left <= SOON_MS ? { status: reasonLine(\"demo.ending_soon\") } : {})", "...{ status: reasonLine(\"demo.ending_soon\") }", "(8) ending soon is said of a car with days left"],
    [RW, "text: () => \"Auction ending soon\"", "text: () => \"Reminder sent: auction ending soon\"", "(8) the card claims a reminder was sent"],
    [RW, "return `${/^[aeiou]/i.test(words) ? \"An\" : \"A\"} ${words}", "return `${\"A\"} ${words}", "(9) a short request with the wrong article"],
    [RW, "return d >= 1 ? `${d} ${d === 1 ? \"day\" : \"days\"} left`", "return false ? `${d} days left`", "(1) the time left drops its days"],
    ["lib/live/tasksDemo.js", "const field = { request: req.text, shortRequest, car,", "const field = { request: req.text, car,", "(9) no shortRequest on the Tasks example"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "liveex-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", root + "/", dir + "/"]); fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/liveExamplesCheck.mjs"), dir], { encoding: "utf8" });
    const sec = (/^\((\d)\)/.exec(want) || [])[1], out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => l.startsWith("FAIL  (" + sec + ")"));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 2).join("\n")); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(root);
process.env.CURTAIN_CREW_CODE = "liveex-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let ocdCalls = 0; globalThis.fetch = async u => { if (!/fake\.supabase\.test/.test(String(u))) ocdCalls++; return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const FE = await imp("lib/live/findExamples.js"), WD = await imp("lib/live/watchingDemo.js"), TD = await imp("lib/live/tasksDemo.js"), C = await imp("lib/_crew.js"), RW = await imp("lib/reasonWords.js"), S = await imp("lib/live/search.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const NOW0 = Math.floor(Date.now() / 3600e3) * 3600e3, CREW = "gas_crew=" + C.mintCrewCookieValue();
let id = 0;
const car = (make, model, year, o = {}) => ({ id: ++id, source: "bringatrailer", url: "https://auction.test/lot/" + id, photo_url: "https://img.test/p" + id + ".jpg", listing_title: `${year} ${make} ${model}`, year, make, model, vin_norm: o.vin === null ? null : (o.vin || "VIN" + String(id).padStart(14, "0")), mileage: 20000, mileage_unit: "miles", current_bid: o.bid ?? 60000, current_bid_usd: o.bid ?? 60000, currency: "USD", country: "US", location: "Austin, TX", transmission: "Manual", exterior_color: o.colour || "Red", body: o.body || null, status: "live", end_time: new Date(NOW0 + (o.h ?? 30 + id) * 3600e3).toISOString(), description: "", ...(o.more || {}) });
// the injected world: live rows, a store, appearances by VIN, evidence link statuses
function world(rows, { apps = {}, urlStatus = {}, now = NOW0 } = {}) {
  const w = { rows, store: new Map(), apps, urlStatus, clock: now, writes: 0 };
  w.d = {
    now: () => w.clock,
    select: async (e, q) => {
      if (w.fail) return null;
      let m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; }
      m = /^live_listings\?id=eq\.([^&]+)/.exec(q); if (m) return w.rows.filter(r => String(r.id) === decodeURIComponent(m[1])).slice(0, 1);
      if (/^live_listings\?status=eq\.live/.test(q)) { const after = w.clock; /* the database's end_time filter is only an efficiency: the module's own rule must hold without it */ return w.rows.filter(r => r.status === "live" && r.photo_url && Date.parse(r.end_time) > after); }
      return [];
    },
    write: async (e, row) => { w.writes++; w.store.set(row.key, row.value); }, clear: async (e, key) => { w.store.delete(key); },
    appearances: async (e, vin) => ({ ok: true, vinNorm: vin, appearances: w.apps[vin] || [] }),
    urlStatus: async u => (u in w.urlStatus ? w.urlStatus[u] : 200),
    facts: async r => S.listingFacts(r)
  };
  return w;
}
const sale = (vin, o = {}) => ({ kind: "sale", date: "2023-02-14", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/" + vin + "/", image: "https://img.test/old-" + vin + ".jpg", mileage: 15000, priceUsd: 181888, vinNorm: vin, ...o });
const SHAPE = ["title", "platform", "url", "photo", "live", "endsAt", "findUrl", "priceLabel", "timeLine", "soldBefore"];
const GOOD = () => [car("Porsche", "911", 1995, { colour: "White", h: 40 }), car("Porsche", "911", 2003, { colour: "Black", h: 41 }), car("Ferrari", "F430", 2007, { colour: "Red", h: 42 }), car("BMW", "M3", 2006, { colour: "Blue", h: 43 }), car("Audi", "RS4", 2008, { colour: "Silver", h: 44 }), car("Ford", "Mustang", 1967, { colour: "Green", h: 45 })];
// ---- (1) eligibility, (2) different makes, shape
{
  const bad = [car("Lamborghini", "Gallardo", 2008, { more: { photo_url: "https://img.test/placeholder.jpg" } }), car("Maserati", "GranTurismo", 2010, { more: { url: "http://auction.test/lot/x" } }), car("Lotus", "Elise", 2005, { more: { currency: null, source: "sothebysmotorsport", current_bid_usd: null } }),
    car("Jaguar", "E-Type", 1966, { more: { end_time: new Date(NOW0 - 3600e3).toISOString() } }), car("Alfa Romeo", "Giulia", 1969, { h: 0.2 }), car("Mazda", "", 1999)];
  const W = world([...bad, ...GOOD()]), r = await FE.refreshFindExamples(env, W.d), items = await FE.findExamples(env, CREW, W.d);
  ok("(2) three cars of three different makes", Array.isArray(items) && items.length === 3 && new Set(items.map(i => i.title.split(" ")[1])).size === 3, JSON.stringify(items && items.map(i => i.title)));
  ok("(1) never a placeholder photo, an http link, an unconverted price, an ended auction, minutes left or no model", items.every(i => !/placeholder/.test(i.photo) && /^https:/.test(i.url) && !/Gallardo|GranTurismo|Elise|E-Type|Giulia|Mazda/.test(i.title)), JSON.stringify(items.map(i => i.title)));
  ok("(1) Lane E's shape exactly: " + SHAPE.join(", "), items.every(i => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(SHAPE.slice().sort()) && i.live === true && typeof i.soldBefore === "boolean"), JSON.stringify(Object.keys(items[0])));
  const it = items[0], row = W.rows.find(x => x.url === it.url);
  ok("(1) the title is year make model, the platform the house's name, the photo and link the car's own", it.title === `${row.year} ${row.make} ${row.model}` && it.platform === "Bring a Trailer" && it.photo === row.photo_url && it.url === row.url);
  ok("(1) findUrl is the car's normal Find result: /find?q= and its title", items.every(i => i.findUrl === "/find?q=" + encodeURIComponent(i.title)), it.findUrl);
  ok("(1) priceLabel and timeLine are reason table sentences (Current bid $X, N days left)", items.every(i => /^Current bid \$[\d,]+$/.test(i.priceLabel) && /^\d+ (day|days|hour|hours|minute|minutes) left$/.test(i.timeLine)) && it.priceLabel === RW.reasonLine("tasks.demo_current_bid", { price: row.current_bid_usd }) && it.timeLine === RW.reasonLine("demo.time_left", { ms: Date.parse(row.end_time) - NOW0 }), `${it.priceLabel} | ${it.timeLine}`);
  ok("(1) endsAt is the auction's own end", items.every(i => W.rows.some(x => x.url === i.url && new Date(x.end_time).toISOString() === i.endsAt)));
  ok("(1) visual variety: the two Porsches are not both chosen, and the choice spans decades or colours", new Set(items.map(i => i.title.split(" ")[0].slice(0, 3))).size >= 2);
}
{ // (1) each ineligible car alone: nothing stored, nothing served, and the same car beside a good one never joins it
  const bads = [["a placeholder photo", { more: { photo_url: "https://img.test/placeholder.jpg" } }], ["an http link", { more: { url: "http://auction.test/lot/x" } }], ["a price the trust layer cannot state", { more: { currency: null, source: "sothebysmotorsport", current_bid_usd: null } }], ["an ended auction", { more: { end_time: new Date(NOW0 - 3600e3).toISOString() } }], ["minutes left", { h: 0.2 }], ["no model", { more: { model: "" } }]];
  for (const [name, o] of bads) { const b = car("Lamborghini", "Gallardo", 2008, o), W = world([b, car("Ferrari", "F430", 2007)]); await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d);
    ok(`(1) ${name}: the car is never chosen (only the good car stands)`, items && items.length === 1 && /Ferrari/.test(items[0].title) && (W.store.get(FE.STORE_KEY).entries || []).every(e => String(e.listingId) !== String(b.id)), JSON.stringify(items && items.map(i => i.title))); }
}
{ // (2) the pool holds three Porsches and one Ferrari: two cars, never two Porsches
  const W = world([car("Porsche", "911", 1995), car("Porsche", "911", 2003), car("Porsche", "356", 1960), car("Ferrari", "F430", 2007)]); await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d);
  ok("(2) the stored pick itself holds one car per make", (W.store.get(FE.STORE_KEY).entries || []).length === 2, JSON.stringify(W.store.get(FE.STORE_KEY)));
  ok("(2) three Porsches and a Ferrari: one of each, never two of a make", items.length === 2 && items.filter(i => /Porsche/.test(i.title)).length === 1, JSON.stringify(items.map(i => i.title)));
}
{ // (1) the time line's words
  ok("(1) 2.4 days is \"2 days left\", 1.2 days is \"1 day left\", 5.5 hours \"5 hours left\", 40 minutes \"40 minutes left\"", [[2.4 * 864e5, "2 days left"], [1.2 * 864e5, "1 day left"], [5.5 * 36e5, "5 hours left"], [40 * 6e4, "40 minutes left"]].every(([ms, w]) => RW.reasonLine("demo.time_left", { ms }) === w), RW.reasonLine("demo.time_left", { ms: 2.4 * 864e5 }));
}
// ---- (3) soldBefore
{
  const g = GOOD(), vinS = g[2].vin_norm, vinL = g[3].vin_norm, vinW = g[4].vin_norm, vinG = g[5].vin_norm;
  const apps = { [vinS]: [sale(vinS)], [vinL]: [{ kind: "attempt", date: "2023-03-01", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/x/", image: "https://img.test/x.jpg", mileage: 9000, bidUsd: 50000, vinNorm: vinL }], [vinW]: [sale(vinW, { year: 1985 })], [vinG]: [sale(vinG)] };
  const W = world(g, { apps, urlStatus: { ["https://bringatrailer.com/listing/" + vinG + "/"]: 404 } });
  await FE.refreshFindExamples(env, W.d); const items = await FE.findExamples(env, CREW, W.d), by = t => items.find(i => i.title.includes(t));
  ok("(3) a VIN with a completed sale is soldBefore true (the Ferrari)", by("Ferrari") && by("Ferrari").soldBefore === true, JSON.stringify(items.map(i => [i.title, i.soldBefore])));
  ok("(3) a listed-only earlier record is false (the BMW)", !by("BMW") || by("BMW").soldBefore === false);
  ok("(3) an earlier record of another year is not the same car: false (the Audi)", !by("Audi") || by("Audi").soldBefore === false);
  ok("(3) a completed sale whose evidence link is gone is false (the Ford)", !by("Ford") || by("Ford").soldBefore === false);
  ok("(3) a sold-before car is chosen when one is available", items.some(i => i.soldBefore === true));
  ok("(3) the Porsche with no history is false", items.filter(i => /Porsche/.test(i.title)).every(i => i.soldBefore === false));
}
// ---- (4) stable, replaced on end
{
  const W = world(GOOD()); await FE.refreshFindExamples(env, W.d); const first = await FE.findExamples(env, CREW, W.d);
  W.clock = NOW0 + 3600e3; await FE.refreshFindExamples(env, W.d); const again = await FE.findExamples(env, CREW, W.d);
  ok("(4) an hour later the same three cars", JSON.stringify(again.map(i => i.url)) === JSON.stringify(first.map(i => i.url)), JSON.stringify(again.map(i => i.title)));
  { const W5 = world([...W.rows, car("Lamborghini", "Countach", 1985, { h: 70 })], { apps: { ["VIN" + String(id).padStart(14, "0")]: [sale("VIN" + String(id).padStart(14, "0"))] } }); W5.store = new Map(W.store); W5.clock = NOW0 + 7200e3; await FE.refreshFindExamples(env, W5.d); const kept3 = await FE.findExamples(env, CREW, W5.d);
    ok("(4) a better new car (a sold-before Lamborghini) does not displace three cars that are still live", JSON.stringify(kept3.map(i => i.url)) === JSON.stringify(first.map(i => i.url)), JSON.stringify(kept3.map(i => i.title))); }
  const gone = W.rows.find(r => r.url === first[1].url); gone.end_time = new Date(W.clock - 60e3).toISOString(); gone.status = "ended";
  W.clock += 3600e3; await FE.refreshFindExamples(env, W.d); const after = await FE.findExamples(env, CREW, W.d);
  ok("(4) the car whose auction ended is replaced and the other two are kept", after.length === 3 && !after.some(i => i.url === gone.url) && after.filter(i => first.some(f => f.url === i.url)).length === 2, JSON.stringify(after.map(i => i.title)));
  ok("(4) the replacement is a make not already chosen", new Set(after.map(i => i.title.split(" ")[1])).size === 3);
}
// ---- (5) null, a short list, and age
{
  const W0 = world([]), r0 = await FE.refreshFindExamples(env, W0.d); ok("(5) no eligible car: nothing stored, the field is null", r0.stored === null && (await FE.findExamples(env, CREW, W0.d)) === null, JSON.stringify(r0));
  const W2 = world([car("Porsche", "911", 1995), car("Ferrari", "F430", 2007)]); await FE.refreshFindExamples(env, W2.d); const two = await FE.findExamples(env, CREW, W2.d);
  ok("(5) two eligible cars: an array of two, not null", Array.isArray(two) && two.length === 2);
  const W = world(GOOD()); await FE.refreshFindExamples(env, W.d); W.clock = NOW0 + 91 * 60e3;
  ok("(5) a stored pick not re-checked in 90 minutes is never served", (await FE.findExamples(env, CREW, W.d)) === null);
  W.clock = NOW0 + 10 * 60e3; for (const r of W.rows) r.status = "ended"; ok("(1) every stored car ended since the check: null at the serve", (await FE.findExamples(env, CREW, W.d)) === null);
  const W3 = world(GOOD()); W3.fail = true; const rf = await FE.refreshFindExamples(env, W3.d); ok("(5) a failed read stores nothing and returns nothing", rf.stored === null && W3.store.size === 0 && (await FE.findExamples(env, CREW, W3.d)) === null, JSON.stringify(rf));
  const Ws = world(GOOD()); await FE.refreshFindExamples(env, Ws.d); Ws.rows.find(r => r.url === (null) || true); const first = await FE.findExamples(env, CREW, Ws.d); Ws.rows.find(r => r.url === first[0].url).status = "ended";
  const mid = await FE.findExamples(env, CREW, Ws.d); ok("(1) a car that ended since the check is dropped at the serve by a keyed read, the others still served", mid.length === first.length - 1 && !mid.some(i => i.url === first[0].url));
}
// ---- (6) the gate
{
  const W = world(GOOD()); await FE.refreshFindExamples(env, W.d); await WD.refreshWatchingDemo(env, W.d);
  ok("(6) with the signed crew cookie the examples are served", (await FE.findExamples(env, CREW, W.d)) !== null);
  for (const [name, c] of [["no cookie", ""], ["a plain gas_crew=ok", "gas_crew=ok"], ["a forged crew value", "gas_crew=v1.9999999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], ["a tester cookie", "gas_tester=1"]]) ok(`(6) ${name}: null for the examples and the watching card`, (await FE.findExamples(env, c, W.d)) === null && (await WD.watchingDemo(env, c, W.d)) === null);
  process.env.FIND_EXAMPLES = "0"; const a = await FE.findExamples(env, CREW, W.d), r = await FE.refreshFindExamples(env, W.d); delete process.env.FIND_EXAMPLES; ok("(6) the kill switch FIND_EXAMPLES=0: null and no refresh", a === null && r.why === "off");
  process.env.WATCHING_DEMO = "0"; const b = await WD.watchingDemo(env, CREW, W.d); delete process.env.WATCHING_DEMO; ok("(6) the kill switch WATCHING_DEMO=0", b === null);
  ok("(6) the stored keys are crew keys", FE.STORE_KEY === "crew_find_examples" && WD.STORE_KEY === "crew_watching_demo");
}
// ---- (7) zero OldCarsData
{
  const src = ["lib/live/findExamples.js", "lib/live/watchingDemo.js"].map(f => fs.readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")).join("\n");
  ok("(7) neither module imports the OldCarsData client or names it", !/_ocd\.js|callOldCarsData|oldcarsdata/i.test(src));
  ok("(7) no request left the fake database during all of the above", ocdCalls === 0, String(ocdCalls));
}
// ---- (8) the watching card
{
  const g = GOOD(), W = world(g);
  W.store.set(TD.STORE_KEY, { v: TD.STORE_V, listingId: g[0].id, field: {}, checkedAt: new Date(NOW0).toISOString() });   // the Tasks example is the first Porsche
  await WD.refreshWatchingDemo(env, W.d); const w = await WD.watchingDemo(env, CREW, W.d);
  ok("(8) shape: { car, checkedAt } and status only when present", w && ["car", "checkedAt"].every(k => k in w) && Object.keys(w).every(k => ["car", "status", "checkedAt"].includes(k)) && JSON.stringify(Object.keys(w.car).sort()) === JSON.stringify(["endsAt", "live", "photo", "platform", "priceLabel", "timeLine", "title", "url"]), JSON.stringify(w && Object.keys(w)));
  ok("(8) a different make from the Tasks example (not a Porsche)", w && !/Porsche/.test(w.car.title), w && w.car.title);
  ok("(8) a Ferrari or a BMW is preferred", w && /Ferrari|BMW/.test(w.car.title), w && w.car.title);
  const W2 = world([g[0], g[1], g[4], g[5]]); W2.store.set(TD.STORE_KEY, { v: TD.STORE_V, listingId: g[0].id, field: {}, checkedAt: new Date(NOW0).toISOString() }); await WD.refreshWatchingDemo(env, W2.d); const w2 = await WD.watchingDemo(env, CREW, W2.d);
  ok("(8) with no Ferrari or BMW, another make that is not the Tasks example's", w2 && !/Porsche/.test(w2.car.title), w2 && w2.car.title);
  const W3 = world([g[0], g[1]]); W3.store.set(TD.STORE_KEY, { v: TD.STORE_V, listingId: g[0].id, field: {}, checkedAt: new Date(NOW0).toISOString() }); await WD.refreshWatchingDemo(env, W3.d);
  ok("(8) only the Tasks example's make left: null", (await WD.watchingDemo(env, CREW, W3.d)) === null);
  const soon = car("Ferrari", "308", 1980, { h: 10 }), later = car("BMW", "2002", 1972, { h: 60 });
  const Ws = world([soon]); await WD.refreshWatchingDemo(env, Ws.d); const ws = await WD.watchingDemo(env, CREW, Ws.d);
  ok("(8) a car ending within 24 hours carries status \"Auction ending soon\" (the reason table's words)", ws && ws.status === RW.reasonLine("demo.ending_soon") && ws.status === "Auction ending soon", JSON.stringify(ws && ws.status));
  const Wl = world([later]); await WD.refreshWatchingDemo(env, Wl.d); const wl = await WD.watchingDemo(env, CREW, Wl.d);
  ok("(8) a car with days left carries no status at all", wl && !("status" in wl), JSON.stringify(wl && Object.keys(wl)));
  const wide = JSON.stringify([w, ws, wl, RW.reasonLine("demo.ending_soon"), RW.reasonLine("demo.time_left", { ms: 3600e3 }), RW.reasonLine("demo.time_left", { ms: 5e6 })]);
  ok("(8) nothing says a reminder, an email or an alert was sent", !/remind|e-?mail|alert|notif|\bsent\b/i.test(wide), wide.slice(0, 120));
  ws.car.endsAt && ok("(8) the card's car is live with a photo and a link", [ws, wl, w].every(x => x.car.live === true && /^https:/.test(x.car.photo) && /^https:/.test(x.car.url)));
  { const Wc = world([...g]); Wc.store.set(TD.STORE_KEY, { v: TD.STORE_V, listingId: g[0].id, field: {}, checkedAt: new Date(NOW0).toISOString() }); await WD.refreshWatchingDemo(env, Wc.d); const wc = await WD.watchingDemo(env, CREW, Wc.d), pickedRow = Wc.rows.find(r => r.url === wc.car.url);
    Wc.store.set(TD.STORE_KEY, { v: TD.STORE_V, listingId: pickedRow.id, field: {}, checkedAt: new Date(NOW0).toISOString() });   // the Tasks example becomes the same make
    ok("(8) the Tasks example changed to the watching card's make since the pick: the card is not served", (await WD.watchingDemo(env, CREW, Wc.d)) === null); }
  { const sooner = car("Audi", "RS6", 2010, { h: 12 }), ferr = car("Ferrari", "360", 2001, { h: 50 }), Wp = world([sooner, ferr]); await WD.refreshWatchingDemo(env, Wp.d); const wp = await WD.watchingDemo(env, CREW, Wp.d);
    ok("(8) a Ferrari ending in two days is chosen over an Audi ending in twelve hours", wp && /Ferrari/.test(wp.car.title), wp && wp.car.title); }
  Ws.rows[0].status = "ended"; ok("(8) a car that ended since the pick is not served", (await WD.watchingDemo(env, CREW, Ws.d)) === null);
}
// ---- (9) shortRequest
{
  const long = { make: "Porsche", model: "911", colour: "white", gearbox: "manual", budget: 250000 };
  ok("(9) the Tasks example's short request: \"A white manual Porsche 911 under $250k\"", RW.reasonLine("tasks.demo_request_short", long) === "A white manual Porsche 911 under $250k", RW.reasonLine("tasks.demo_request_short", long));
  ok("(9) an automatic car with no colour: \"An automatic Audi RS4 under $95k\"", RW.reasonLine("tasks.demo_request_short", { make: "Audi", model: "RS4", gearbox: "auto", budget: 95000 }) === "An automatic Audi RS4 under $95k");
  ok("(9) a million-dollar budget: \"A red Ferrari F430 under $1.2M\"", RW.reasonLine("tasks.demo_request_short", { make: "Ferrari", model: "F430", colour: "red", budget: 1200000 }) === "A red Ferrari F430 under $1.2M");
  const row = car("Porsche", "911", 2019, { colour: "White", bid: 199000 }); row.mileage = 4783; row.location = "Charlotte, NC";
  const geo = await imp("lib/live/geo.js"), facts = S.listingFacts(row), rq = TD.requestFor(row, facts, { listingCoord: geo.listingCoord, placeCoord: geo.placeCoord, milesBetween: geo.milesBetween });
  const f = rq.filters;
  ok("(9) built from the same criteria as the full request: the request's own filters give it", RW.reasonLine("tasks.demo_request_short", { colour: f.colour, gearbox: f.gearbox, make: f.make, model: f.model, budget: f.budget_max }) === "A white manual Porsche 911 under $250k", rq.text);
  const Wt = world([row]), pr = await TD.proveCar(env, row, { ...Wt.d, read: TD.readRequest, geo: async () => ({ listingCoord: geo.listingCoord, placeCoord: geo.placeCoord, milesBetween: geo.milesBetween }), match: async () => [{ r: row }], reasons: async f2 => (await imp("lib/tasks/tasks.js")).matchReasonList(f2) });
  ok("(9) the Tasks example carries shortRequest beside the full request, and neither names a distance or a mileage in the short one", pr.ok && pr.field.shortRequest === "A white manual Porsche 911 under $250k" && pr.field.request.length > pr.field.shortRequest.length && !/mile|within/.test(pr.field.shortRequest), JSON.stringify(pr.ok ? pr.field.shortRequest : pr.why));
}
console.log(`\nliveExamplesCheck: ${failed ? failed + " FAIL" : "PASS"} (${n})`); process.exit(failed ? 1 : 0);
