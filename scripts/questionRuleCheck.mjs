// e94: a question is asked only when it is a real question (Sam, Oct 27 2026). A body, gearbox or edition question needs (a) typed words that do not
// already name the answer and (b) at least two options that each have 3 or more completed sales in the pool THAT OPTION'S OWN ANSWER uses (same
// typed trim, same year walk) and price apart. A dropped option never falls back silently to a wider pool: the answer says what scope it used.
//   1. the 2001 Lamborghini Diablo SE never asks "Roadster or Coupe" (an SE is a coupe; the roadsters in the archive are VTs with no SE);
//   2. a trim-scoped question drops an option whose own pool is another trim, and says so;
//   3. a real question stands, and every option it offers has 3 or more sales;
//   4. the rule itself, over every question this check makes the engine ask: no option under 3 sales, none already named in the typed words.
// No database: a fake archive.   node scripts/questionRuleCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const MR = await import(pathToFileURL(path.join(root, "lib/modelRules.js")).href);
const { oneEngineAnswer, scopeReasonOf } = E;
const QUESTION_FLOOR = E.QUESTION_FLOOR || 3;
process.env.GAS_TEST_NO_QUESTION_RULE = "";
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (make, model, year, title, price, ago, body) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "qr" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(9000 + n * 700), body_style: body, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
// the Diablo: ten 1996 to 1999 VT Roadsters (no SE), eight 2001 VT 6.0 coupes (no SE), one 2001 VT 6.0 SE coupe
for (let i = 0; i < 10; i++) sale("Lamborghini", "Diablo", 1996 + (i % 4), `${1996 + (i % 4)} Lamborghini Diablo VT Roadster`, 280000 + i * 25000, 40 + i * 70, "Roadster");
for (let i = 0; i < 8; i++) sale("Lamborghini", "Diablo", 2001, `2001 Lamborghini Diablo VT 6.0`, 320000 + i * 20000, 30 + i * 80, "Coupe");
sale("Lamborghini", "Diablo", 2001, "13k-Kilometer 2001 Lamborghini Diablo VT 6.0 SE Coupe", 1063000, 1, "Coupe");
// a car with a real body question: six coupes near 20,000 and six convertibles near 40,000, no trim
for (let i = 0; i < 6; i++) sale("Acme", "Zeta", 1972, `1972 Acme Zeta Coupe`, 20000 + i * 300, 20 + i * 40, "Coupe");
for (let i = 0; i < 6; i++) sale("Acme", "Zeta", 1972, `1972 Acme Zeta Convertible`, 70000 + i * 300, 25 + i * 40, "Convertible");
// a trim question where one body's sales are another trim: GT coupes (5), plain convertibles (6)
for (let i = 0; i < 5; i++) sale("Acme", "Omega", 1980, `1980 Acme Omega GT Coupe`, 30000 + i * 300, 20 + i * 40, "Coupe");
for (let i = 0; i < 6; i++) sale("Acme", "Omega", 1980, `1980 Acme Omega Convertible`, 50000 + i * 300, 25 + i * 40, "Convertible");
// gearbox: Theta has 7 manuals and 1 automatic (the automatic option has one sale); Iota has 6 manuals at 20,000 and 6 automatics at 45,000; Kappa 6 and 6 at the same price
const gb = (model, year, n, label, price, ago0) => { for (let i = 0; i < n; i++) sale("Acme", model, year, `${year} Acme ${model} ${label}`, price + i * 150, ago0 + i * 30, "Coupe"); };
gb("Theta", 1985, 7, "5-Speed Manual", 20000, 10); gb("Theta", 1985, 1, "Automatic", 30000, 15);
gb("Iota", 1985, 6, "5-Speed Manual", 20000, 10); gb("Iota", 1985, 6, "Automatic", 45000, 12);
gb("Kappa", 1985, 6, "5-Speed Manual", 20000, 10); gb("Kappa", 1985, 6, "Automatic", 20100, 12);
// generations: Corvette C3 (1968 to 1982) six sales near 20,000; C4 (1984 to 1996) six near 45,000; C5 (1997 to 2004) one sale
for (let i = 0; i < 6; i++) sale("Chevrolet", "Corvette", 1975 + (i % 4), `${1975 + (i % 4)} Chevrolet Corvette Coupe`, 20000 + i * 200, 20 + i * 40, "Coupe");
for (let i = 0; i < 6; i++) sale("Chevrolet", "Corvette", 1990 + (i % 4), `${1990 + (i % 4)} Chevrolet Corvette Coupe`, 45000 + i * 200, 25 + i * 40, "Coupe");
sale("Chevrolet", "Corvette", 2000, "2000 Chevrolet Corvette Coupe", 30000, 50, "Coupe");
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
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };   // the warm computes and stores each question's eligibility
const live = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };   // a visitor: reads the stored decision, never runs the option answers
const asked = [];
const ask = async (v, text) => { const a = (await oneEngineAnswer(v, null, text, env, null)).raw; asked.push({ text, a }); return a; };
const optionsOf = a => (a.bodyOptions || a.gearboxOptions || a.variantOptions || []).map(o => (o && typeof o === "object") ? o.label : o);

