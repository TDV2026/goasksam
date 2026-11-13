// e99: every reason line a visitor can read comes from lib/reasonWords.js. Fails on a table line that breaks the style, on an engine line that matches no table entry, and on a producer that keeps an e98 sentence of its own.
//   node scripts/reasonWordsCheck.mjs [repo root]
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0, total = 0; const ok = (n, c, d) => { total++; if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href).catch(() => null);
ok("lib/reasonWords.js exists with the table", !!(RW && RW.REASON_TABLE && RW.reasonPatterns));
if (!RW) process.exit(1);
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// 1. style of every table line, with sample parameters
const NUMERIC = new Set(["price", "low", "high", "median", "pLo", "pHi", "pLow", "pHigh", "endsAt", "now"]);   // the figures a line formats as money: the probe carries numbers, so a line is judged on its words and never on a NaN
const probe = new Proxy({}, { get: (_, k) => k === "n" || k === "m" ? "5" : NUMERIC.has(k) ? 5000 : "x" });
const sentences = t => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
// One sentence is the rule. A line that Sam ruled to be two sentences in one field is named here with its count (Oct 29 2026: the range footer, and the trim fallback that says what it read instead);
// the allowance is exact, so a listed line that changes length fails, and a new two-sentence line fails until Sam's ruling is named here.
const TWO_SENTENCES = { "case.decode.ask_ymm": 2, "footer.range": 2, "trim.fallback": 2, "nearband.line": 2, "find.near_band": 2, "card.apart_line": 2, "norange.few_comparable": 2, "norange.few_comparable_house": 2, "case.decode.refuse_length": 2 };   // the two near-VIN refusals (Lane S's wanted wording, Nov 13 2026): what is wrong, then what to do   // the last two (Sam, Nov 5 2026): "9 sales since May 2025. 3 online sales have a photo to compare, too few for a range." - the pool, then what the range test counted; their wording and number are pinned below   // the last two: Sam's own wording for a thin mileage band, Nov 2 2026 ("Few sales under 50,000 miles. Pick a mileage band to see its range.")
// Sam's own sentence (the launch-day ruling, Oct 30 2026): "Sales do not say their engine, so Sam could not filter by V8." names Sam; exact, for this one line
const NAMES_SAM = new Set(["typed.not_carried", "wait.find", "wait.mc", "wait.sell", "wait.sell_slot"]);   // the four waiting sentences (Sam's order, Nov 11 2026: "Sam is checking live auctions and matching your search." is the shape)
for (const [id, e] of Object.entries(RW.REASON_TABLE)) {
  const t = e.text(probe), want = TWO_SENTENCES[id] || 1;
  ok(`${id}: plain, ${want === 1 ? "one sentence" : "the " + want + " sentences Sam ruled"}, no dash, no Sam, no jargon`, !RW.STYLE_BANNED.some(re => re.test(NAMES_SAM.has(id) ? t.replace(/\bSam\b/g, "") : t)) && sentences(t) === want && !/–|—|--/.test(t), t);
}
// 1a. THE ENGINE'S OWN ACTION IS NOT A REASON (Nov 3 2026, lane-b-genline; Find, 1989 Speedster: "The generations of this car sell for about the same, showing every generation"). A line says what is true of the cars,
// the way a person would; it never narrates what the engine did ("showing", "narrowed to", "pooled", "applied"). CLASS: every table line, and every scope line the engine builds for each dimension.
{ const MACHINE = /\b(showing|narrowed to|pooled|pooling|applied)\b/i; const hit = Object.entries(RW.REASON_TABLE).filter(([id, e]) => MACHINE.test(e.text(probe))).map(([id]) => id);
  ok("no table line narrates the engine's own action (showing, narrowed to, pooled, applied)", hit.length === 0, hit.join(" "));
  const dims = ["generation", "edition", "body", "gearbox", "year"]; const scopeIds = ["scope.every", "scope.same_price", "scope.none_kept"];
  const badDim = dims.flatMap(d => scopeIds.map(id => [id, d, RW.reasonLine(id, { dim: d })])).filter(([, , t]) => MACHINE.test(t) || /\b(\w+)s of this car sell/.test(t));
  ok("the scope lines read as a person would for every dimension: 'Every generation of this car sells for about the same, so they're all counted here.'", badDim.length === 0 && RW.reasonLine("scope.same_price", { dim: "generation" }) === "Every generation of this car sells for about the same, so they're all counted here.", badDim.map(x => x[2]).join(" | ")); }
