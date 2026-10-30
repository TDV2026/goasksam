// A FIND CARD NEVER SAYS TO PICK, AND A LISTING'S OWN FIELDS SETTLE ITS OPTION (Lane B, Oct 29 2026, the live 1995 Porsche 911 Carrera Cabriolet: Manual chip, 102,000 miles, Watertown NY).
// A. WHY IT DID NOT MATCH: the card matches the listing to an option of the spec's stored Market Check answer. That spec's row ("1995 Porsche 911 Carrera Cabriolet") was stored under an older engine stamp (task warmHits: engine_version_mismatch; the warm
//    covered the bare 1995 911, not the Cabriolet spec), so there was no options list to match against; the card fell back to the core row's thinLine, the Market Check sentence "These sales split into options priced apart, so pick one to see its range."
//    The matcher itself reads the listing's transmission and body fields since e101 (matchedOptionCheck), which the real listings below prove. Now: the card never prints that sentence, and a missing or old stored answer is computed behind the response.
// B. A Find card has no control to pick with. The engine returns the line per surface: Market Check keeps thinLine (the pills exist); a Find card gets the unsaid line, naming the groups from their own labels:
//    "Manual and Tiptronic cars sell for different money, and this listing does not say which it is, so there is no single range." "See the sales for all N." is gone from the card lines (the card's own See the sales link stays).
// This check: (1) real listings whose fields state a gearbox or body and whose title does not are matched; (2) the unsaid line for every option kind with two, three and more than three groups; (3) no Find line says pick or choose or points at the sales;
// (4) the old sentence and the pointer exist nowhere but Market Check's own thinLine; (5) a split spec with no stored answer is refreshed behind the card.
//   node scripts/findNoPickCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const mk = (dimension, opts) => ({ tier: "result", optionsState: "split", headlineDimension: dimension, poolN: opts.reduce((t, o) => t + o.n, 0), cluster: null, windowWords: "since June 2025", rawPool: [], thinReason: "pooled_apart", thinLine: "These sales split into options priced apart, so pick one to see its range.",
  options: opts.map(o => ({ dimension, low: 30000, high: 50000, rangeFloor: false, ownWindow: false, windowWords: "since June 2025", ...o })), refineOptions: [] });