// 1. the lock
ok("lock: the edition lock is in car data", typeof MR.editionBodyLock === "function" && MR.editionBodyLock("Lamborghini", "Diablo", "SE") === "coupe" && MR.editionBodyLock("Lamborghini", "Diablo", "SE30") === "coupe" && MR.editionBodyLock("Lamborghini", "Diablo", "VT") === null && MR.editionBodyLock("Lamborghini", "Countach", "SE") === null);
const d1 = await ask({ make: "Lamborghini", model: "Diablo", trim: "SE", year: 2001, bodyStyle: null }, "2001 Lamborghini Diablo SE");
ok("Diablo SE: no body question is asked", d1.tier !== "body_choice", `tier ${d1.tier}`);
ok("Diablo SE: the answer never holds a Roadster sale", !(d1.cards || []).some(c => /roadster/i.test(String(c.title || ""))), (d1.cards || []).map(c => c.title).join(" | "));
// 2. a trim-scoped question drops an option that is another trim
const d2 = await ask({ make: "Acme", model: "Omega", trim: "GT", year: 1980, bodyStyle: null }, "1980 Acme Omega GT");
ok("Omega GT: the Convertible option (no GT sale, six plain convertibles) is never offered", !optionsOf(d2).some(l => /convertible/i.test(l)), `tier ${d2.tier} ${JSON.stringify(optionsOf(d2))}`);
ok("Omega GT: the answer holds only GT sales", (d2.cards || []).every(c => /\bGT\b/.test(String(c.title || ""))), (d2.cards || []).map(c => c.title).join(" | "));
// 3. a real question stands
const d3 = await ask({ make: "Acme", model: "Zeta", trim: "", year: 1972, bodyStyle: null }, "1972 Acme Zeta");
ok("Zeta: a real body question is asked", d3.tier === "body_choice" && optionsOf(d3).length === 2, `tier ${d3.tier}`);
ok("Zeta: every option has 3 or more sales", Array.isArray(d3.optionCounts) && d3.optionCounts.every(c => c >= QUESTION_FLOOR), JSON.stringify(d3.optionCounts));
// the typed words already name the answer
const d4 = await ask({ make: "Acme", model: "Zeta", trim: "", year: 1972, bodyStyle: "convertible" }, "1972 Acme Zeta Convertible");
ok("Zeta Convertible: typed words name the body, no question", d4.tier !== "body_choice", `tier ${d4.tier}`);
// scope reason says what scope was used when an option is dropped
{ const qr = { dimension: "body", kept: "Coupe", dropped: ["Convertible"] };
  const r = scopeReasonOf({ tier: "thin", poolYears: [1980, 1980], rawPool: [], questionResolved: qr }, { year: 1980 });
  ok("scope_reason names the scope used when an option is dropped", /Coupe/.test(String(r)) && !/[–—]/.test(String(r)), String(r)); }
