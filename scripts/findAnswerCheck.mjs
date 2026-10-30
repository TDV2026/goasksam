// e99 (ENGINE READY 10): the Find card answers for the listing's own option: one range, no sale lines, no "pick one", a near-miles headline only at 8 or more sales, never a band the car is not in, never its own mileage.
//   node scripts/findAnswerCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let MAKE="Porsche", MODEL="Boxster";
let rows = [], n = 0;
const sale = (year, date, price, mi, title) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rw" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: MAKE, model: MODEL, year, listing_title: title || `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
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

const car = { make: "Porsche", model: "Boxster", trim: "S", year: 2014, bodyStyle: null };
const stored = async (mk) => { rows = []; mk(); return (await E.oneEngineAnswer(car, null, "2014 Porsche Boxster S", env, null)).raw; };
const MAN = "2014 Porsche Boxster S 6-Speed Manual", PDK = "2014 Porsche Boxster S PDK";
const many = (title, n, base, step, mi) => { for (let i = 0; i < n; i++) sale(2014, day(10 + i * 12), base + i * step, typeof mi === "function" ? mi(i) : (mi || 40000), title); };
const NOW = Date.parse("2026-10-14T12:00:00Z"), IN17H = new Date(NOW + 17 * 36e5 + 600e3).toISOString();   // a live car with 17 hours left (Sam, Oct 29 2026: the bid line always carries the time left)
const fa = (d, title, miles, bid) => E.findAnswerOf ? E.findAnswerOf(d, { title, miles, bid, year: 2014, live: true, endTime: IN17H, now: NOW }) : null;
const BAD = /pick one|\$\d|sold for|\d{4}-\d{2}-\d{2}/i;
const clean = (a, miles) => !!a && a.lines.length <= 2 && !a.lines.some(l => BAD.test(l)) && !(miles && a.lines.join(" ").includes(Number(miles).toLocaleString("en-US"))) && [a.range].filter(Boolean).length <= 1;
ok("findAnswerOf exists", typeof E.findAnswerOf === "function");
// A. split by gearbox, the listing says Manual: the Manual answer, one range, count, bid
let d = await stored(() => { many(MAN, 20, 44000, 300, i => 10000 + i * 8000); many(PDK, 20, 30000, 300, i => 10000 + i * 8000); });
let a = fa(d, MAN, 41234, 38000);
ok("A: a Manual listing gets the Manual answer, one range", a && a.state === "range" && a.option && a.option.label === "Manual" && a.range && a.range.low >= 44000 && a.range.high <= 50000, JSON.stringify(a && { s: a.state, o: a.option, r: a.range, n: a.n }));
ok("A: the count line and the bid line, nothing else", a && /^\d+ sales since .+\.$/.test(a.lines[0]) && a.lines[1] === "The bid is below the range with 17 hours left." && a.lines.length === 2, JSON.stringify(a && a.lines));
ok("A: no sale line, no pick one, not its own mileage", clean(a, 41234));
a = fa(d, PDK, 9000, 40000);
ok("A2: a PDK listing gets the PDK range, bid above", a && a.option.label && /PDK|Auto/.test(a.option.label) && a.range.high <= 40000 && a.bid === "above");
// B. the listing does not say which
a = fa(d, "2014 Porsche Boxster S", 40000, 40000);
ok("B: split and the listing does not say: the plain line, no range, no sales", a && a.state === "split_unsaid" && a.range === null && a.lines.length === 1 && / sell for different money, and this listing does not say which it is, so there is no single range\.$/.test(a.lines[0]) && !/\b(pick|choose)\b/i.test(a.lines[0]), JSON.stringify(a && a.lines));
// C. the option has under 8 sales
d = await stored(() => { many(MAN, 7, 44000, 300); many(PDK, 20, 30000, 300); });
a = fa(d, MAN, 41000, 38000);
ok("C: under 8 sales of the option: the thin line, nothing else (e101: no pointer line)", a && a.state === "few" && a.range === null && a.lines.length === 1 && /^Seven Manual sales, too few for a range\.$/.test(a.lines[0]), JSON.stringify(a && a.lines));
ok("C: clean", clean(a, 41000));
// D. mileage: the listing's own band has 8 or more sales: it is the headline; under 8 nothing about miles
d = await stored(() => { many(MAN, 24, 40000, 400, i => (i < 12 ? 20000 + i * 500 : 90000 + i * 500)); });
a = fa(d, MAN, 23000, 30000);
ok("D: 8 or more sales near its miles: that band is the headline", a && a.state === "range" && a.basis === "band" && /^\d+ sales near its miles\.$/.test(a.lines[0]) && a.n >= 8 && a.n <= 24, JSON.stringify(a && { b: a.basis, l: a.lines, n: a.n }));
ok("D: one range, no figure of its own mileage", clean(a, 23000) && !/23,000/.test(a.lines.join(" ")));
a = fa(d, MAN, 60000, 30000);
ok("D2: under 8 sales near its miles: nothing about miles anywhere", a && a.basis !== "band" && !/miles/.test(a.lines.join(" ")), JSON.stringify(a && a.lines));
// E. the whole class over every answer above: never two ranges, a sale line, pick one, a near line under 8, a band it is not in, its own mileage
const outs = [];
for (const [dd, t, mi, bid] of [[d, MAN, 23000, 30000], [d, MAN, 60000, 31000], [d, MAN, 95000, null], [d, "2014 Porsche Boxster S", 40000, 40000]]) outs.push([fa(dd, t, mi, bid), mi]);
ok("E: across every card, one range at most and only the engine's lines", outs.every(([x, mi]) => !x || clean(x, mi)), JSON.stringify(outs.map(([x]) => x && x.lines)));
ok("E: a near line only with 8 or more sales", outs.every(([x]) => !x || !x.lines.some(l => /near its miles/.test(l)) || x.n >= 8));
// F. the card: samLines prints the engine's lines and nothing of its own
const B = await import(pathToFileURL(path.join(root, "api/buySearch.js")).href);
const lines = B.samLines({ market: { kind: "range", soldLine: "The typical range for X sales: $1 to $2.", findAnswer: a }, timeline: [] });
ok("F: the card's market line is the findAnswer lines", lines[0] && lines[0].text === a.lines.join(" ") && !/typical range/.test(lines[0].text), JSON.stringify(lines[0]));
process.exit(failed ? 1 : 0);