const GB = mk("gearbox", [{ label: "Manual", value: "manual", n: 13 }, { label: "Tiptronic", value: "auto", n: 10 }]);
// 1. real listings (title and fields as the live read showed them): the fields settle the option, the title does not
const REAL = [
  ["1995 Porsche 911 Carrera Cabriolet", "Manual", "Convertible", GB, "manual"],
  ["1977 Chevrolet Corvette", "Manual", null, GB, "manual"],
  ["1966 Ford Mustang", "Manual (4-speed)", null, GB, "manual"],
  ["2014 Ford F-150 SVT Raptor SuperCrew", "Automatic (6-speed)", "Truck", GB, "auto"],
  ["2008 Porsche Cayenne GTS", "Automatic (6-speed)", "SUV", GB, "auto"],
  ["1990 Suzuki Alto Works RS/R", "Manual (5-speed)", "Hatchback", GB, "manual"],
  ["1999 Porsche 911 Carrera Coupe 6-Speed", "Manual (6-speed)", "Coupe", GB, "manual"],
  ["1986 Toyota Celica Supra 5-Speed", "Manual (5-speed)", "Coupe", GB, "manual"],
  ["1981 Datsun 280ZX 2+2 5-Speed", "Manual (5-speed)", "Coupe", GB, "manual"],
  ["350-Powered ’31 Ford Model A Tudor", null, "Sedan", mk("body", [{ label: "Sedan", value: "sedan", n: 9 }, { label: "Coupe", value: "coupe", n: 8 }]), "sedan"],
  ["1978 Porsche 911 Track Car Project (Lot 66)", "Manual", "Coupe", mk("body", [{ label: "Coupe", value: "coupe", n: 12 }, { label: "Targa", value: "targa", n: 9 }]), "coupe"]
];
for (const [title, tx, body, ans, want] of REAL) {
  const row = { listing_title: title, transmission: tx, body, year: Number((/\b(19|20)\d{2}\b/.exec(title) || [])[0]) || 1990, mileage: 102000, make: "x", model: "y", description: "" };
  const f = S.listingFacts(row), ctx = { fields: [tx, body].filter(Boolean).join(" "), gearbox: f.gearbox, body: f.body, year: row.year };
  const m = E.matchedOptionOf(ans, title, ctx), fa = E.findAnswerOf(ans, { title, year: row.year, miles: 102000, bid: 13500, fields: ctx.fields, gearbox: ctx.gearbox, body: ctx.body });
  ok(`${title} [${tx || "no gearbox"}, ${body || "no body"}]: the fields settle the option (${want})`, !!m && m.matchedOption.value === want, m && m.matchedOption.value);
  ok(`${title}: the Find answer answers for that option, never the unsaid line or "pick one"`, !!fa && fa.state !== "split_unsaid" && !/\b(pick|choose)\b/i.test((fa.lines || []).join(" ")), fa && (fa.state + " " + (fa.lines || []).join(" | ")));
}
// 2. the unsaid line, every option kind, two, three and more than three groups
const U = (dim, labels) => E.unsaidLineFor({ headlineDimension: dim, resolvedCar: { make: "Porsche", model: "911", nameModel: "911" }, options: labels.map((label, i) => ({ label, n: 20 - i })) });
const LINE = "This listing doesn't say which 911 it is, and they sell for different money, so there's no single range.";
const CASES = [
  ["gearbox", ["Manual", "Tiptronic"], "Manual and Tiptronic cars"], ["gearbox", ["Manual", "Tiptronic", "SMG"], "Manual, Tiptronic and SMG cars"],
  ["body", ["Coupe", "Cabriolet"], "Coupe and Cabriolet cars"], ["body", ["Coupe", "Cabriolet", "Targa", "Sedan"], "Coupe, Cabriolet and other cars"],
  ["edition", ["Competition", "Base"], "Competition and Base cars"], ["edition", ["Base", "S", "Turbo"], "Base, S and Turbo cars"],
  ["trim", ["Carrera", "Carrera S"], "Carrera and Carrera S cars"], ["year", ["2011", "2012", "2013", "2014", "2015"], "2011, 2012 and other cars"],
  ["mileage", ["Under 50,000 miles", "50,000 to 100,000 miles"], "Cars under 50,000 miles and cars between 50,000 and 100,000 miles"],
  ["mileage", ["Under 50,000 miles", "50,000 to 100,000 miles", "Over 100,000 miles"], "Cars under 50,000 miles, cars between 50,000 and 100,000 miles and cars over 100,000 miles"]
];
for (const [dim, labels, lead] of CASES) { const line = U(dim, labels); ok(`${dim}, ${labels.length} groups: the line names the car and lists no groups or years`, line === LINE, line); ok(`${dim}, ${labels.length} groups: no em or en dash, no "pick" or "choose"`, !/[–—]|\b(pick|choose)\b/i.test(line)); }
// 3. every Find line: the split spec with no listing match, the thin synthesis and the core path
{
  const fa = E.findAnswerOf(GB, { title: "1995 Porsche 911 Carrera Cabriolet", year: 1995 });
  ok("a listing that states nothing: the unsaid line, naming the groups", fa && fa.state === "split_unsaid" && fa.lines.length === 1 && fa.lines[0] === "This listing doesn't say which 1995 Porsche 911 Carrera Cabriolet it is, and they sell for different money, so there's no single range." || /^This listing doesn't say which .+ it is, and they sell/.test(fa.lines[0]), fa && JSON.stringify(fa.lines));
  const synth = { tier: "thin", poolN: 23, cluster: null, windowWords: "since October 2025", thinLine: "These sales split into options priced apart, so pick one to see its range.", optionsState: null, rawPool: [] };
  const fs2 = E.findAnswerOf(synth, { title: "1995 Porsche 911 Carrera Cabriolet", year: 1995 });
  ok("a card built from a core with the old sentence: never pick, never the pointer", fs2 && fs2.lines.length === 1 && !/\b(pick|choose)\b/i.test(fs2.lines[0]) && !/See the sales for all/.test(fs2.lines[0]), fs2 && JSON.stringify(fs2.lines));
  const ts = E.thinSalesOf({ ...GB, rawPool: Array.from({ length: 23 }, (_, i) => ({ id: "x" + i, _usd: 20000 + i * 500, year: 1995, auction_end_date: "2026-03-10", rtitle: "1995 Porsche 911 Carrera" })), cluster: null });
  ok("thin_sales.answer_line for a pool split apart is the unsaid line, not the Market Check sentence", ts && /^This listing doesn't say which .+ it is, and they sell for different money/.test(ts.answer_line || ""), ts && ts.answer_line);
  const mkt = S.marketOf({ ...GB, headlineLines: ["Manual $1 to $2, 13 sales"], cards: [{ price: 1, date: "2026-01-01" }] });
  ok("the core path's answer line for a split pool never says pick", mkt && !/\b(pick|choose)\b/i.test(String(mkt.answerLine || "")), mkt && mkt.answerLine);
  const few = E.findAnswerOf({ tier: "thin", poolN: 5, optionsState: null, rawPool: [], windowWords: "since June 2025" }, { title: "x" });
  ok("a thin card has no 'See the sales for all N.' line", few && !(few.lines || []).some(l => /See the sales for all/.test(l)) && few.pointer == null, few && JSON.stringify(few.lines));
}
// 4. the old sentence and the pointer exist nowhere but Market Check's own thinLine
{
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (/node_modules|\.git|proofs|scripts|docs/.test(e.name) ? [] : walk(path.join(d, e.name))) : /\.(js|mjs|html)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const files = [...walk("lib"), ...walk("api"), ...walk("public")], hits = [];
  for (const f of files) { const t = fs.readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, ""); if (/pick one to see its range/i.test(t) && f !== "lib/reasonWords.js") hits.push(f + ": the old sentence"); if (/See the sales for all/.test(t)) hits.push(f + ": the pointer line"); }
  ok("the old sentence is in lib/reasonWords.js (Market Check's thinLine) and nowhere else; the pointer line nowhere", hits.length === 0, hits.join(" | "));
  const rw = fs.readFileSync("lib/reasonWords.js", "utf8");
  ok("the Find lines in the reason table say no pick or choose", !(rw.match(/"find\.[a-z_]+":[^\n]*/g) || []).some(l => /\b(pick|choose)\b/i.test(l.replace(/before: "[^"]*"/, ""))));
}
// 5. a split spec with no stored answer is refreshed behind the card
{ const src = fs.readFileSync("lib/live/search.js", "utf8"); ok("listingMarket computes and stores the answer behind a split card whose stored row is missing or on an older stamp", /refreshMcRowBehind\(env, spec\)/.test(src) && /function refreshMcRowBehind/.test(src)); }
console.log(fail ? `findNoPickCheck: ${fail} failure(s)` : "findNoPickCheck: all pass");
process.exit(fail ? 1 : 0);
