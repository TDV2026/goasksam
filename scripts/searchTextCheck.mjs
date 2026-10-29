// STORED SEARCH TEXT (Lane D, Oct 28 2026). No network, no database, no key.
// Sam asked whether every Find, Market Check and Sell search is saved word for word, not only the ones that ended thin, empty or in an error.
// What is true: every search writes a search_run with query_text whatever it ended in, scrubbed at write time (lib/track/privacy.js scrubText).
// CAUSE of the fault this check found: the scrubber caught a VIN, an address and a phone number only in their usual shapes, so a VIN typed in groups
// ("WP0 ZZZ 99Z TS 392124"), an address with spaces around the at sign ("john @ gmail.com") and a seven digit local number ("555-1234") were stored as typed.
// Every text field of every event goes through the same loop in lib/track/log.js buildRow, so the class is: any free text any page or route sends.
//   1. the write path: a corpus of emails, phone numbers and VINs in many shapes goes through buildRow for EVERY event that has a text field; a stored
//      value that still holds one (found by detectors written apart from the scrubber) fails;
//   2. real car texts are kept word for word (the scrubber does not eat a model name or a year);
//   3. the list on the Searches tab: every search counted whatever it ended in, grouped, newest first, at most 200, with the car, and no visitor identity;
//   4. the page at 1440 and 390.
//   node scripts/searchTextCheck.mjs [--shots]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL, fileURLToPath } from "node:url";
process.env.TRACK_STRICT = "1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.argv.includes("--shots");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { buildRow } = await imp("lib/track/log.js");
const { EVENTS } = await imp("lib/track/catalog.js");

