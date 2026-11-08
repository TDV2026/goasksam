// THE ENTRY PAGE EXAMPLES (Lane B, Nov 8 2026; crew only, not live): marketCheckExampleSales (three real completed sales of ONE model that show the mileage moving the price) and sellExample (one model's observed record by venue from the Sell engine).
//   (1) Market Check: from the engine's pool (the shaped cards), the fewest-miles, the most-miles and the middle sale, in that order, each with a real https photo, a price, a mileage, a venue, a date and a receipt link; a model with 8 or more sales and a clear spread (prices 25 percent apart, mileage twice apart, price falling with mileage) is preferred over 5 or more; never invented: null
//   (2) Sell: sales per venue (3 or more), the typical range only where the engine gave one (8 or more), the engine's sentence and its note, no promise of a price; 8 sales in all and two venues, else the next model, else null
//   (3) both: one pick per Pacific date, the same for every visitor, stored; a new date picks afresh; a failed build keeps the last good pick; crew gate and kill switches; zero OldCarsData; no page types a sentence
//   node scripts/entryExamplesCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), rootArg = args.find(a => !a.startsWith("--")), ROOT = path.resolve(rootArg || path.join(here, ".."));
if (args.includes("--mutants")) {
  const EE = "lib/live/entryExamples.js", RW = "lib/reasonWords.js";
  const muts = [
    [EE, "genuinePhoto(c.image) && isHttps(c.image) && ", "", "(1) a sale with no real photo is shown"],
    [EE, "if (!(await choosePhoto(photoCandidates({ photo_url: c.image }), d.head))) bad.push(c);", "", "(1) a sale whose photo is 3.1 MB or gone is shown"],
    [EE, "&& isHttps(c.url) && /\\S/.test(String(c.title", "&& /\\S/.test(String(c.title", "(1) a sale with no receipt link is shown"],
    [EE, "num(c.mi) > 0 && !c.milesHidden && ", "", "(1) a sale with no mileage is shown"],
    [EE, "const three = [lo, mid, hi], ps", "const three = ok.slice(0, 3), ps", "(1) three sales that do not span the mileage"],
    [EE, "if (!mid || hi.mi < 2 * lo.mi) return null;", "if (!mid) return null;", "(1) mileage not a clear spread"],
    [EE, "if (Math.max(...ps) < 1.25 * Math.min(...ps)) return null;", "", "(1) prices not a clear spread"],
    [EE, "if (!(lo.price > hi.price)) return null;", "", "(1) the high-mileage sale cost more"],
    [EE, "|| mileageCorr(cards) > -0.3) {", ") {", "(1) price does not fall with mileage across the pool"],
    [EE, "for (const pass of [8, 5]) {", "for (const pass of [5]) {", "(1) a model with 8 or more sales is not preferred"],
    [EE, "return { pickDate: dateKey, model: text, poolN, line:", "return { pickDate: dateKey, model: text, poolN: 99, line:", "(1) the pool count is not the engine's"],
    [EE, "price: Math.round(c.price), priceLabel: reasonLine(\"demo.sold_for\", { price: Math.round(c.price) })", "price: Math.round(c.price), priceLabel: reasonLine(\"demo.sold_for\", { price: Math.round(c.price * 1.1) })", "(1) the sold price is not the sale's"],
    [EE, "Number(p.sales) >= 3 && /\\S/.test(String(p.name || \"\"))", "Number(p.sales) >= 1 && /\\S/.test(String(p.name || \"\"))", "(2) a venue with one sale is listed"],
    [EE, "rg = Array.isArray(p.most_sold_between) && p.most_sold_between.length === 2", "rg = true || p.most_sold_between.length === 2", "(2) a range is invented for a venue the engine gave none"],
    [EE, "if (total < 8 || platforms.length < 2) continue;", "if (platforms.length < 1) continue;", "(2) a thin example is shown"],
    [EE, ".slice(0, 4);\n  return places.map", ".slice(0, 9);\n  return places.map", "(2) more than four venues"],
    [RW, "These are sales that happened, not a promise of a price.", "Sell here and you will get this price.", "(2) the note promises a price"],
    [EE, "if (st && st.v === STORE_V && st.data && st.data.pickDate === dateKey) return st.data;", "if (false) return st.data;", "(3) the pick is not stored: every read rebuilds"],
    [EE, "return st && st.v === STORE_V && st.data ? st.data : null;   // a failed build keeps the last good pick; none: null", "return null;", "(3) a failed build loses the last good pick"],
    [EE, "if (process.env[off] === \"0\" || !isCrewRequest(req)) return null;", "if (process.env[off] === \"0\") return null;", "(3) no cookie: the entry examples"],
    [EE, "if (process.env[off] === \"0\" || !isCrewRequest(req)) return null;", "if (!isCrewRequest(req)) return null;", "(3) the kill switch"],
    [EE, "const k = hashOf(salt + \":\" + dateKey) % list.length;", "const k = Math.floor(Math.random() * list.length);", "(3) the model is not the same for every visitor"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eec-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/entryExamplesCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
process.env.CURTAIN_CREW_CODE = "eec-check-secret"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
let metered = 0; globalThis.fetch = async u => { if (/oldcarsdata\.com\/auctions/.test(String(u))) metered++; return new Response("[]", { status: 200 }); };
let failed = 0, n = 0; const ok = (name, c, d) => { n++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const EE = await imp("lib/live/entryExamples.js"), C = await imp("lib/_crew.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const CREW = "gas_crew=" + C.mintCrewCookieValue(), D1 = Date.parse("2026-11-09T20:00:00Z"), D2 = D1 + 864e5;
// the shaped cards the engine's answer carries (price, mi, platformName, date, title, image, url)
let uid = 0;
const card = (miles, price, o = {}) => ({ id: ++uid, title: "2001 BMW M3", price, mi: miles, milesHidden: false, platformName: "Bring a Trailer", platform: "Bring a Trailer", date: "2026-0" + (1 + (uid % 9)) + "-1" + (uid % 9), image: "https://img.test/m" + uid + ".jpg", url: "https://bringatrailer.com/listing/m3-" + uid + "/", ...o });
const pool = (len, o = {}) => Array.from({ length: len }, (_, i) => card(20000 + i * 9000, 52000 - i * 2600, o));
function world(poolsByText, placesByText, now = D1) {
  EE.resetRetryGuard();
  const w = { store: new Map(), clock: now, asked: [], fail: false };
  w.d = { now: () => w.clock, head: async u => (w.heads && u in w.heads ? w.heads[u] : { status: 200, bytes: 1000, type: "image/jpeg" }),
    select: async (e, q) => { const m = /^app_config\?key=eq\.([a-z_]+)/.exec(q); if (m) { const v = w.store.get(m[1]); return v ? [{ value: v }] : []; } return []; },
    write: async (e, row) => { w.store.set(row.key, row.value); },
    answer: async (e, text) => { w.asked.push(text); if (w.fail) throw new Error("down"); const p = poolsByText[text]; return p ? { tier: "result", cards: p } : null; },
    places: async (e, text) => { w.asked.push(text); if (w.fail) throw new Error("down"); return placesByText[text] || null; } };
  return w;
}
const ALL = c => Object.fromEntries(EE.MC_CANDIDATES.map(t => [t, c]));
{ // (1) Market Check
  const W = world(ALL(pool(14))), got = await EE.marketCheckExampleSales(env, CREW, W.d);
  ok("(1) three sales of one model, pickDate set", got && got.sales.length === 3 && got.pickDate === "2026-11-09" && EE.MC_CANDIDATES.includes(got.model), JSON.stringify(got && [got.model, got.sales.length]));
  const s = got.sales;
  ok("(1) from fewest miles to most, the first the fewest and the last the most of the pool", s[0].miles === 20000 && s[2].miles === 20000 + 13 * 9000 && s[0].miles < s[1].miles && s[1].miles < s[2].miles, JSON.stringify(s.map(x => x.miles)));
  ok("(1) the fewest miles sold for more than the most miles (the story)", s[0].price > s[2].price);
  ok("(1) each sale: title, https photo, price and its label, miles and its label, platform, date and its label, receipt url", s.every(x => /\S/.test(x.title) && /^https:\/\/img\.test\//.test(x.photo) && x.price > 0 && /^Sold for \$[\d,]+$/.test(x.priceLabel) && x.miles > 0 && /^[\d,]+ miles$/.test(x.milesLabel) && x.platform === "Bring a Trailer" && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && /^Sold [A-Z][a-z]+ \d{4}$/.test(x.dateLine) && /^https:\/\/bringatrailer\.com\//.test(x.url)), JSON.stringify(s[0]));
  ok("(1) the sold price is the sale's own", s[0].priceLabel === "Sold for $" + s[0].price.toLocaleString("en-US") && s[0].price === 52000);
  ok("(1) the engine's sentence: the count of the pool, the prices and the miles", /^Three of the 14 sales of this model since [A-Z][a-z]+ \d{4} sold for \$[\d,]+ to \$[\d,]+, at [\d,]+ to [\d,]+ miles\.$/.test(got.line) && got.poolN === 14, got.line);
  // bad sales are skipped
  const bad = pool(12); bad[0].image = "https://img.test/placeholder.jpg"; bad[11].url = "http://x.test/a"; bad[5].mi = 0;
  const W2 = world(ALL(bad)), g2 = await EE.marketCheckExampleSales(env, CREW, W2.d);
  ok("(1) a placeholder photo, an http receipt and a sale with no mileage are never shown", g2 && g2.sales.every(x => !/placeholder/.test(x.photo) && /^https:/.test(x.url) && x.miles > 0), JSON.stringify(g2 && g2.sales.map(x => x.miles)));
  // 8 or more preferred over 5
  const mixed = {}; EE.MC_CANDIDATES.forEach((t, i) => { mixed[t] = i === 0 ? pool(6) : i === 1 ? pool(11) : null; });
  const W3 = world(mixed), g3 = await EE.marketCheckExampleSales(env, CREW, W3.d);
  ok("(1) a model with 8 or more sales is preferred over one with 6, whichever the date puts first", g3 && g3.model === EE.MC_CANDIDATES[1] && g3.poolN === 11, JSON.stringify(g3 && [g3.model, g3.poolN]));
  const onlySmall = {}; EE.MC_CANDIDATES.forEach((t, i) => { onlySmall[t] = i === 0 ? pool(6) : null; });
  const g4 = await EE.marketCheckExampleSales(env, CREW, world(onlySmall).d); ok("(1) only a model of 6 sales: shown (5 or more is the floor)", g4 && g4.poolN === 6);
  const tiny = {}; EE.MC_CANDIDATES.forEach(t => { tiny[t] = pool(4); });
  ok("(1) 4 sales: null, nothing invented", (await EE.marketCheckExampleSales(env, CREW, world(tiny).d)) === null);
  const flat = {}; EE.MC_CANDIDATES.forEach(t => { flat[t] = Array.from({ length: 12 }, (_, i) => card(20000 + i * 9000, 40000 + (i % 2) * 500)); });
  ok("(1) no spread in the price: null", (await EE.marketCheckExampleSales(env, CREW, world(flat).d)) === null);
  const up = {}; EE.MC_CANDIDATES.forEach(t => { up[t] = Array.from({ length: 12 }, (_, i) => card(20000 + i * 9000, 30000 + i * 2600)); });
  ok("(1) price rising with mileage (the story does not hold): null", (await EE.marketCheckExampleSales(env, CREW, world(up).d)) === null);
  const tight = {}; EE.MC_CANDIDATES.forEach(t => { tight[t] = Array.from({ length: 12 }, (_, i) => card(20000 + i * 9000, 52000 - i * 100)); });
  ok("(1) price falls with mileage but the three sales are under 25 percent apart: null", (await EE.marketCheckExampleSales(env, CREW, world(tight).d)) === null);
  const inv = {}; EE.MC_CANDIDATES.forEach(t => { inv[t] = Array.from({ length: 30 }, (_, i) => card(20000 + i * 3000, i === 0 ? 20000 : i === 29 ? 62000 : 52000 - i * 1000)); });
  ok("(1) the fewest miles sold for less than the most miles: null", (await EE.marketCheckExampleSales(env, CREW, world(inv).d)) === null);
  const wrongTrend = {}; EE.MC_CANDIDATES.forEach(t => { wrongTrend[t] = Array.from({ length: 12 }, (_, i) => card(20000 + i * 9000, i === 0 ? 70000 : i === 11 ? 25000 : 30000 + i * 2000)); });
  ok("(1) the three extremes tell the story but the pool does not (price rises with mileage): null", EE.mileageCorr(wrongTrend[EE.MC_CANDIDATES[0]]) > -0.3 && (await EE.marketCheckExampleSales(env, CREW, world(wrongTrend).d)) === null, String(EE.mileageCorr(wrongTrend[EE.MC_CANDIDATES[0]])));
  const close = {}; EE.MC_CANDIDATES.forEach(t => { close[t] = Array.from({ length: 12 }, (_, i) => card(50000 + i * 1000, 52000 - i * 2600)); });
  ok("(1) mileage barely apart: null", (await EE.marketCheckExampleSales(env, CREW, world(close).d)) === null);
}
{ // (1) the photo rule: a sale whose photo is 3.1 MB or gone is set aside and the three are chosen again from the rest
  const p = pool(14), W = world(ALL(p)); W.heads = { [p[0].image]: { status: 200, bytes: 3.1 * 1024 * 1024, type: "image/jpeg" }, [p[13].image]: { status: 404, bytes: null, type: "" } };
  const got = await EE.marketCheckExampleSales(env, CREW, W.d);
  ok("(1) the fewest-miles sale has a 3.1 MB photo and the most-miles sale a 404: neither is shown, the next in line are", got && got.sales.length === 3 && got.sales.every(s => s.photo !== p[0].image && s.photo !== p[13].image) && got.sales[0].miles > 20000 && got.sales[2].miles < 20000 + 13 * 9000, JSON.stringify(got && got.sales.map(s => s.miles)));
  const pp = pool(14), W2 = world(ALL(pp)); W2.heads = Object.fromEntries(pp.map(c => [c.image, { status: 200, bytes: 3.1 * 1024 * 1024, type: "image/jpeg" }]));
  ok("(1) every photo too big: no example (null), nothing invented", (await EE.marketCheckExampleSales(env, CREW, W2.d)) === null);
}
{ // (3) the daily pick
  const W = world(ALL(pool(14))), a = await EE.marketCheckExampleSales(env, CREW, W.d), asked = W.asked.length, b = await EE.marketCheckExampleSales(env, CREW, W.d);
  ok("(3) the pick is stored: a second visitor the same day is served it, no new read", JSON.stringify(a) === JSON.stringify(b) && W.asked.length === asked && W.store.has(EE.MC_KEY), asked + " " + W.asked.length);
  const W2 = world(ALL(pool(14))), c = await EE.marketCheckExampleSales(env, CREW, W2.d);
  ok("(3) a fresh instance the same day picks the same model (deterministic, not random)", c.model === a.model && JSON.stringify(c.sales.map(x => [x.miles, x.price])) === JSON.stringify(a.sales.map(x => [x.miles, x.price])));
  W.clock = D2; const next = await EE.marketCheckExampleSales(env, CREW, W.d);
  ok("(3) the next Pacific date picks afresh and stamps the new date", next && next.pickDate === "2026-11-10" && W.store.get(EE.MC_KEY).data.pickDate === "2026-11-10");
  W.clock = D2 + 864e5; W.fail = true; const kept = await EE.marketCheckExampleSales(env, CREW, W.d);
  ok("(3) a failed build keeps the last good pick (stale, never invented)", kept && kept.pickDate === "2026-11-10", JSON.stringify(kept && kept.pickDate));
  const none = await EE.marketCheckExampleSales(env, CREW, { ...world({}).d, answer: async () => { throw new Error("x"); } });
  ok("(3) a failed build and nothing stored: null", none === null);
  ok("(3) crew gate: no cookie, a plain gas_crew=ok, a forged cookie: null", (await EE.marketCheckExampleSales(env, "", W2.d)) === null && (await EE.marketCheckExampleSales(env, "gas_crew=ok", W2.d)) === null && (await EE.marketCheckExampleSales(env, "gas_crew=v1.9999999999.forged", W2.d)) === null);
  process.env.MC_EXAMPLE_SALES = "0"; ok("(3) kill switch MC_EXAMPLE_SALES=0", (await EE.marketCheckExampleSales(env, CREW, W2.d)) === null); delete process.env.MC_EXAMPLE_SALES;
}
{ // (2) Sell
  const place = (name, sales, range, house = false) => ({ slug: name.toLowerCase(), name, house, sales, most_sold_between: range, sold_through: null, last_sale: null });
  const good = { cohort_name: "2008 Porsche 911 Carrera S sales", window_months: 12, window_label: "in the last 12 months", places: [place("Bring a Trailer", 16, [41000, 58000]), place("Cars & Bids", 9, [39000, 52000]), place("Bonhams", 4, null, true), place("PCarMarket", 2, null), place("Mecum", 3, null, true)] };
  const W = world({}, Object.fromEntries(EE.SELL_CANDIDATES.map(t => [t, good]))), got = await EE.sellExample(env, CREW, W.d);
  ok("(2) a venue list: the venues with 3 or more sales, most sales first, up to four", got && got.platforms.length === 4 && got.platforms.map(p => p.name).join() === "Bring a Trailer,Cars & Bids,Bonhams,Mecum" && got.platforms.every(p => p.sales >= 3), JSON.stringify(got && got.platforms.map(p => [p.name, p.sales])));
  ok("(2) each venue: sales and its line, kind, and the typical range only where the engine gave one", got.platforms[0].salesLine === "16 sales" && got.platforms[0].range[0] === 41000 && got.platforms[0].rangeLine === "Typical range $41,000 to $58,000." && got.platforms[2].range === null && got.platforms[2].rangeLine === null && got.platforms[2].kind === "auction house" && got.platforms[0].kind === "auction site", JSON.stringify(got.platforms[2]));
  ok("(2) the engine's sentence and its note (past sales, no promise)", /^34 sales of 2008 Porsche 911 Carrera S sales in the last 12 months, by where they sold\.$/.test(got.line) || /^\d+ sales of .* by where they sold\.$/.test(got.line), got.line);
  ok("(2) the note says sales that happened, not a promise; no guarantee wording anywhere", got.note === "These are sales that happened, not a promise of a price." && !/guarantee|you will get|will sell for|expect/i.test(JSON.stringify(got)), got.note);
  const many = { ...good, places: Array.from({ length: 6 }, (_, i) => place("Venue " + i, 10 - i, null)) }; const gm = await EE.sellExample(env, CREW, world({}, Object.fromEntries(EE.SELL_CANDIDATES.map(t => [t, many]))).d);
  ok("(2) never more than four venues", gm && gm.platforms.length === 4, JSON.stringify(gm && gm.platforms.length));
  const thin = { ...good, places: [place("Bring a Trailer", 4, null), place("Cars & Bids", 3, null)] };
  ok("(2) under 8 sales in all: the next model; none qualifies: null", (await EE.sellExample(env, CREW, world({}, Object.fromEntries(EE.SELL_CANDIDATES.map(t => [t, thin]))).d)) === null);
  const oneV = { ...good, places: [place("Bring a Trailer", 20, [41000, 58000])] };
  ok("(2) one venue only: not an example, null", (await EE.sellExample(env, CREW, world({}, Object.fromEntries(EE.SELL_CANDIDATES.map(t => [t, oneV]))).d)) === null);
  const second = Object.fromEntries(EE.SELL_CANDIDATES.map((t, i) => [t, i === 0 ? thin : good])); const g2 = await EE.sellExample(env, CREW, world({}, second).d);
  ok("(2) a thin model is skipped for the next that qualifies", g2 && g2.platforms.length >= 2);
  const a = await EE.sellExample(env, CREW, W.d), asked = W.asked.length; await EE.sellExample(env, CREW, W.d);
  ok("(3) the Sell pick is stored and served the same all day, one pick per date", JSON.stringify(a) === JSON.stringify(got) && W.asked.length === asked && W.store.has(EE.SELL_KEY));
  ok("(3) crew gate and kill switch: the Sell example", (await EE.sellExample(env, "", W.d)) === null && await (async () => { process.env.SELL_EXAMPLE_FIELD = "0"; const r = await EE.sellExample(env, CREW, W.d); delete process.env.SELL_EXAMPLE_FIELD; return r === null; })());
}
{ // the engine's own words and fields
  const RW = await imp("lib/reasonWords.js");
  for (const id of ["entry.mc_line", "entry.sell_line", "entry.sell_range", "entry.sell_note"]) ok(`(3) reason line ${id} is in the table`, typeof RW.reasonLine(id, { sales: "12 sales", since: "March 2026", lo: 1, hi: 2, pLo: 1, pHi: 2, cohort: "x", window: "in the last 12 months" }) === "string");
  const ob = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8");
  ok("(3) the pool cards carry the fields the example reads: price, mi, platformName, date, title, image, url (shapeCards)", /price: r\._usd, mi: miOf\(r\)/.test(ob) && /platformName: platformName\(platSlug\(r\.source\)\)/.test(ob) && /title: humanTitle\(titleOf\(r\)/.test(ob) && /image: r\.image \|\| null, url: r\.srcurl/.test(ob));
  ok("(3) zero metered OldCarsData", metered === 0, "calls " + metered);
}
console.log("\nentryExamplesCheck: " + (n - failed) + " pass, " + failed + " FAIL"); process.exit(failed ? 1 : 0);
