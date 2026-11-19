import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { findGeneration } from "../lib/generations.js";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
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
const build = year => { rows = []; for (const [body, base, cnt] of (globalThis.SHAPE || [["Roadster", 50000, 9], ["Phaeton", 50150, 9], ["Sedan", 49900, 9]])) for (let i = 0; i < cnt; i++) sale(year, body, base + (i % 5) * 700, 20 + i * 14 + (body === "Sedan" ? 3 : body === "Phaeton" ? 6 : 0)); };
const read = async year => { build(year); const CAR = globalThis.CAR || { make: "Testmake", model: "Roadrunner" }, veh = { year, make: CAR.make, model: CAR.model }, q = `${year} ${CAR.make} ${CAR.model}`; const gen = await findGeneration(veh, env).catch(() => null); return E.withReadFields((await E.oneEngineAnswer({ ...veh, raw: q }, gen, q, { ...env, asked: 0 }, null)).raw, q, veh); };   // as served: the pre-war keys are the engine's, a reader sees the plain word
// THE NO-RANGE CARD SAYS WHY (Lane B, Nov 5 2026, rule tag nr1). THE CLASS: a card that shows a count of sales and no range (Find, the result card, the popup, the sold list, the VIN flow all read the same answer) must carry the two numbers and the reason as plain
// fields from oneEngineAnswer, so no page counts or explains anything. Live, a 1998 911 Carrera 4 Cabriolet card read "9 sales since May 2025" over "Too few for a range": nine sales were in the pool, but a range needs eight ONLINE sales with a photo to compare,
// and three had them. Must hold on every no-range answer:
//  (1) noRangeTotal (sales in the pool), noRangeClose (sales that count toward the range test), noRangeFloor (8), noRangeCode and noRangeLine are all present;
//  (2) few_comparable: total 9, close 3, the line says both ("9 sales since ... 3 online sales have a photo to compare, too few for a range."); few_sales: all are close, the line says too few; options_apart and varied have their own codes;
//  (3) an answer WITH a range, a choice, or no sales carries the fields as null (never a reason beside a range);
//  (4) no dash, no source count, no competitor in any line; (5) a stored no-range row without the tag is read as no row, with it kept, a range row untouched.
//   node scripts/noRangeFieldsCheck.mjs [repo root]      (a tree without the fields fails it)
const noRangeShown = d => { const t = String(d.tier || ""), hasRange = Array.isArray(d.cluster) && d.cluster.length === 2; const sales = (d.cards || []).length || (d.rawPool || []).length; return sales > 0 && (t === "thin" || (t === "refusal" && d.refusal && /^(varied|thin)$/.test(d.refusal.kind)) || (t === "result" && !hasRange)); };
const FIELDS = ["noRangeTotal", "noRangeClose", "noRangeFloor", "noRangeCode", "noRangeLine"];
const sees = (name, d) => ok(`${name}: shows a count and no range, so it carries the numbers and the reason`, !noRangeShown(d) || FIELDS.every(f => (d[f] != null && d[f] !== "") || (f === "noRangeClose" && d.noRangeCode === "no_cluster")),   // no_cluster: the re-read found no result for a reason the engine does not count, so no close number is claimed; the code and the engine's own thin line stay
 JSON.stringify(Object.fromEntries(FIELDS.map(f => [f, d[f]]))));