// 1b2. a row stored with a retired scope line reads as the current line (RETIRED_PATTERNS), joined parts included
{ const olds = ["Showing the Coupe as named", "Showing every generation of this car", "The generations of this car sell for about the same, showing every generation", "Only the Coupe has three or more sales of this car, showing Coupe", "No edition of this car has three sales on its own, showing every edition", "No 1974 sales yet, showing 1973", "Too few 2006 sales, showing 2005 to 2007", "The generations of this car sell for about the same, showing every generation; No 1974 sales yet, showing 1971 to 1973"];
  const fresh = olds.map(o => E.freshenStoredText({ tier: "result", scope_reason: o }).scope_reason);
  ok("a stored machine-voice scope line is restated in the table's words at read time", fresh.every(f => !/\bshowing\b/i.test(f)) && fresh[2] === "Every generation of this car sells for about the same, so they're all counted here." && fresh[7] === "Every generation of this car sells for about the same, so they're all counted here. There are no 1974 sales yet, so 1971 to 1973 cars are counted here.", fresh.join(" | ")); }
// 1c. THE NO-RANGE LINES SAY WHAT WAS COUNTED (Nov 5 2026, Sam's condition: the number printed must be exactly what the engine counted and true to the words). The expected line is written HERE from the counted numbers, never read back from the table.
//   few_comparable: the range test counted online sales with a photo, so the line says "N online sales have a photo to compare" and noRangeCloseWhat is online_with_photo.
//   few_comparable_house (house sales counted in a second read): "N are online sales with a photo or house sales", noRangeCloseWhat online_with_photo_or_house.
{ const NRF = E.noRangeFieldsOf || (x => ({ ...x }));   // a tree without the fields fails the lines below instead of crashing
  const thinAns = (total, close, house, reread, w) => ({ tier: "thin", thinReason: "few_comparable", thinLine: "Too few sales of this car to show a range.", thin: { totalN: total, onlineN: close, houseN: house, ...(reread ? { reread } : {}) }, cards: new Array(total).fill({}), rawPool: new Array(total).fill({}), windowWords: w });
  const closeLead = n => n === 0 ? "No online sales have a photo to compare" : n === 1 ? "1 online sale has a photo to compare" : `${n} online sales have a photo to compare`;
  const printed = line => { const m = /\. (No|\d[\d,]*) (?:online sales? (?:has|have)|(?:is|are) )/.exec(String(line || "")); return m ? (m[1] === "No" ? 0 : Number(m[1].replace(/,/g, ""))) : null; };
  for (const [total, close, w] of [[9, 3, "since May 2025"], [9, 1, "since May 2025"], [9, 0, "since May 2025"], [12, 7, "in the last twelve months"], [18, 2, null]]) {
    const d = NRF(thinAns(total, close, 0, null, w)), want = `${total} sales${w ? " " + w : ""}. ${closeLead(close)}, too few for a range.`;
    ok(`few_comparable ${total} sales, ${close} counted: the line is exactly "${want}"`, d.noRangeLine === want && d.noRangeClose === close && d.noRangeTotal === total && d.noRangeCloseWhat === "online_with_photo", JSON.stringify([d.noRangeLine, d.noRangeClose, d.noRangeCloseWhat]));
    ok(`... the printed number (${printed(d.noRangeLine)}) is the counted number (${close})`, printed(d.noRangeLine) === close); }
  { const d = NRF(thinAns(18, 0, 18, { tier: "thin", kind: null, close: 6 }, "since January 2022")), want = "18 sales since January 2022. 6 are online sales with a photo or house sales, too few for a range.";
    ok("few_comparable_house: the line is exactly the words for what was counted", d.noRangeLine === want && d.noRangeClose === 6 && d.noRangeCloseWhat === "online_with_photo_or_house" && printed(d.noRangeLine) === 6, JSON.stringify([d.noRangeLine, d.noRangeCloseWhat])); }
  // the negative control: a line whose printed number is not the counted number FAILS the same test (the check can fail)
  { const d = NRF(thinAns(9, 3, 0, null, "since May 2025")), wrong = d.noRangeLine.replace("3 online sales", "4 online sales");
    ok("a printed number that differs from the counted number is caught (4 printed, 3 counted)", printed(wrong) === 4 && printed(wrong) !== d.noRangeClose && wrong !== d.noRangeLine); }
  // the table lines must hold their numbers and words: the parameters reach the line unchanged
  ok("the table line prints the counted number it is given, and no other", RW.reasonLine("norange.few_comparable", { total: "9 sales", window: "since May 2025", closeLead: closeLead(3) }) === "9 sales since May 2025. 3 online sales have a photo to compare, too few for a range."); }
