// e99: every reason line a visitor can read comes from lib/reasonWords.js. Fails on a table line that breaks the style, on an engine line that matches no table entry, and on a producer that keeps an e98 sentence of its own.
//   node scripts/reasonWordsCheck.mjs [repo root]
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const RW = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href).catch(() => null);
ok("lib/reasonWords.js exists with the table", !!(RW && RW.REASON_TABLE && RW.reasonPatterns));
if (!RW) process.exit(1);
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
// 1. style of every table line, with sample parameters
const probe = new Proxy({}, { get: (_, k) => k === "n" || k === "m" ? "5" : "x" });
const sentences = t => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
// One sentence is the rule. A line that Sam ruled to be two sentences in one field is named here with its count (Oct 29 2026: the range footer, and the trim fallback that says what it read instead);
// the allowance is exact, so a listed line that changes length fails, and a new two-sentence line fails until Sam's ruling is named here.
const TWO_SENTENCES = { "footer.range": 2, "trim.fallback": 2 };
// Sam's own sentence (the launch-day ruling, Oct 30 2026): "Sales do not say their engine, so Sam could not filter by V8." names Sam; exact, for this one line
const NAMES_SAM = new Set(["typed.not_carried"]);
for (const [id, e] of Object.entries(RW.REASON_TABLE)) {
  const t = e.text(probe), want = TWO_SENTENCES[id] || 1;
  ok(`${id}: plain, ${want === 1 ? "one sentence" : "the " + want + " sentences Sam ruled"}, no dash, no Sam, no jargon`, !RW.STYLE_BANNED.some(re => re.test(NAMES_SAM.has(id) ? t.replace(/\bSam\b/g, "") : t)) && sentences(t) === want && !/–|—|--/.test(t), t);
}
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
const inTable = (field, line) => String(line).split("; ").every(part => pats.some(p => (p.field === field || field === "chart.*" || (field === "samLine" && p.field === "refusal_line") || (field === "refusal_line" && p.field === "refusal_line") || (field === "scope_reason" && p.field === "scope_reason")) && p.re.test(part)));
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
process.exit(failed ? 1 : 0);