// The detectors are written apart from the scrubber on purpose: they ask "could a person read an email, a phone number or a VIN out of this?".
const EMAIL = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9-]+/i;
const PHONE = [/(?:\+?\d{1,3}[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/, /\b\d{3}[-.]\d{4}\b/, /\+\d[\d\s().-]{8,}\d/, /\b\d{7,}\b/, /\b(?:tel|phone|call|cell|mobile)\b[:#.\s-]*\d{3}\s\d{4}\b/i, /\b\d{4,5}[\s-]\d{5,6}\b/];
const VIN = t => { const ok17 = w => w.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/i.test(w) && (w.match(/\d/g) || []).length >= 5 && /[A-HJ-NPR-Z]/i.test(w);
  const tok = String(t).split(/[\s-]+/); if (tok.some(x => /^[A-HJ-NPR-Z0-9]{17,}$/i.test(x) && ok17(x.slice(0, 17)))) return true;
  for (let i = 0; i < tok.length; i++) { let j = "", n = 0; for (let k = i; k < tok.length && /^[A-HJ-NPR-Z0-9]+$/i.test(tok[k]); k++) { j += tok[k]; n++; if (j.length > 17) break; if (n >= 2 && ok17(j)) return true; } }
  return false; };
const leaks = t => { const t0 = String(t || ""), out = []; if (EMAIL.test(t0)) out.push("email"); if (PHONE.some(r => r.test(t0))) out.push("phone"); if (VIN(t0)) out.push("vin"); return out; };

// ---- the detectors themselves: they find what they should and leave real car texts alone
const CARS = ["1995 porsche 911 carrera", "356 1600 super", "1996 porsche 911 carrera 993 3.6 coupe", "porsche 911 gt3 rs 4.0 2011", "ford gt 2005 2006 base 5.4 v8", "mercedes 300sl gullwing 1955", "1969 chevrolet camaro z28 302 4 speed", "ferrari 308 gts quattrovalvole 1984", "bmw e30 m3 evolution 2.5 1990", "1965 shelby cobra 289 csx2000", "2003 bmw alpina roadster v8 11,000 miles", "toyota land cruiser fj40 1978 61,000 miles", "dodge charger r/t 1969 440 magnum", "jaguar e-type series 1 3.8 roadster 1962", "1 of 1 porsche 959 sport 1988", "2005 mercedes-benz 300sl", "1988 mercedes-benz 190e 2.5-16", "1955 mercedes-benz 300 sl gullwing", "1967 mercedes-benz 250sl pagoda", "2002 mercedes-benz sl500 r230", "land rover defender 110 1985 200tdi"];
const LEAKY = {
  email: ["sam@example.com 1995 911", "Sam.O-Brien+x@mail.co.uk", "john @ gmail.com", "john (at) gmail (dot) com", "write to me at a.b@c-d.org about my 911"],
  phone: ["call me 415-555-1234 about the 911", "tel 555-1234", "(415) 555 1234", "+44 20 7946 0958", "4155551234", "415.555.1234", "text 415 555 1234 please", "phone 07911 123456", "0044 7911 123456", "tel 555 1234 911", "chassis 9113600123"],
  vin: ["WP0ZZZ99ZTS392124 porsche", "WP0 ZZZ 99Z TS 392124", "wp0zzz99zts392124", "vin: WBSBL93464PN55322", "1FTEW1EP5JKD12345", "WP0-ZZZ-99Z-TS-392124 here", "my car is 1G1YY22G965123456 a corvette"],
};
for (const [kind, list] of Object.entries(LEAKY)) for (const t of list) ok(leaks(t).length > 0, `the detector sees ${kind} in "${t}"`);
for (const t of CARS) ok(leaks(t).length === 0, `the detector leaves the car text alone: "${t}"`);

// ---- 1. the write path, every event with a text field
const filler = (t, def, k) => Array.isArray(t) ? t[0] : t === "int" ? 1 : t === "num" ? 1 : t === "bool" ? true : t === "path" ? "/x" : t === "key" ? "k" : "x";
const textEvents = Object.entries(EVENTS).filter(([, d]) => Object.values({ ...d.req, ...d.opt }).includes("text"));
ok(textEvents.length >= 6 && textEvents.some(([n]) => n === "search_run"), "the catalog has " + textEvents.length + " events with a free text field, search_run among them (" + textEvents.map(([n]) => n).join(", ") + ")");
const CTX = { product: "market_check", surface: "market_check_page", anon_id: "AAAAAAAAAAAAAAAAAAAAAA", consent: "not_required" };
const all = [...LEAKY.email, ...LEAKY.phone, ...LEAKY.vin];
for (const [name, def] of textEvents) {
  const fields = { ...def.req, ...def.opt }, textKeys = Object.keys(fields).filter(k => fields[k] === "text");
  let bad = [], built = 0;
  for (const t of all) {
    const props = {}; for (const [k, ty] of Object.entries(def.req)) props[k] = ty === "text" ? t : filler(ty, def, k);
    for (const k of textKeys) props[k] = t;
    let row; try { row = buildRow(name, props, { ...CTX, by: def.by[0] }); } catch (e) { bad.push("threw: " + e.message.slice(0, 60)); continue; }
    if (!row) continue; built++;
    for (const k of textKeys) { const l = leaks(row.props[k]); if (l.length) bad.push(`${l.join("+")} left in ${k} for "${t}" -> "${row.props[k]}"`); }
  }
  ok(built > 0 && bad.length === 0, `${name}: no stored text field holds an email, a phone number or a VIN (${built} texts tried)` + (bad.length ? " | " + bad.slice(0, 3).join(" | ") : ""));
}
{ const row = buildRow("search_run", { query_text: "my car WP0 ZZZ 99Z TS 392124", answer_type: "range", latency_ms: 5 }, { ...CTX, by: "server" });
  ok(row && row.vin === "WP0ZZZ99ZTS392124" && !/WP0/.test(row.props.query_text), "a VIN typed in groups moves to its own column (admin only) and is out of the text"); }
for (const t of CARS) { const row = buildRow("search_run", { query_text: t, answer_type: "range", latency_ms: 5 }, { ...CTX, by: "server" }); ok(row && row.props.query_text === t, `a real car text is stored word for word: "${t}"`); }

// ---- every product writes its text whatever the answer ended in (the answer is not a condition of keeping the text)
{ const src = ["api/buySearch.js", "api/sellerDecision.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  ok(/buyRun = props => track\(req, "search_run", \{ query_text: q,/.test(src), "Find: one search_run writer carries the typed text and every outcome goes through it");
  ok(/track\(req, "search_run", \{ query_text: mcText \|\| "-"/.test(src), "Market Check: one search_run writer carries the typed text (mcRun) and every outcome goes through it");
  ok(/track\(req, "search_run", \{ query_text: typeof rawSearch === "string" \? rawSearch/.test(src), "Sell: the search_run carries the typed text (rawSearch)");
  ok(EVENTS.search_run.req.query_text === "text", "query_text is a required text field of search_run: a search cannot be written without its text"); }

// ---- 3. the list
const { groupAsked, askedPanel, ASKED_MAX } = await imp("lib/admin/people.js");
const T0 = Date.parse("2026-10-29T14:00:00Z"), at = i => new Date(T0 - i * 1000).toISOString();
const rows = [
  { ts: at(1), product: "market_check", text: "1987 Porsche 911 Carrera", car: "porsche|911", answer_type: "range" },
  { ts: at(2), product: "market_check", text: "1987 porsche 911 carrera", car: "porsche|911", answer_type: "range" },
  { ts: at(3), product: "buy", text: "Porsche 911 Carrera", car: "porsche|911", answer_type: "range" },
  { ts: at(4), product: "sell", text: "2017 Porsche 911 GTS", car: "porsche|911", answer_type: "range" },
  { ts: at(5), product: "market_check", text: "1965 jaguar e-type", car: "jaguar|e-type", answer_type: "failed" },
  { ts: at(6), product: "market_check", text: "spyker", car: "", answer_type: "zero_result" },
  { ts: at(7), product: "buy", text: "-", car: "", answer_type: "range" },
  { ts: at(8), product: "market_check", text: "1987 porsche 911 carrera", car: "porsche|911", answer_type: "range" },
];
{ const g = groupAsked(rows);
  const one = g.find(x => x.product === "market_check" && /1987/.test(x.text));
  ok(g.length === 5 && one && one.times === 3 && one.text === "1987 Porsche 911 Carrera" && one.car === "porsche 911", "the same text in any case is one line, asked 3 times, newest wording, with its car");
  ok(g.some(x => x.text === "Porsche 911 Carrera" && x.product === "buy") && g.some(x => x.product === "sell"), "the same text under another product is its own line (Find, Market Check and Sell are each listed)");
  ok(g.filter(x => /range/.test(x.outcome)).length >= 3, "searches that got a real answer are in the list, not only the thin, empty and failed ones");
  ok(g.some(x => x.text === "spyker" && x.car === "") && g.some(x => /jaguar/.test(x.text)), "a search that resolved to no car, and one that failed, are listed too");
  ok(!g.some(x => x.text === "-"), "a search with no text is not listed as a text");
  ok(g[0].text === "1987 Porsche 911 Carrera" && g.map(x => x.last).every((v, i, a) => i === 0 || a[i - 1] >= v), "newest first");
  const many = Array.from({ length: 500 }, (_, i) => ({ ts: at(i), product: "buy", text: "car number " + i, car: "x|y", answer_type: "range" }));
  ok(groupAsked(many).length === ASKED_MAX && ASKED_MAX === 200, "at most 200 different texts"); }
{ const urls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async u => { urls.push(String(u)); return { ok: true, status: 200, json: async () => [{ ts: at(1), product: "buy", text: "porsche 911", car: "porsche|911", answer_type: "range" }], text: async () => "[]" }; };
  const r = await askedPanel({ supabaseUrl: "https://x.supabase.co", supabaseKey: "k" }, { from: at(86400), to: at(-1), crew: false, product: "buy" });
  globalThis.fetch = realFetch;
  const u = urls[0] || "";
  ok(/name=eq\.search_run/.test(u) && /is_bot=eq\.false/.test(u) && /internal=eq\.false/.test(u) && /ts=gte\./.test(u) && /product=eq\.buy/.test(u), "the list read is bounded by time, leaves bots and crew out by default, and follows the product filter");
  ok(!/anon_id|user_id|session_id|device_class|geo_|ref_domain|utm_|vin\b|email|person/.test(u.split("select=")[1] || ""), "the list read selects no visitor identity at all (no anon id, account, session, device, place, source or VIN)");
  ok(r.rows.length === 1 && !Object.keys(r.rows[0]).some(k => /anon|user|person|session|email|device|source|state/.test(k)), "the list rows carry text, product, car, count, time and outcome only"); }

// ---- 4. the page
const admin = await imp("api/admin.js");
const g = { h: {}, c: null, b: null, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, send(b) { this.b = b; return this; }, json(b) { this.b = b; return this; }, end() { return this; } };
await admin.default({ method: "GET", query: {}, headers: {} }, g);
ok(g.c === 404 && /askedBlock/.test(g.b), "GET /admin still answers 404 and carries the list");
const puppeteer = (await import(pathToFileURL(path.join(ROOT, "node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).href).catch(() => import("puppeteer-core"))).default;
const asked = { rows: groupAsked(rows), searches_read: 8, capped: false, max: 200 };
const searchesMock = { shown: 1, capped: false, limit: 300, asked, rows: [{ ts: at(1), product: "buy", text: "porsche 911", car: "porsche 911", outcome: "range", seconds: 1.2, cache: "warm", state: "CA", device: "mobile", source: "google.com", person: "AAAAAAAAAAAAAAAAAAAAAA", signed_in: false, anon: "AAAAAAAAAAAAAAAAAAAAAA", crew: false }] };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
if (SHOTS) fs.mkdirSync(path.join(ROOT, "docs/screens/launch"), { recursive: true });
for (const [w, hgt, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) for (const variant of ["list", "unread"]) {
  const page = await b.newPage(); await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on("request", rq => {
    if (rq.url().endsWith("/api/admin") && rq.method() === "POST") { let body = {}; try { body = JSON.parse(rq.postData() || "{}"); } catch {} return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body.part === "searches" ? { ...searchesMock, asked: variant === "list" ? asked : null } : { before_launch: true, range: { key: "today", from: at(0), to: at(0) }, now: {}, held_back: { read: true, today: { hits: 0, visitors: 0, no_id: 0 }, week: { hits: 0, visitors: 0, no_id: 0 }, by_route: [], by_limit: [] }, generatedAt: new Date().toISOString() }) }); }
    if (rq.url().startsWith("http://admin.test/")) return rq.respond({ status: 404, contentType: "text/html; charset=utf-8", body: g.b });
    return rq.abort();
  });
  await page.evaluateOnNewDocument(() => { localStorage.setItem("gas_auth_session", JSON.stringify({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 3000 })); });
  await page.goto("http://admin.test/admin", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("nav button"), { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent === "Searches").click());
  await page.waitForFunction(() => document.querySelector("#sf-go"), { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(() => { const hs = [...document.querySelectorAll("#ad-body h2")].map(x => x.textContent), i = hs.indexOf("What people typed"); const h2 = [...document.querySelectorAll("#ad-body h2")][i];
    const note = h2 && h2.nextElementSibling, wrap = note && note.nextElementSibling; const blockText = [note, wrap && wrap.className === "wrap" ? wrap : null].filter(Boolean).map(x => x.innerText).join(" ");
    return { i, hs, blockText, sw: document.documentElement.scrollWidth, iw: innerWidth, all: document.body.innerText }; });
  ok(r.i >= 0, `${tag} ${variant}: the Searches tab has the "What people typed" section`);
  if (variant === "list") {
    ok(/Times asked/.test(r.blockText) && /Car it resolved to/.test(r.blockText) && /1987 Porsche 911 Carrera/.test(r.blockText) && /porsche 911/.test(r.blockText), `${tag}: the list shows the text, the car and how many times`);
    ok(!/AAAAAAAAAA|google\.com|mobile|\bCA\b/.test(r.blockText), `${tag}: the list shows no visitor id, source, device or place`);
    ok(/spyker/.test(r.blockText) && /not resolved/.test(r.blockText), `${tag}: a search that resolved to no car says so`);
  } else ok(/Not recorded: the list could not be read/.test(r.all), `${tag}: when the list cannot be read it says not recorded, never an empty list`);
  ok(r.sw <= r.iw, `${tag} ${variant}: nothing scrolls sideways (${r.sw} of ${r.iw})`);
  if (SHOTS && variant === "list") await page.screenshot({ path: path.join(ROOT, `docs/screens/launch/searches-typed-${tag}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(hgt * 1.5, 1300) } });
  await page.close();
}
await b.close();
console.log(`searchTextCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