// 5. every dimension runs the full rule (behaviour, on option answers)
const QR = E.questionRule || (async d => d);
const gv = m => ({ make: "Acme", model: m, trim: "", year: 1985, bodyStyle: null });
{ const d = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [7, 1], prompt: "Manual or Automatic?" }, gv("Theta"), null, "1985 Acme Theta", env, null);
  ok("gearbox: an automatic option with one sale is dropped and the manual answers as itself", d.tier !== "gearbox_choice" && d.questionResolved && d.questionResolved.kept === "Manual", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`); }
{ const d = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" }, gv("Iota"), null, "1985 Acme Iota", env, null);
  ok("gearbox: two options with 6 sales each that price apart stay a question", d.tier === "gearbox_choice" && d.questionChecked === true, `tier ${d.tier}`); }
{ const d = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" }, gv("Kappa"), null, "1985 Acme Kappa", env, null);
  ok("gearbox: two options that do not price apart are not asked, the answer says so", d.tier !== "gearbox_choice" && d.questionResolved && d.questionResolved.why === "no_price_split", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`); }
{ const d = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" }, gv("Iota"), null, "1985 Acme Iota Manual", env, null);
  ok("gearbox: the typed words already name the answer, no question", d.tier !== "gearbox_choice" && d.questionResolved && d.questionResolved.why === "typed", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`); }
{ const d = await QR({ tier: "variant_choice", variantKey: "competition", variantOptions: ["Competition Package", "Standard"], optionCounts: [0, 12], prompt: "Competition Package or standard?" }, gv("Iota"), null, "1985 Acme Iota", env, null);
  ok("edition: an edition option with no sales in its own pool is dropped", d.tier !== "variant_choice" && d.questionResolved && d.questionResolved.kept === "Standard", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`); }
{ const gens = [{ label: "C3 (1968-1982)", query: "Chevrolet Corvette C3" }, { label: "C4 (1984-1996)", query: "Chevrolet Corvette C4" }, { label: "C5 (1997-2004)", query: "Chevrolet Corvette C5" }];
  const d = await QR({ tier: "generation_choice", generationOptions: gens, prompt: "Which generation?" }, { make: "Chevrolet", model: "Corvette", trim: "", year: null, bodyStyle: null }, null, "Chevrolet Corvette", env, null);
  ok("generation: the C5 option (one sale) is dropped, C3 and C4 stay", d.tier === "generation_choice" && d.generationOptions.length === 2 && !d.generationOptions.some(o => /C5/.test(o.label)), `tier ${d.tier} ${JSON.stringify((d.generationOptions || []).map(o => o.label))}`);
  ok("generation: every option left has 3 or more sales", Array.isArray(d.optionCounts) && d.optionCounts.every(c => c >= QUESTION_FLOOR), JSON.stringify(d.optionCounts)); }
{ const d = await QR({ tier: "body_choice", bodyOptions: ["Coupe", "Convertible"], optionCounts: [6, 7], prompt: "These sold as Coupe and Convertible, and they price differently. Which one is it?" }, { make: "Acme", model: "Omega", trim: "GT", year: 1980, bodyStyle: null }, null, "1980 Acme Omega GT", env, null);
  ok("body: the Convertible option (no GT sale) is dropped and the Coupe answers as itself", d.tier !== "body_choice" && d.questionResolved && d.questionResolved.kept === "Coupe", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`); }
{ const d = await QR({ tier: "body_choice", bodyOptions: ["Roadster", "Coupe"], optionCounts: [10, 9], prompt: "These sold as Roadster and Coupe, and they price differently. Which one is it?" }, { make: "Lamborghini", model: "Diablo", trim: "SE", year: 2001, bodyStyle: null }, null, "2001 Lamborghini Diablo SE", env, null);
  ok("body: the Diablo SE question (ten VT Roadsters, no SE) is never asked", d.tier !== "body_choice", `tier ${d.tier} ${JSON.stringify(d.questionResolved || null)}`);
  ok("body: and the answer never silently holds the Roadster sales", !(d.cards || []).some(c => /roadster/i.test(String(c.title || ""))), (d.cards || []).map(c => c.title).join(" | ")); }
// 6. the live ask reads the stored decision and does not run the option answers
{ let reads = 0; const f0 = globalThis.fetch; globalThis.fetch = async (u, o) => { reads++; return f0(u, o); };
  reads = 0; const stored = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" }, gv("Iota"), null, "1985 Acme Iota", live, null);
  ok("live: a question with a stored decision is asked from it, with no archive reads", stored.tier === "gearbox_choice" && stored.questionChecked === true && reads <= 1, `tier ${stored.tier}, ${reads} reads`);
  reads = 0; const unstored = await QR({ tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"], optionCounts: [6, 6], prompt: "Manual or Automatic?" }, gv("Kappa2"), null, "1985 Acme Kappa2", live, null);
  ok("live: a question with no stored decision is not asked, the answer says every gearbox", unstored.tier !== "gearbox_choice" && unstored.questionResolved && unstored.questionResolved.why === "unchecked", `tier ${unstored.tier} ${JSON.stringify(unstored.questionResolved || null)}`);
  ok("live: the unchecked answer says what scope it used", /every gearbox/.test(String(scopeReasonOf({ tier: "thin", poolYears: [1985, 1985], rawPool: [], questionResolved: unstored.questionResolved }, { year: 1985 }))));
  globalThis.fetch = f0; }
// 4. the rule over everything asked above
for (const { text, a } of asked) {
  const labels = optionsOf(a); if (!labels.length) continue;
  const counts = a.optionCounts || [];
  ok(`rule: "${text}" asks no option under ${QUESTION_FLOOR} sales`, counts.length === labels.length && counts.every(c => c >= QUESTION_FLOOR), JSON.stringify(counts));
  ok(`rule: "${text}" asks no option the typed words already name`, !labels.some(l => new RegExp("(^|[^a-z0-9])" + String(l).toLowerCase().replace(/[^a-z0-9 ]/g, "") + "([^a-z0-9]|$)", "i").test(text)), JSON.stringify(labels));
}
console.log(failed ? `questionRuleCheck: ${failed} FAIL` : "questionRuleCheck: all PASS");
process.exit(failed ? 1 : 0);