const SHOWN = [];
// the Carrera 4 Cabriolet case: nine sales, six without a photo (a range needs eight online sales with a photo to compare), three with one
{ globalThis.CAR = { make: "Testmake", model: "Roadrunner" }; globalThis.SHAPE = [["Cabriolet", 60000, 9]]; globalThis.NOPHOTO = n => n <= 6;
  const d = await read(1998); SHOWN.push(["9 sales, 3 online with a photo", d]);
  ok("nine sales, three comparable: a thin card with the reason few_comparable", d.tier === "thin" && d.thinReason === "few_comparable" && d.noRangeCode === "few_comparable", JSON.stringify({ tier: d.tier, reason: d.thinReason, code: d.noRangeCode }));
  ok("... total 9, close 3, floor 8", d.noRangeTotal === 9 && d.noRangeClose === 3 && d.noRangeFloor === 8, JSON.stringify([d.noRangeTotal, d.noRangeClose, d.noRangeFloor]));
  ok("... the line says both numbers and what the second counts (online sales with a photo)", /^9 sales( [a-z]+ [A-Za-z]+ \d{4}| in the last [a-z ]+)?\. 3 online sales have a photo to compare, too few for a range\.$/.test(String(d.noRangeLine || "")), d.noRangeLine);
  { const withPhoto = rows.filter(r => r.raw_record && r.raw_record.featured_image_url && r.source_slug === "bringatrailer").length;
    ok("the number printed is exactly what the engine counted, and what the words say: the fixture's online sales with a photo", d.noRangeClose === withPhoto && d.noRangeCloseWhat === "online_with_photo" && withPhoto === 3, JSON.stringify([d.noRangeClose, d.noRangeCloseWhat, withPhoto])); }
  { const fa = E.findAnswerOf(d, { title: "1998 Testmake Roadrunner Cabriolet", year: 1998 });
    ok("the Find card for it keeps its lines and carries the numbers and the reason beside them", !!fa && fa.state === "few" && Array.isArray(fa.lines) && fa.lines.length >= 1 && !!fa.noRange && fa.noRange.total === 9 && fa.noRange.close === 3 && fa.noRange.code === "few_comparable" && /3 online sales have a photo to compare, too few for a range\.$/.test(String(fa.noRange.line)), JSON.stringify(fa && { lines: fa.lines, noRange: fa.noRange })); } }
globalThis.NOPHOTO = null;
for (const [name, shape, total] of [["five sales", [["Cabriolet", 60000, 5]], 5], ["one sale", [["Cabriolet", 60000, 1]], 1]]) {
  globalThis.SHAPE = shape; const d = await read(1998); SHOWN.push([name, d]);
  ok(`${name}: few_sales, every sale is a close match, the line says too few`, d.noRangeCode === "few_sales" && d.noRangeTotal === total && d.noRangeClose === total && /too few for a range\.$/.test(String(d.noRangeLine || "")) && !/close match/.test(String(d.noRangeLine || "")), JSON.stringify([d.noRangeCode, d.noRangeTotal, d.noRangeClose, d.noRangeLine])); }
{ globalThis.SHAPE = [["Cabriolet", 60000, 12]]; const d = await read(1998);
  ok("twelve online sales: a range, and every no-range field is null (never a reason beside a range)", Array.isArray(d.cluster) && FIELDS.every(f => d[f] == null) && d.noRangeTag === E.NORANGE_TAG && !!E.NORANGE_TAG, JSON.stringify([d.tier, d.cluster, d.noRangeCode])); }
// the pre-war bodies apart (pwb4) and the other no-range states, through the same function the engine stamps with
// a car with house sales is read again with house sales counted; what that read found is the reason (the 1931 Duesenberg Model J: 18 sales, all at houses, none online)
for (const [name, rr, code, close, re] of [
  ["18 house sales, read again, still too spread out", { tier: "refusal", kind: "varied" }, "varied", 18, /^18 sales .*too spread out for a range\.$/],
  ["18 sales, read again with house sales, six counted", { tier: "thin", kind: null, close: 6 }, "few_comparable_house", 6, /^18 sales.*\. 6 are online sales with a photo or house sales, too few for a range\.$/],
  ["18 sales, read again, no result for another reason", { tier: "refusal", kind: "invariant_failed" }, "no_cluster", null, /^Too few sales of this car/]]) {
  const d = (E.noRangeFieldsOf || (x => x))({ tier: "thin", thinReason: "few_comparable", thinLine: "Too few sales of this car to show a range.", thin: { totalN: 18, onlineN: 0, houseN: 18, reread: rr }, cards: new Array(18).fill({}), rawPool: new Array(18).fill({}), windowWords: "since January 2022" }); SHOWN.push([name, d]);
  ok(`${name}: code ${code}, close ${close}, the line is the true reason`, d.noRangeCode === code && d.noRangeClose === close && re.test(String(d.noRangeLine || "")), JSON.stringify([d.noRangeCode, d.noRangeClose, d.noRangeCloseWhat, d.noRangeLine])); }
