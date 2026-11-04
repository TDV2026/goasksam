// Pre-war body style check (Lane B, Nov 4 2026, job lane-b-rick point 3, Rick Carey's launch-day feedback). THE CLASS: before 1949 a body style is a different car (a roadster, a phaeton and a sedan of one
// clock: real-ok every date in the fixture is relative to the one now read at the top (days ago, hours ahead), so the verdict does not change with the day (Lane B, Nov 4 2026)
// marque and year price and are collected apart), but the engine made body an apart dimension only when the medians happened to split, so a pre-war answer pooled them into one range. Now: for any car
// before 1949 two or more bodies each holding sales are an APART answer by default, each body with its own range, through the same options/popup as mileage bands; a post-war car is unchanged.
// Must hold on a fixture where the bodies' prices are close (so the old split rule could not fire):
//  (1) 1935: optionsState apart, headlineDimension body, one option per body, each with its own range and count, and no pooled headline;
//  (2) the same sales dated 1965: not apart (the rule is pre-war only);
//  (3) 1948 is pre-war and 1949 is not (the boundary).
//   node scripts/prewarBodyApartCheck.mjs [repo root]
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
  raw_record: { featured_image_url: HOUSE ? null : "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
{ const d = await read(1935), o = d.options || [];
  ok("1935: the answer is apart, by body", d.optionsState === "apart" && d.headlineDimension === "body", JSON.stringify({ state: d.optionsState, dim: d.headlineDimension, tier: d.tier }));
  ok("... one option per body, each with its own sales", o.length === 3 && ["Roadster", "Phaeton", "Sedan"].every(b => o.some(x => x.label === b && x.n === 9)), JSON.stringify(o.map(x => x.label + " " + x.n)));
  ok("... each body has its own range (not the pooled one)", o.length === 3 && o.every(x => x.low > 0 && x.high >= x.low && x.rangeFloor === false), JSON.stringify(o.map(x => [x.label, x.low, x.high])));
  ok("... no engine key (pw_) reaches a label, line or chip a reader sees", !/pw_/i.test(JSON.stringify([o.map(x => x.label), d.optionLines, d.chipLines, d.pickLines, d.headlineLines, (d.refineOptions || []).map(x => x.label)])), JSON.stringify(d.optionLines));
  ok("... the popup is the same option set as mileage bands (the options carry a refine that takes a body)", o.length === 3 && o.every(x => x.refine && x.refine.body), JSON.stringify(o.map(x => x.refine))); }
{ const d = await read(1965);
  ok("1965, the same sales: not apart (post-war cars are unchanged)", d.optionsState !== "apart", String(d.optionsState)); }
{ const a = await read(1948), b = await read(1949);
  ok("1948 is pre-war (apart) and 1949 is not", a.optionsState === "apart" && b.optionsState !== "apart", `1948 ${a.optionsState}, 1949 ${b.optionsState}`); }
// THIN PRE-WAR VOLUMES (lane-b-names3, Nov 5 2026): live, a 1934 Packard Twelve with eight sales over three bodies read as one pooled $83,000 to $121,000, because no body held the eight sales a range needs and the apart answer was turned back to alike.
// Pre-war bodies that hold sales stay apart whatever the counts; each body shows its count, no pooled range, the sales still listed.
for (const shape of [[["Roadster", 50000, 3], ["Phaeton", 50150, 3], ["Sedan", 49900, 2]], [["Roadster", 83000, 4], ["Sedan", 121000, 4]], [["Roadster", 83000, 2], ["Sedan", 100000, 3], ["Phaeton", 90000, 3]]]) {
  globalThis.SHAPE = shape; const d = await read(1934), tag = shape.map(x => x[0][0] + x[2]).join("/");
  ok(`thin ${tag}: apart by body, not one pooled range`, d.optionsState === "apart" && d.headlineDimension === "body" && !d.cluster && !(d.referenceFigure > 0), JSON.stringify({ state: d.optionsState, cluster: d.cluster }));
  ok(`thin ${tag}: every body with a sale is an option with its count, the sales are still listed, no pw_ key`, (d.options || []).length >= 2 && (d.options || []).every(o => o.n >= 1) && shape.every(x => (d.options || []).some(o => o.label === x[0] && o.n === x[2])) && (d.cards || d.rawPool || []).length >= 8 - 2 && !/pw_/i.test(JSON.stringify([d.options.map(o => o.label), d.optionLines, d.chipLines])), JSON.stringify((d.options || []).map(o => o.label + o.n)));
}
globalThis.SHAPE = null;
// THE PACKARD'S REAL BODY MIX (lane-b-prewar2, Nov 5 2026, live 1934 Packard Twelve with the house sales in the pool): sedans hold three or more sales, convertibles and coupes fewer. The guard dropped every body under three sales BEFORE counting
// bodies, so one body was left, no apart group formed, and the page narrowed to the Sedan and retitled the car "1934 Packard Twelve Sedan". For a pre-1949 car the apart rule wins: every body with at least one sale is an option, with its own
// range where it has eight sales and its own count line where it has fewer, the pooled headline and the car's title stay what the visitor typed.
for (const [name, shape] of [["Packard mix 6/2/1", [["Sedan", 90000, 6], ["Convertible", 110000, 2], ["Coupe", 100000, 1]]], ["one body 3+, one body with one sale", [["Sedan", 90000, 7], ["Coupe", 100000, 1]]], ["Sedan 9, Convertible 2", [["Sedan", 90000, 9], ["Convertible", 110000, 2]]]]) {
  globalThis.SHAPE = shape; globalThis.CAR = { make: "Packard", model: "Twelve" }; globalThis.HOUSE = null; const d = await read(1934), o = d.options || [], bodies = shape.map(x => x[0]);
  ok(`${name}: apart by body, not narrowed`, d.optionsState === "apart" && d.headlineDimension === "body", JSON.stringify({ state: d.optionsState, dim: d.headlineDimension, tier: d.tier }));
  ok(`${name}: every body with a sale is an option with its count`, bodies.every(b => o.some(x => x.label === b && x.n === shape.find(s => s[0] === b)[2])), JSON.stringify(o.map(x => x.label + " " + x.n)));
  ok(`${name}: a body under eight sales has no range and says so; no pooled headline`, o.filter(x => x.n < 8).every(x => x.rangeFloor === true && !(x.low > 0)) && !d.cluster, JSON.stringify(o.map(x => [x.label, x.n, x.low, x.rangeFloor])));
  const title = JSON.stringify([d.resolvedCar && d.resolvedCar.canonicalLabel, d.resolvedCar && d.resolvedCar.bodyStyle, d.title, d.carTitle, d.scopeLine, d.appliedLine]);
  ok(`${name}: the title stays what was typed (no body appended), no narrowing applied`, !/Sedan|Convertible|Coupe/.test(String((d.resolvedCar && d.resolvedCar.canonicalLabel) || "")) && !(d.resolvedCar && d.resolvedCar.bodyStyle) && !d.appliedLine, title); }
globalThis.SHAPE = null; globalThis.CAR = null; globalThis.HOUSE = null;

// THE NARROWING PATH (the live page): a body question on a pre-war car resolved by keeping the one body with three or more sales (questionRule, "Only the Sedan has three or more sales of this car"), so the page narrowed to the Sedan and retitled
// the car. The apart rule wins before 1949: the whole car answers, every body with a sale is an option, the title and the scope line are what was typed.
for (const [name, shape] of [["Packard 9/2/1", [["Sedan", 90000, 9], ["Convertible", 110000, 2], ["Coupe", 100000, 1]]], ["Packard 5/2/1 priced apart", [["Sedan", 60000, 5], ["Convertible", 120000, 2], ["Coupe", 90000, 1]]]]) {
  globalThis.SHAPE = shape; globalThis.CAR = { make: "Packard", model: "Twelve" }; build(1934);
  const veh = { year: 1934, make: "Packard", model: "Twelve", raw: "1934 Packard Twelve" }, q = veh.raw, bd = { tier: "body_choice", askIndex: 1, bodyOptions: shape.map(x => x[0]), optionCounts: shape.map(x => x[2]), prompt: "Which body style is it?", resolvedCar: veh };
  const r = await E.questionRule(bd, veh, null, q, { ...env, asked: 1, qelig: "compute" }, null), d = E.withReadFields(E.pooledApartGuard(r, null), q, veh), o = d.options || [];
  ok(`${name}: the question does not narrow a pre-war car (no questionResolved, no kept body)`, !r.questionResolved && !/Only the/i.test(String(d.scope_reason || d.scopeReason || "")), JSON.stringify([r.questionResolved, d.scope_reason]));
  ok(`${name}: shown apart, every body with a sale is an option, the title is what was typed`, d.optionsState === "apart" && shape.every(x => o.some(p => p.label === x[0] && p.n === x[2])) && !/Sedan|Convertible|Coupe/.test(String(d.resolvedCar && d.resolvedCar.canonicalLabel || "")) && !(d.resolvedCar && d.resolvedCar.bodyStyle), JSON.stringify([d.tier, d.optionsState, o.map(p => p.label + p.n)])); }
globalThis.SHAPE = null; globalThis.CAR = null;
// STORED ROWS (the tag): a pre-war answer narrowed to one body by the question, or apart-by-body listing only the bodies with three or more sales, is read as no row until it carries the current tag; a post-war narrowed answer and a tagged row are served.
{ const old = (extra, year = 1934) => ({ tier: "result", resolvedCar: { year, make: "Packard", model: "Twelve" }, prewarBodyTag: "pwb2-20261105", ...extra });
  ok("stored: a 1934 answer narrowed to the Sedan without the current tag is read again", E.storedPrewarBodyOvertaken(old({ questionResolved: { dimension: "body", kept: "Sedan", why: "one_option" } })) === true);
  ok("stored: a 1934 apart-by-body answer from the earlier tag is read again", E.storedPrewarBodyOvertaken(old({ optionsState: "apart", headlineDimension: "body" })) === true);
  ok("stored: the same rows carrying the current tag are served", E.storedPrewarBodyOvertaken({ ...old({ questionResolved: { dimension: "body", kept: "Sedan" } }), prewarBodyTag: E.PREWAR_BODY_TAG }) === false);
  ok("stored: a post-war narrowed answer is untouched", E.storedPrewarBodyOvertaken(old({ questionResolved: { dimension: "body", kept: "Coupe", why: "one_option" } }, 1965)) === false); }
console.log(failed ? `\n${failed} FAILED` : "\nprewarBodyApartCheck: all pass"); process.exit(failed ? 1 : 0);