ok("every named two-sentence line is in the table", Object.keys(TWO_SENTENCES).every(id => RW.REASON_TABLE[id]));
// 1b. no line prints a LIST of years, models or groups as its subject (Oct 30 2026, the 1979 911 Targa Find card: "1982, 1978 and other cars sell for different money ...").
// A reason names the car or the fact, never a list. Static: no template interpolates a list-like parameter. Behaviour: the line the engine serves for a split pool holds none of the options' labels or years, whatever the dimension.
{ const src = fs.readFileSync(path.join(root, "lib/reasonWords.js"), "utf8").split("\n").filter(l => /^\s*"[a-z_.]+":\s*\{ field:/.test(l));
  const bad = src.filter(l => /\bp\.(groups|years|models|trims|names|list|labels)\b|\$\{[^}]*\.join\(/.test(l.replace(/\/\/.*$/, ""))).map(l => l.trim().slice(0, 40));
  ok("no table line interpolates a list of years, models or groups", bad.length === 0, bad.join(" | "));
  const optionSets = { year: ["1982", "1978", "1980", "1975"], gearbox: ["Manual", "Tiptronic", "SMG"], body: ["Coupe", "Cabriolet", "Targa", "Sedan"], trim: ["Carrera", "Carrera S"], mileage: ["Under 50,000 miles", "50,000 to 100,000 miles"], edition: ["Base", "S", "Turbo"] };
  for (const [dim, labels] of Object.entries(optionSets)) {
    const line = E.unsaidLineFor({ headlineDimension: dim, resolvedCar: { year: 1979, make: "Porsche", model: "911", nameModel: "911" }, options: labels.map((label, i) => ({ label, n: 20 - i })) });
    ok(`the split line for ${dim} names the car and lists no options or years`, !labels.some(l => line.includes(l)) && !/\b(19|20)\d\d\b/.test(line) && /^This listing doesn't say which 911 it is, and they sell for different money, so there's no single range\.$/.test(line), line);
  } }
// 2. no producer keeps an e98 sentence of its own
const srcs = ["lib/onebox.js", "lib/live/search.js", "api/sellerDecision.js", "lib/sellsForCard.js"].map(f => [f, fs.readFileSync(path.join(root, f), "utf8")]);
const OLD = ["Sam could not verify", "Sam is reading the sales", "Sam is still reading", "Wide because", "Add yours.", "Pick a year.", "No ${ty} sales in this range", "are left out.`", "Sales too spread out for a range", "so Sam shows no range", "Sales since then are not in yet", "too one-sided", "Not enough sales of this exact car"];
for (const [f, s] of srcs) for (const o of OLD) ok(`${f}: no own sentence "${o}"`, !s.split("\n").some(l => !/^\s*\/\//.test(l) && l.includes(o)));
// 3. the lines an answer carries must be in the table
let rows = [], n = 0;
const sale = (year, date, price, mi, title) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rw" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Datsun", model: "240Z", year, listing_title: title || `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi || 60000), body_style: null, modifications: null, title: title || `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
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
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const pats = RW.reasonPatterns();
const FIELDS = ["thinLine", "wideLine", "yearNote", "windowLine", "chartCaption", "windowNote", "basisLine", "includesFromLine", "latestSaleLine", "optionsNote", "mileageNote", "refusal_line", "samLine", "staleLine", "scope_reason"];
const lineOf = (v, path_) => { const out = []; if (typeof v === "string") out.push([path_, v]); else if (Array.isArray(v)) v.forEach(x => out.push(...lineOf(x, path_))); return out; };
const linesOf = a => { const L = []; const raw = a.raw || a; for (const k of FIELDS) L.push(...lineOf(raw[k], k)); for (const k of ["optionLines", "headlineLines"]) L.push(...lineOf(raw[k], "optionLines")); if (raw.chart) { const c = raw.chart; for (const v of [c.caption, c.note, c.scope && c.scope.line, c.withheld && c.withheld.line]) if (v) L.push(["chart.*", v]); } if (raw.mileageBand && raw.mileageBand.line) L.push(["mileageBand.line", raw.mileageBand.line]); if (raw.thin_sales && raw.thin_sales.reason_line) L.push(["thinLine", raw.thin_sales.reason_line]); return L; };
const inTable = (field, line) => String(line).split(/; |(?<=\.) /).every(part => pats.some(p => (p.field === field || field === "chart.*" || (field === "samLine" && p.field === "refusal_line") || (field === "refusal_line" && p.field === "refusal_line") || (field === "scope_reason" && p.field === "scope_reason")) && p.re.test(part)));
let seen = 0, bad = [];
const scan = async (name, v, text, refine) => { const a = await E.oneEngineAnswer(v, null, text, env, refine || null).catch(e => ({ raw: { err: e.message } })); for (const [f, l] of linesOf(a)) { seen++; if (!inTable(f, l)) bad.push(`${name}: ${f}: ${l}`); } };
const base = { make: "Datsun", model: "240Z", trim: "", year: 1972, bodyStyle: null };
rows = []; for (let i = 0; i < 12; i++) sale(1972, day(10 + i * 20), 30000 + i * 3000, 30000 + i * 9000); await scan("wide by mileage", base, "1972 Datsun 240Z");
await scan("mileage typed", base, "1972 Datsun 240Z", { miTarget: 40000, miMin: 25000, miMax: 55000, miBand: 15000 });
rows = []; for (let i = 0; i < 4; i++) sale(1972, day(10 + i * 20), 30000 + i * 1000); await scan("few sales", base, "1972 Datsun 240Z");
rows = []; for (let i = 0; i < 10; i++) sale(2008 + (i % 2), day(10 + i * 20), 30000 + i * 500); await scan("year note", { ...base, year: 2010 }, "2010 Datsun 240Z");
rows = []; await scan("no sales", base, "1972 Datsun 240Z");
await scan("not a car", { make: "", model: "", trim: "Speedline", year: null, requireYear: true }, "Speedline");
rows = []; for (let i = 0; i < 10; i++) sale(1972, day(10 + i * 10), 30000 + i * 200, 40000, "1972 Datsun 240Z Coupe"); for (let i = 0; i < 10; i++) sale(1972, day(12 + i * 10), 52000 + i * 200, 40000, "1972 Datsun 240Z Convertible"); await scan("split options", base, "1972 Datsun 240Z");
rows = []; for (let q = 0; q < 4; q++) { for (let i = 0; i < 10; i++) sale(1972, day(20 + q * 88 + i * 3), 44000 + i * 600, 40000, "1972 Datsun 240Z Coupe 4-Speed Manual"); for (let i = 0; i < 2 + q * 4; i++) sale(1972, day(22 + q * 88 + i * 4), 30000 + i * 500, 40000, "1972 Datsun 240Z Coupe Automatic"); }
await scan("scoped chart", base, "1972 Datsun 240Z");
rows = []; for (let i = 0; i < 4; i++) sale(1972, day(30 + i * 40), 30000 + i * 1000); await scan("dots chart", base, "1972 Datsun 240Z");
rows = []; for (let i = 0; i < 2; i++) sale(1972, day(30 + i * 40), 30000 + i * 1000); await scan("withheld chart", base, "1972 Datsun 240Z");
ok(`the engine lines carried by ${seen} fields on the fixtures are all in the table`, seen >= 12 && bad.length === 0, bad.slice(0, 5).join(" | "));
// the cold and stale lines
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
ok("the cold line is in the table", pats.some(p => p.id === "cold.reading" && p.re.test(S.stillReadingMarket().line)));

// 4. THE ONE-PLACE LINE IS GONE AS A CLASS (Nov 4 2026, Sam's live find: 1938 Delahaye 135 and 1967 Alfa Romeo GTA printed "These sales come mostly from one place, so no range is shown."). The venue fence was removed from the
// range path on Nov 2 (houseRulesTag), so no answer, stored row or card may carry the fence's reason or either of its sentences. Written as literals so a tree that still has the fence fails.
const FENCE_TEXT = [/mostly from one place/i, /too one-sided/i], FENCE_REASON = "house_share";
{ const rwSrc = fs.readFileSync(path.join(root, "lib/reasonWords.js"), "utf8");
  ok("4a. the reason table has no house_share entry and the thin reasons have none", !("thin.house_share" in RW.REASON_TABLE) && !(RW.THIN_REASON_ID && FENCE_REASON in RW.THIN_REASON_ID) && !E.THIN_LINES[FENCE_REASON]);
  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(x => x.isDirectory() ? (x.name === "node_modules" ? [] : walk(path.join(d, x.name))) : [path.join(d, x.name)]);
  const files = ["lib", "api", "js", "public"].filter(d => fs.existsSync(path.join(root, d))).flatMap(walk).filter(f => /\.(js|mjs|html)$/.test(f) && f !== path.join("lib", "reasonWords.js"));
  const holders = files.filter(f => { const t = fs.readFileSync(path.join(root, f), "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n"); return FENCE_TEXT.some(re => re.test(t)) || /thinReason\s*[:=]\s*"house_share"|return "house_share"/.test(t); });
  ok("4b. no producer in lib, api or the pages holds the fence's sentences or sets its reason", holders.length === 0, holders.join(", "));
  void rwSrc; }
const houseSale = (year, date, price, title) => { sale(year, date, price, null, title); const r = rows[rows.length - 1]; r.platform = "Gooding & Co"; r.source_slug = "gooding"; r.raw_record.featured_image_url = null; };
const carries = a => { const raw = a.raw || a; const found = []; const walk = (v, k) => { if (typeof v === "string") { if (FENCE_TEXT.some(re => re.test(v)) || (/reason/i.test(k) && v === FENCE_REASON)) found.push(k + ": " + v.slice(0, 60)); } else if (Array.isArray(v)) v.forEach(x => walk(x, k)); else if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(vv, kk); }; walk(raw, "root"); return found; };
for (const [name, nHouse, nOnline] of [["six sales, five from the rooms (the 1938 Delahaye 135 shape)", 5, 1], ["twelve sales, all from the rooms (the 1967 GTA shape)", 12, 0], ["nine from the rooms, two online", 9, 2]]) {
  rows = []; for (let i = 0; i < nHouse; i++) houseSale(1972, day(10 + i * 30), 30000 + i * 1500); for (let i = 0; i < nOnline; i++) sale(1972, day(15 + i * 30), 31000 + i * 1500);
  const a = await E.oneEngineAnswer(base, null, "1972 Datsun 240Z", env, null).catch(e => ({ raw: { err: e.message } }));
  ok(`4c. ${name}: no field carries the one-place line or the house_share reason`, carries(a).length === 0, carries(a).join(" | ") + " tier=" + (a.raw && a.raw.tier)); }
{ const rows6 = [0, 1, 2, 3, 4, 5].map(i => ({ id: "r" + i, year: 1972 }));
  const thin6 = { tier: "thin", thinReason: FENCE_REASON, thinLine: "These sales come mostly from one place, so no range is shown.", rawPool: rows6, answerLine: "The sales of this car are too one-sided to mark a range from. These are the sales we found." };
  const f6 = E.freshenStoredText(thin6);
  ok("4d. a stored answer of six sales under the fence reads as the few-sales line, never the one-place line", f6.thinReason === "few_sales" && f6.thinLine === E.THIN_LINES.few_sales && carries(f6).length === 0, JSON.stringify([f6.thinReason, f6.thinLine]));
  const f12 = E.freshenStoredText({ ...thin6, rawPool: Array.from({ length: 12 }, (_, i) => ({ id: "q" + i, year: 1972 })) });
  ok("4e. a stored answer of twelve sales under the fence prints no reason line at all (it is computed again where a reader can)", carries(f12).length === 0 && !f12.thinReason && !f12.thinLine, JSON.stringify([f12.thinReason, f12.thinLine]));
  ok("4f. a stored Find card (core row) under the fence is not served: the core reader takes it as no row", !!RW.carriesFence && RW.carriesFence({ kind: "thin", thinReason: FENCE_REASON }) && RW.carriesFence({ kind: "thin", thinLine: thin6.thinLine }) && !RW.carriesFence({ kind: "thin", thinReason: "few_sales", thinLine: "Too few sales to show a range." }) && /carriesFence\(r\.market\)\) continue/.test(fs.readFileSync(path.join(root, "lib/live/search.js"), "utf8"))); }
// 5. MONEY WORDS, THE ONE DOLLAR FORMATTER (Lane B, Nov 8 2026, on Lane E's export). Cause of the order: previews and Desk files each kept a copy of "$" + Math.round(n).toLocaleString, so a figure could read two ways on two pages.
//    The export is the table's own formatter (the same function), rounds to whole dollars, groups thousands, and the Desk files (lib/desk, lib/deskV3.js, lib/sheetRead.js) define none of their own.
{ const fmt = RW.moneyWords;
  ok("5a. moneyWords prints whole dollars with thousands grouped", typeof fmt === "function" && fmt(1234567.4) === "$1,234,567" && fmt(500) === "$500" && fmt("52000") === "$52,000" && fmt(0) === "$0" && fmt(999.5) === "$1,000");
  ok("5b. a table line prints a figure exactly as moneyWords does", RW.reasonLine("desk3.move", { from: 41250.4, to: 52999.6, q1: "Q1", q2: "Q2", m: "3 sales", n: "4 sales" }).includes(fmt(41250.4) + " in Q1") && RW.reasonLine("desk3.move", { from: 41250.4, to: 52999.6, q1: "Q1", q2: "Q2", m: "3 sales", n: "4 sales" }).includes(fmt(52999.6) + " in Q2"));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + "/" + e.name) : /\.js$/.test(e.name) ? [d + "/" + e.name] : []);
  const DESKFILES = [...walk(path.join(root, "lib/desk")).map(f => path.relative(root, f)), "lib/deskV3.js", "lib/sheetRead.js"].filter(f => fs.existsSync(path.join(root, f)));
  const own = DESKFILES.filter(f => /"\$"\s*\+/.test(fs.readFileSync(path.join(root, f), "utf8").replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "")));
  ok(`5c. no Desk file builds its own dollar string (${DESKFILES.length} read; found in: ${own.join(", ") || "none"})`, own.length === 0);
  const noImport = DESKFILES.filter(f => /\busd\b\s*(=|\()/.test(fs.readFileSync(path.join(root, f), "utf8")) && !/moneyWords/.test(fs.readFileSync(path.join(root, f), "utf8")));
  ok("5d. a Desk file that names a usd formatter takes it from moneyWords", noImport.length === 0, noImport.join(", ")); }
console.log(`reasonWordsCheck: ${total - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