for (const [name, ans, code] of [
  ["a pre-war pool shown apart by body", { tier: "thin", thinReason: "few_sales", pooledApart: { state: "apart" }, cards: [{}, {}, {}, {}], rawPool: [{}, {}, {}, {}], windowWords: "since May 2025" }, "options_apart"],
  ["a refusal: sold too spread out", { tier: "refusal", refusal: { kind: "varied" }, cards: new Array(11).fill({}), rawPool: new Array(11).fill({}), windowWords: "in the last twelve months" }, "varied"],
  ["a refusal: too few", { tier: "refusal", refusal: { kind: "thin" }, cards: [{}, {}], rawPool: [{}, {}], windowWords: null }, "few_sales"],
  ["a result with a span and no cluster", { tier: "result", cluster: null, span: [1, 2], cards: new Array(6).fill({}), rawPool: new Array(6).fill({}), thinReason: "few_sales" }, "few_sales"]]) {
  const d = (E.noRangeFieldsOf || (x => x))(ans); SHOWN.push([name, d]);
  ok(`${name}: code ${code}, total and close and the line`, d.noRangeCode === code && d.noRangeTotal > 0 && d.noRangeClose > 0 && d.noRangeFloor === 8 && typeof d.noRangeLine === "string" && d.noRangeLine.length > 10, JSON.stringify(Object.fromEntries(FIELDS.map(f => [f, d[f]])))); }
for (const [name, ans] of [["a choice", { tier: "body_choice", cards: [{}] }], ["no sales", { tier: "not_tracked" }], ["a range", { tier: "result", cluster: [1, 2], rawPool: new Array(9).fill({}) }]]) {
  const d = (E.noRangeFieldsOf || (x => x))(ans); ok(`${name}: every no-range field is null`, FIELDS.every(f => d[f] == null) && d.noRangeTag === E.NORANGE_TAG); }
// the class: every answer above that shows a count and no range carries the fields
for (const [name, d] of SHOWN) sees(name, d);
ok("the class check sees at least ten no-range cards", SHOWN.filter(([, d]) => noRangeShown(d)).length >= 10, String(SHOWN.filter(([, d]) => noRangeShown(d)).length));
// copy
{ const lines = SHOWN.map(([, d]) => d.noRangeLine).filter(Boolean);
  ok("no dash, no source name, no AI in any line", lines.length >= 9 && lines.every(l => !/[\u2013\u2014]/.test(l) && !/bring a trailer|cars and bids|bonhams|gooding|rm sotheby|mecum|hagerty|\bAI\b/i.test(l)), JSON.stringify(lines)); }
// the stored rows
{ const o = E.storedNoRangeOvertaken || (() => false), T = E.NORANGE_TAG || "";
  ok("the tag is nr1 or later", /^nr\d+-/.test(T));
  ok("a stored thin row, a stored too-spread-out refusal and a span-no-cluster result without the tag are read as no row", o({ tier: "thin" }) && o({ tier: "refusal", refusal: { kind: "varied" } }) && o({ tier: "result", span: [1, 2], cluster: null }));
  ok("the same rows WITH the tag are kept", !o({ tier: "thin", noRangeTag: T }) && !o({ tier: "refusal", refusal: { kind: "varied" }, noRangeTag: T }));
  ok("a stored row with a range, a choice or no sales is untouched", !o({ tier: "result", cluster: [1, 2] }) && !o({ tier: "body_choice" }) && !o({ tier: "not_tracked" })); }
console.log(failed ? `noRangeFieldsCheck: ${failed} FAIL` : "noRangeFieldsCheck: PASS");
process.exit(failed ? 1 : 0);
