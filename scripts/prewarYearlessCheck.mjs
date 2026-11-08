// A QUERY WITH NO YEAR IS THE SAME PRE-WAR CAR (Lane B, Nov 6 2026; live "Delahaye 135" in Sam's browser: one pooled list of 22 sales, "Too few sales of this car to show a range", no bodies apart, while "1936 Delahaye 135" showed the bodies apart).
// CAUSE: the pre-war rule asked "is this car before 1949" with the asked year, and with no year it used the pool's NEWEST year; the Delahaye 135 pool runs 1937 to 1949, so the bare query read as post-war and the rule never ran. The same test was written at four
// places (prewarThinApart, pooledApartGuardRead, the question rule's preWarCar, the stored-row recheck storedPrewarBodyOvertaken, which also needed a year, so a stored bare-query row was never rechecked). They now share isPreWarPool (the asked year, else the middle car of the pool).
// THE CLASS: a pre-war car must read the same whether the visitor typed a year or not. This check runs the bare query and the year query for eleven pre-war cars (the five Rick cars and six more) over a pool that runs past 1948 where the car did, and asserts, for each:
//   ENGINE: two or more bodies with sales are an apart answer with no pooled headline (optionsState apart, no cluster, never "Too few sales of this car to show a range" beside bodies), the bare query's bodies and counts are its pool's, and its state and no-range code equal the year query's;
//   PAGE: the real Market Check page in Chrome, fed the engine's answer, prints the engine's lines for every body, the apart sentence, and not the pooled "Too few sales" line beside them (the verifier reads what the page renders, not only the engine).
//   a stored row for a bare query without the current tag is read as no row (storedPrewarBodyOvertaken), and a post-war pool with no year is untouched.
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago), so the verdict does not change with the day
//   node scripts/prewarYearlessCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/onebox.js", " || (row && row._pwPool === true)) && /^(roadster|cabriolet|convertible)$/", ") && /^(roadster|cabriolet|convertible)$/", "the body key follows the row's own year, so a pool across 1949 lists Cabriolet twice"],
    ["lib/onebox.js", "for (const r of chosen.rows) if (r && typeof r === \"object\") r._pwPool = pw;", "", "the pool's era is never marked on its rows"],
    ["lib/onebox.js", "result.rungLabel = loA != null && hiA != null && loA !== hiA ? `${nameplate || spec.make}, ${loA} to ${hiA}` : (nameplate || spec.make);", "result.rungLabel = nameplate || spec.make;", "a query with no year prints no years in its label"],
    ["lib/onebox.js", "else if (!m && p0 !== p1 && /with equivalent (?!\\d{4})/.test(result.resolvedSpec)) result.resolvedSpec =", "else if (false) result.resolvedSpec =", "a query with no year prints no years in its comparing line"],
    ["lib/onebox.js", "if (ys.length) return ys[Math.floor((ys.length - 1) / 2)] < PREWAR_BEFORE;", "if (ys.length) return ys[ys.length - 1] < PREWAR_BEFORE;", "the pool's NEWEST year decides (the live Delahaye bug)"],
    ["lib/onebox.js", "const preWarCar = (vehicle, generation, d) => isPreWarPool({ year: vehicle && vehicle.year, rows: d && d.rawPool, poolYears: d && d.poolYears, genEnd: generation && generation.yearEnd });", "const preWarCar = (vehicle, generation, d) => isPreWarPool({ year: vehicle && vehicle.year, genEnd: generation && generation.yearEnd });", "the body question ignores the pool's years"],
    ["lib/onebox.js", "poolYears: poolYearsOfRows(result.rawPool || []), wideSpread: true", "wideSpread: true", "the wide-spread body question carries no pool years"],
    ["lib/onebox.js", "if (!isPreWarPool({ year: raw.resolvedCar && raw.resolvedCar.year, rows: raw.rawPool, poolYears: raw.poolYears })) return false;", "if (!(Number(raw.resolvedCar && raw.resolvedCar.year) > 0 && Number(raw.resolvedCar.year) < 1949)) return false;", "a stored bare-query row is never rechecked"],
    ["lib/onebox.js", "if (!(d.tier === \"thin\" || d.tier === \"refusal\" ||", "if (!(d.tier === \"thin\" ||", "a pre-war pool that is too spread out never reaches the apart rule"],
    ["lib/onebox.js", "if (d.pooledApart) { code = \"options_apart\"; close = total; closeWhat = \"all\"; }   // bodies shown apart say so first", "if (false) { code = \"options_apart\"; close = total; closeWhat = \"all\"; }   // bodies shown apart say so first", "bodies apart are told it is too spread out"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "prewaryl-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/prewarYearlessCheck.mjs"), dir], { encoding: "utf8", timeout: 590000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const { marketOf } = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (year, body, price, ago) => { n++; const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, HOUSE = globalThis.HOUSE && globalThis.HOUSE(n, body); const title = `${year} ${CAR.make} ${CAR.model} ${body}`; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pb" + n, sale_price: price, sale_date: day(ago), platform: HOUSE ? "Gooding & Co" : "Bring a Trailer", source_slug: HOUSE ? "gooding" : "bringatrailer", make: CAR.make, model: CAR.model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: (HOUSE || (globalThis.NOPHOTO && globalThis.NOPHOTO(n))) ? null : "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
// the cars: [make, model, the year a visitor types, sales as [year, body, price, count]]. The pool of each runs past 1948 where the nameplate did.
const CARS = [
  ["Delahaye", "135", 1936, [[1937, "Cabriolet", 215000, 4], [1938, "Roadster", 2095000, 2], [1938, "Coupe", 330000, 3], [1946, "Cabriolet", 250000, 3], [1949, "Cabriolet", 260000, 5], [1949, "Coupe", 300000, 3], [1947, "", 280000, 2]]],   // 22 sales, 1937 to 1949: the live case
  ["Auburn", "851", 1935, [[1935, "Speedster", 380000, 5], [1935, "Roadster", 120000, 2], [1936, "Convertible", 140000, 4], [1936, "Sedan", 60000, 3]]],
  ["Duesenberg", "Model J", 1931, [[1930, "Roadster", 1400000, 3], [1931, "Phaeton", 1500000, 3], [1932, "Sedan", 600000, 3], [1933, "Coupe", 900000, 3], [1934, "Convertible", 1100000, 2]]],
  ["Packard", "Twelve", 1934, [[1934, "Sedan", 90000, 4], [1935, "Roadster", 210000, 3], [1936, "Phaeton", 260000, 2], [1937, "Coupe", 130000, 3]]],
  ["Bugatti", "Type 57", 1937, [[1937, "Coupe", 4000000, 3], [1938, "Cabriolet", 3500000, 2], [1939, "Roadster", 3800000, 2], [1949, "Coupe", 3900000, 1]]],
  ["Mercedes-Benz", "540K", 1938, [[1936, "Cabriolet", 2100000, 3], [1937, "Roadster", 2900000, 3], [1938, "Coupe", 1700000, 2], [1939, "Sedan", 900000, 2]]],
  ["Cadillac", "V-16", 1930, [[1930, "Roadster", 380000, 3], [1931, "Sedan", 150000, 3], [1932, "Phaeton", 420000, 2]]],
  ["Cord", "812", 1937, [[1937, "Phaeton", 150000, 3], [1937, "Sedan", 70000, 3], [1936, "Cabriolet", 140000, 2]]],
  ["Alfa Romeo", "8C 2900", 1938, [[1937, "Spider", 11000000, 2], [1938, "Coupe", 9000000, 2], [1939, "Berlinetta", 8500000, 1], [1949, "Coupe", 600000, 2]]],
  ["Rolls-Royce", "Phantom III", 1937, [[1936, "Sedan", 110000, 4], [1937, "Convertible", 90000, 3], [1938, "Cabriolet", 260000, 3], [1939, "Coupe", 200000, 2]]],
  ["Bentley", "8 Litre", 1931, [[1931, "Sedan", 100000, 6], [1932, "Coupe", 210000, 6]]],   // two tight ranges far apart
  // post-war controls (the other three of the Rick five): bodies priced alike, so only the pre-war rule could put them apart; it must NOT fire
  ["Rolls-Royce", "Silver Wraith", 1953, [[1950, "Sedan", 70000, 4], [1952, "Cabriolet", 72000, 3], [1955, "Sedan", 69000, 3], [1958, "Cabriolet", 71000, 3]], "post"],
  ["Alfa Romeo", "Giulia GTA", 1966, [[1965, "Coupe", 600000, 4], [1966, "Coupe", 610000, 4], [1967, "Coupe", 620000, 3]], "post"],
  ["Ford", "Mustang V8", 1965, [[1965, "Coupe", 30000, 5], [1965, "Convertible", 30500, 4], [1965, "Fastback", 30200, 3]], "post"],
  ["Ford", "Model 40", 1934, [[1934, "Roadster", 60000, 4], [1934, "Coupe", 40000, 4], [1935, "Phaeton", 70000, 3], [1937, "Sedan", 30000, 3]]]
];
const RICK = new Set(["135", "Twelve", "Silver Wraith", "Giulia GTA", "Mustang V8"]);   // the real five (Sam, Nov 6 2026): only the Packard and the Delahaye are pre-war; the other three are post-war controls that must not trigger the rule
const build = sales => { rows = []; let i = 0; for (const [yr, body, base, cnt] of sales) for (let k = 0; k < cnt; k++) { const before = rows.length; sale(yr, body, base + (k % 4) * 900, 20 + ((i++) % 12) * 9); } };   // every sale inside one window, so a bare and a year query read the same sales
const read = async (make, model, year, sales) => { globalThis.CAR = { make, model }; build(sales); const veh = { year: year || null, make, model }, q = `${year ? year + " " : ""}${make} ${model}`; const gen = year ? await findGeneration({ year, make, model }, env).catch(() => null) : null; return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };
const bodiesIn = sales => { const m = new Map(); for (const [, b, , c] of sales) if (b) m.set(b, (m.get(b) || 0) + c); return m; };
const ANSWERS = [];
for (const [make, model, year, sales, era] of CARS) {
  globalThis.HOUSE = null;
  const bare = await read(make, model, null, sales), asked = await read(make, model, year, sales), tag = `${make} ${model}`;
  const poolBodies = bodiesIn(sales), twoBodies = poolBodies.size >= 2;
  if (era === "post") {   // a post-war control: the pre-war rule must not fire, bare or asked
    const fired = x => !!(x.pooledApart && x.pooledApart.test === "prewar_any_size") || /pw_/.test(JSON.stringify((x.options || []).map(o => o.value)));
    ok(`${tag} (post-war control${RICK.has(model) ? ", Rick" : ""}): the pre-war rule does not fire, bare or with the year`, !fired(bare) && !fired(asked), JSON.stringify([bare.optionsState, (bare.options || []).map(o => o.value), asked.optionsState]));
    continue;
  }
  ANSWERS.push({ tag, rick: RICK.has(model), bare, asked });
  { // THE YEARS A LINE PRINTS ARE THE YEARS OF THE POOL IT COUNTS (Nov 6 2026): the bare Delahaye 135 counts 1937 to 1949 and says so in its label, scope line and comparing line; the year query counts 1937 to 1938 and says that. The two differ because they count different pools; each agrees with its own.
    const yrs = t => (String(t || "").match(/\b(1[89]\d\d|20\d\d)\b/g) || []).map(Number);
    for (const [kind, x] of [["bare", bare], ["asked", asked]]) {
      const [p0, p1] = x.poolYears || [], spec = String(x.resolvedSpec || ""), eq = spec.includes("equivalent") ? spec.slice(spec.indexOf("equivalent")) : "";
      const bad = [["label", x.rungLabel], ["scope line", String(x.scopeLine || "").split("·")[0]], ["comparing line", eq]].filter(([, t]) => { const y = yrs(t); return y.length && (!y.every(v => v === p0 || v === p1) || (p0 !== p1 && !(y.includes(p0) && y.includes(p1)))); }).map(([n, t]) => n + ": " + t);
      const need = p0 !== p1 ? [["label", x.rungLabel], ["comparing line", eq]].filter(([, t]) => !(yrs(t).includes(p0) && yrs(t).includes(p1))).map(([n, t]) => n + " names no years: " + t) : [];
      ok(`${tag} (${kind}): every year printed is the pool's (${p0}${p1 !== p0 ? " to " + p1 : ""}), and a pool of several years says so in the label and the comparing line`, bad.length === 0 && need.length === 0, bad.concat(need).slice(0, 3).join(" || "));
      ok(`${tag} (${kind}): the scope line never says "opens"`, !/\bopens?\b/i.test(String(x.scopeLine || "")) && !/\bopens?\b/i.test(String(x.rungLabel || "")), String(x.scopeLine));
    }
  }
  { // ONE OPTION PER BODY, AND ITS CHIP OPENS ITS ROWS (Nov 6 2026): a pool across 1949 lists Cabriolet once, and the option's own refine opens exactly the sales it counts
    const labs = (bare.options || []).map(o => o.label);
    ok(`${tag}: each body is listed once (${labs.join(", ")})`, new Set(labs).size === labs.length, labs.join(" | "));
    const q = `${make} ${model}`; let bad = [];
    // a THIN pool's option is a count line with its own sales (saleIds): picking it heads the page, it filters nothing (already so before this check); the chip filters where the answer is a result
    for (const o of (bare.tier === "result" ? (bare.options || []) : [])) { if (!o.refine) continue; build(sales); globalThis.CAR = { make, model }; const op = (await E.oneEngineAnswer({ make, model, year: null, raw: q }, null, q, { ...env, asked: 1 }, o.refine)).raw; const n = Number(op && op.poolN) || (Array.isArray(op && op.rawPool) ? op.rawPool.length : 0) || (Array.isArray(op && op.cards) ? op.cards.length : 0); if (n !== o.n) bad.push(`${o.label} counts ${o.n}, opens ${n}`); }
    ok(`${tag}: every option's chip opens exactly the sales it counts`, bad.length === 0, bad.join("; "));
  }
  ok(`${tag}: the bare query shows the bodies apart (${poolBodies.size} bodies in its pool), no pooled headline`, !twoBodies || (bare.optionsState === "apart" && bare.headlineDimension === "body" && !bare.cluster && !(bare.referenceFigure > 0)), JSON.stringify({ tier: bare.tier, state: bare.optionsState, code: bare.noRangeCode, line: bare.noRangeLine, years: bare.poolYears }));
  ok(`${tag}: the bare query never says "Too few sales" beside bodies it could show apart`, !twoBodies || !/Too few sales of this car to show a range/.test(String(bare.noRangeLine || bare.thinLine || "")), String(bare.noRangeLine || bare.thinLine || ""));
  ok(`${tag}: the bare query's bodies and their counts are its own pool's (the options and the body-not-stated sales add up to the pool, one option per body family)`, !twoBodies || ((bare.options || []).reduce((t, o) => t + o.n, 0) + ((bare.bodyNotStated && bare.bodyNotStated.n) || ((bare.bodyOptions || []).find(o => o.value === "unspecified") || {}).n || 0) === (bare.rawPool || []).length && (bare.options || []).length >= 1), JSON.stringify((bare.options || []).map(o => o.label + " " + o.n)) + " pool " + (bare.rawPool || []).length);
  ok(`${tag}: the year query and the bare query are the same kind of answer (state, headline, no-range code)`, !twoBodies || (bare.optionsState === asked.optionsState && bare.headlineDimension === asked.headlineDimension && bare.noRangeCode === asked.noRangeCode), JSON.stringify([bare.optionsState, asked.optionsState, bare.noRangeCode, asked.noRangeCode]));
}
{ // the stored row of a bare query: without the current tag it is read as no row; with it, kept; a post-war pool with no year is untouched
  const old = { tier: "thin", resolvedCar: { year: null }, poolYears: [1937, 1949], rawPool: [{ year: 1937 }, { year: 1938 }, { year: 1938 }, { year: 1946 }, { year: 1949 }], prewarBodyTag: "pwb4-20261105", span: true };
  ok("a stored bare-query row of a pre-war pool written under the old tag is recomputed", E.storedPrewarBodyOvertaken(old) === true);
  ok("the same row with the current tag is kept", E.storedPrewarBodyOvertaken({ ...old, prewarBodyTag: E.PREWAR_BODY_TAG }) === false);
  ok("a stored bare-query row of a post-war pool is untouched", E.storedPrewarBodyOvertaken({ ...old, poolYears: [1955, 1962], rawPool: [{ year: 1955 }, { year: 1958 }, { year: 1962 }] }) === false);
  ok("the pre-war test: the asked year, else the middle of the pool (1948 is pre-war, 1949 is not; a pool 1937 to 1949 with a late tail is)", E.isPreWarPool({ year: 1948 }) && !E.isPreWarPool({ year: 1949 }) && E.isPreWarPool({ rows: [1937, 1938, 1946, 1949, 1949].map(year => ({ year })) }) && !E.isPreWarPool({ rows: [1946, 1949, 1950, 1953].map(year => ({ year })) }) && E.isPreWarPool({ poolYears: [1937, 1949] }) && !E.isPreWarPool({}));
}
// ---- the page: the real Market Check in Chrome, fed each engine answer
{
  process.env.LAUNCH_STAGE = "2";   // the page is served (the launch stage gate), as the other page checks do
  const puppeteer = (await import("puppeteer-core")).default, fs = await import("node:fs");
  process.chdir(ROOT);
  const { default: h } = await import(pathToFileURL(path.join(ROOT, "api/marketCheck.js")).href);
  const html = await new Promise(r => { const res = { setHeader() {}, getHeader() {}, status() { return res; }, send(x) { r(String(x)); return res; }, end(x) { r(String(x || "")); return res; } }; h({ method: "GET", url: "/market-check", query: {}, headers: { host: "goasksam.com", cookie: "" }, socket: {} }, res); });
  const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!fs.existsSync(CHROME)) console.log("SKIP the page in Chrome: no Chrome at " + CHROME);
  else {
    const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
    const render = async (d, query) => {
      const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
      await p.evaluateOnNewDocument(() => { window.gasTrack = () => {}; });
      await p.setRequestInterception(true);
      p.on("request", r => { const u = new URL(r.url());
        if (u.host === "goasksam.com" && r.isNavigationRequest()) return r.respond({ status: 200, contentType: "text/html", body: html });
        const loc = /^\/obx\.[^/]+\/onebox\.js$/.test(u.pathname) ? "public/js/onebox.js" : (/^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname) ? "public/js/" + /^\/js(?:\.[^/]+)?\/([\w.-]+\.js)$/.exec(u.pathname)[1] : null);
        if (u.host === "goasksam.com" && loc && fs.existsSync(loc)) return r.respond({ status: 200, contentType: "application/javascript", body: fs.readFileSync(loc, "utf8") });
        if (u.host === "goasksam.com" && u.pathname === "/api/sellerDecision") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "one_box", ...d }) });
        if (u.host === "goasksam.com" && /^\/api\//.test(u.pathname)) return r.respond({ status: 200, contentType: "application/json", body: "{}" });
        if (u.host !== "goasksam.com") return r.respond({ status: 204, body: "" }); r.continue(); });
      await p.goto("https://goasksam.com/market-check", { waitUntil: "networkidle2" }).catch(() => {});
      await p.type("#ob-input", query); await p.keyboard.press("Enter"); await new Promise(r => setTimeout(r, 1700));
      const t = await p.evaluate(() => (document.querySelector("#ob") || document.body).innerText.replace(/\s+/g, " ")); await p.close(); return t;
    };
    for (const { tag, rick, bare, asked } of ANSWERS) for (const [kind, d, q] of [["bare", bare, tag], ["year", asked, tag]]) {
      if (d.optionsState !== "apart") continue;   // not apart: the engine assertions above already failed it
      const t = await render(d, q), lines = (d.headlineLines || d.optionLines || []).map(l => String(l).replace(/\s+/g, " "));
      ok(`${tag} (${kind}${rick ? ", Rick" : ""}) page: prints the engine's line for every body (${lines.length})`, lines.length > 0 && lines.every(l => t.includes(l)), lines.filter(l => !t.includes(l)).slice(0, 1).join(" | ") + " :: " + t.slice(0, 160));
      ok(`${tag} (${kind}) page: no pooled "Too few sales of this car to show a range" beside the bodies`, !/Too few sales of this car to show a range/.test(t), t.slice(0, 200));
      ok(`${tag} (${kind}) page: prints nothing broken`, t.length > 60 && !/undefined|NaN|\[object/.test(t));
    }
    await b.close();
  }
}
console.log(failed ? `\nprewarYearlessCheck: ${failed} FAIL` : "\nprewarYearlessCheck: PASS"); process.exit(failed ? 1 : 0);
