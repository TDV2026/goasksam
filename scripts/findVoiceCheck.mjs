// clock: real-ok the live rows end relative to the real now in this process; no calendar date is asserted
// FIND SAYS ONE THING (Lane B, Nov 11 2026; Sam's screenshot "Find me a BMW E30 convertible With an updated engine"). The page printed five lines that did not agree: a "Swap" chip nobody typed, "Without 'swap' (1) (1)" (the count twice),
// "Sam didn't use 'updated' or 'engine' in this search" beside the Swap chip those words made, "This listing doesn't say which 3-Series it is..." (a card line) on a page with no card, and "No live matches right now." beside a chip offering one match.
// CAUSES: the unused-words line was built from the typed words against the car alone, never knowing the chat had mapped a phrase to a has word; the offer label already carried its count and the page added it again; the none-live read passed the engine's
// listing sentence through as a page line; the count line of an empty search never read the widening offer counted from the same rows.
// CLASS: every page-level line on Find (the chips, the count line, the unused-words line, the none-live lines, the note) comes from ONE answer and cannot disagree with it. This check runs 20 recorded searches through the real search turn
// (runFilters over a fake live table) and the page's own chip and count code, and asserts for each answer: no doubled count in any chip; no word the unused-words line names appears in any chip or in the phrase a chip was mapped from; a mapped chip
// names its phrase; no sentence about "this listing" on an answer with no card; a zero count agrees with a counted offer (the number is in the line); an answer that drops a mapped word shows the cars it counted.
//   node scripts/findVoiceCheck.mjs [repo root]   (a tree without the fix fails: run it against origin/main); --mutants breaks one rule at a time.
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2"; process.env.OLDCARSDATA_API_KEY = "unused"; process.env.ANTHROPIC_API_KEY = "unused";
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const NOW = Date.now(), DAY = 864e5;
const mk = (i, make, model, year, title, body, gb, color, extra = {}) => ({ id: 500 + i, source: i % 3 ? "bringatrailer" : "carsandbids", source_listing_id: "v" + i, url: "https://auction.test/v/" + i, listing_title: title, make, model, year, vin_norm: null, mileage: 20000 + i * 3000, mileage_unit: "mi", body, transmission: gb, location: "Austin, TX", country: "US", currency: "USD", current_bid: 20000 + i * 1500, current_bid_usd: 20000 + i * 1500, end_time: new Date(NOW + (1 + i) * 3600e3 * 9).toISOString(), photo_url: "https://img.test/v" + i + ".jpg", status: "live", exterior_color: color, description: "", bid_at: new Date(NOW - 3600e3).toISOString(), last_seen: new Date(NOW).toISOString(), first_seen: new Date(NOW - 4 * DAY).toISOString(), ...extra });
const rows = [
  mk(1, "BMW", "3 Series", 1988, "1988 BMW 325i Convertible 5-Speed", "convertible", "Manual", "Black"),
  mk(2, "Porsche", "911", 1987, "1987 Porsche 911 Carrera Coupe", "coupe", "Manual", "Red"), mk(3, "Porsche", "911", 1995, "1995 Porsche 911 Carrera Cabriolet", "cabriolet", "Manual", "Black"),
  mk(4, "Porsche", "911", 2003, "2003 Porsche 911 Carrera 4S", "coupe", "Automatic", "Silver"), mk(5, "Porsche", "911", 2008, "2008 Porsche 911 Carrera S", "coupe", "Manual", "Red"),
  mk(6, "Porsche", "911", 2010, "2010 Porsche 911 GT3 RS", "coupe", "Manual", "White"), mk(7, "Porsche", "911", 2016, "2016 Porsche 911 Carrera GTS", "coupe", "Automatic", "Black"),
  mk(8, "Ford", "Mustang", 1966, "1966 Ford Mustang Fastback", "coupe", "Manual", "Red"), mk(9, "Ford", "Mustang", 1969, "1969 Ford Mustang Mach 1", "coupe", "Automatic", "Black"), mk(10, "Ford", "Mustang", 1990, "1990 Ford Mustang GT 5.0 Convertible", "convertible", "Manual", "Red"),
  mk(11, "Chevrolet", "Corvette", 1967, "1967 Chevrolet Corvette Roadster", "convertible", "Manual", "Blue"), mk(12, "Chevrolet", "Corvette", 2002, "2002 Chevrolet Corvette Z06", "coupe", "Manual", "Yellow"),
  mk(13, "Mazda", "MX-5 Miata", 1994, "1994 Mazda MX-5 Miata Roadster", "convertible", "Manual", "Red"),
  mk(14, "Ford", "Mustang", 1985, "1985 Ford Mustang LS Engine Swap Coupe", "coupe", "Manual", "Black")
];
globalThis.fetch = async (url) => { const u = String(url); if (/api\.anthropic\.com/.test(u)) return new Response("{}", { status: 500 }); return new Response(JSON.stringify(/\/rest\/v1\/live_listings/.test(u) ? rows : []), { status: 200 }); };
const sc = await import(pathToFileURL(path.join(root, "lib/live/samChat.js")).href), { runFilters } = sc, { reasonLine } = await import(pathToFileURL(path.join(root, "lib/reasonWords.js")).href);
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
// the page's own code (api/buy.js CLIENT): the chips, the count line and the offer label, run as the page runs them
const src = fs.readFileSync(path.join(root, "api/buy.js"), "utf8"), i0 = src.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(src.slice(i0, src.indexOf('";\n', i0) + 1));
const line = from => { const a = c.indexOf(from); if (a < 0) throw new Error("missing " + from); return c.slice(a, c.indexOf("\n", a)) + "\n"; };
const block = (from, to) => { const a = c.indexOf(from), b = c.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return c.slice(a, b); };
const env2 = ["  function esc(s)", "  function usd(n)", "  function num(n)", "  function genWord(v)", "  function band(lo, hi, fmt)"].map(line).join("") + block("  function eraWords(", "  function band(") + block("  // STAGE 2: \"{N} live matches\"", "  function headerHtml(");
const page = new Function(env2 + "\nreturn { matchesLine: matchesLine, filterParts: filterParts };")();
// the offer label, as headerHtml builds it for one to two cars (not thin: the label with its count)
const labelSrc = block("    var label = function(w){", "    // STAGE 2 (Sam's Buy redesign"), offerLabel = new Function("thin", "drop", "wider", "num", labelSrc + "\nreturn label;")(false, {}, () => "", n => String(n));
const hasLabelOf = m => (m && m.hasMap && m.hasMap.label) || undefined;
const filtersOf = (p) => ({ make: p.make, model: p.model, generation: p.generation, trim: p.trim, year_min: p.year_min, year_max: p.year_max, colour: p.colour, gearbox: p.gearbox, body: p.body, has: p.has, budget_max: p.budget_max, miles_max: p.miles_max });
// 20 recorded searches: what the buyer typed, and the filters the chat sent for it
const Q = [
  ["Find me a BMW E30 convertible With an updated engine", { make: "BMW", model: "3 Series", year_min: 1982, year_max: 1994, body: "convertible", has: "swap" }],
  ["BMW E30 convertible with a swap", { make: "BMW", model: "3 Series", year_min: 1982, year_max: 1994, body: "convertible", has: "swap" }],
  ["BMW E30 convertible", { make: "BMW", model: "3 Series", year_min: 1982, year_max: 1994, body: "convertible" }],
  ["BMW E30 convertible with a rebuilt motor", { make: "BMW", model: "3 Series", year_min: 1982, year_max: 1994, body: "convertible", has: "swap" }],
  ["Porsche 911 with a rebuilt engine", { make: "Porsche", model: "911", has: "rebuilt" }],
  ["Porsche 911 GT3", { make: "Porsche", model: "911", has: "GT3" }],
  ["Porsche 911 with GT3 in the title", { make: "Porsche", model: "911", has: "GT3" }],
  ["red manual Porsche 911", { make: "Porsche", model: "911", colour: "red", gearbox: "manual" }],
  ["red Porsche 911 with a sunroof", { make: "Porsche", model: "911", colour: "red" }],
  ["Porsche 911 Turbo S", { make: "Porsche", model: "911", has: "Turbo S" }],
  ["Mustang with a built motor", { make: "Ford", model: "Mustang", has: "swap" }],
  ["Mustang with an engine swap", { make: "Ford", model: "Mustang", has: "swap" }],
  ["Mustang convertible with a new engine", { make: "Ford", model: "Mustang", body: "convertible", has: "swap" }],
  ["Mustang GT", { make: "Ford", model: "Mustang", trim: "GT" }],
  ["Corvette Z06", { make: "Chevrolet", model: "Corvette", has: "Z06" }],
  ["Corvette with an updated drivetrain", { make: "Chevrolet", model: "Corvette", has: "swap" }],
  ["Miata with a swapped engine", { make: "Mazda", model: "MX-5 Miata", has: "swap" }],
  ["manual Miata", { make: "Mazda", model: "MX-5 Miata", gearbox: "manual" }],
  ["Porsche 911 Carrera", { make: "Porsche", model: "911", trim: "Carrera" }],
  ["BMW convertible with an upgraded engine", { make: "BMW", body: "convertible", has: "swap" }]
];
const answers = [];
for (const [typed, p] of Q) { const r = await runFilters(env, p, { lastUser: typed }); answers.push({ typed, p, r, m: r.meta || {}, cards: (r.cards || []).length }); }
for (const a of answers) {
  const { typed, m, r } = a, tag = `"${typed}"`, f = filtersOf(a.r.meta && a.r.meta.filters || {}), widen = m.widen || [];
  // the chips the page draws for the filters this answer ran with (its own meta carries none; the answer's state does)
  const used = (r.state && r.state.filters) || a.p, chipFilters = { ...a.p, ...used }; if (m.hasMap && m.hasMap.dropped) delete chipFilters.has;
  const chips = page.filterParts(chipFilters, null, null, hasLabelOf(m)).map(x => x.label), offers = widen.map(w => offerLabel(w));
  // (1) no count twice
  for (const t of [...chips, ...offers]) ok(`(1) ${tag}: "${t}" prints its count once`, !/\(\d[\d,]*\)\s*\(\d[\d,]*\)/.test(t), t);
  // (2) the unused-words line never names a word a chip or its mapped phrase used
  const unusedL = (m.unusedWords || []).map(w => String(w).toLowerCase());
  const chipText = (chips.join(" ") + " " + (m.hasMap ? m.hasMap.from : "")).toLowerCase();
  for (const w of unusedL) ok(`(2) ${tag}: unused word '${w}' is in no chip and no mapped phrase`, !new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "") + "\\b").test(chipText), { chips, from: m.hasMap && m.hasMap.from });
  ok(`(2) ${tag}: the unused-words line names exactly the unused words`, !m.unusedLine || unusedL.every(w => m.unusedLine.toLowerCase().includes("'" + w + "'")), m.unusedLine);
  // (3) a chip mapped from a phrase says so; a has word the buyer did not type and no map names is a chip nobody can account for
  const hasChip = chipFilters.has ? chips.find(x => x.toLowerCase().startsWith(String(chipFilters.has).toLowerCase()) || /engine swap/i.test(x)) : null;
  if (chipFilters.has && !new RegExp("\\b" + String(chipFilters.has).toLowerCase().replace(/[^a-z0-9 ]/g, ""), "i").test(typed)) ok(`(3) ${tag}: the "${chipFilters.has}" chip nobody typed names the phrase it came from`, !!hasChip && /\(from '[^']+'\)/.test(hasChip), chips);
  // (4) a sentence about one listing is never a page line on an answer with no card
  const pageLines = [m.unusedLine, m.note, m.zeroLine, r.reply, ...((m.noneLive && m.noneLive.lines) || [])].filter(Boolean);
  if (!a.cards) for (const l of pageLines) ok(`(4) ${tag}: no card, so no listing sentence ("${String(l).slice(0, 50)}")`, !/\bthis listing\b/i.test(l), l);
  // (5) the count line and the offer agree: none shown, an offer counted from the same rows, the line names that count
  const offer = widen.find(w => w.added > 0);
  const countLine = a.cards ? page.matchesLine(m.live || a.cards, true) : (m.zeroLine || page.matchesLine(0, true, 0));
  if (!a.cards && offer) ok(`(5) ${tag}: "${countLine}" agrees with the offer of ${offer.added}`, new RegExp("\\b" + offer.added + "\\b").test(countLine), { countLine, offers });
  if (a.cards) ok(`(5) ${tag}: ${a.cards} cards, and the count line does not say none`, !/^No live/i.test(countLine), countLine);
  // (6) a mapped word the answer dropped shows the cars it counted, with the line saying what was read and left out
  if (m.hasMap && m.hasMap.dropped) { ok(`(6) ${tag}: the dropped word shows its cars`, a.cards > 0 && a.cards === (m.live || 0), [a.cards, m.live]); ok(`(6) ${tag}: the line says what was read and left out`, /read from '[^']+'/.test(String(m.note || "")) && /without it/.test(String(m.note || "")), m.note); }
}
// (7) the none-live page lines: the engine's listing sentences (the split sentence, for one) never become a page line, and a plain market line stays
{ const unsaid = reasonLine("find.split_unsaid", { car: "3-Series" }), plain = "The typical range for 3-Series sales: $9,000 to $14,000.";
  const kept = typeof sc.pageLinesOf === "function" ? sc.pageLinesOf([unsaid, plain, "This listing is a project car."]) : [unsaid, plain];
  ok("(7) the split-unsaid listing sentence is no page line", !kept.includes(unsaid), kept); ok("(7) a sentence about 'this listing' is no page line", !kept.some(l => /this listing/i.test(l)), kept); ok("(7) the market line a page may print stays", kept.includes(plain), kept); }
// the report itself, said plainly
{ const a = answers[0], m = a.m;
  ok("report: 'updated engine' maps to the engine swap chip, naming the phrase", m.hasMap && m.hasMap.word === "swap" && m.hasMap.from === "updated engine" && m.hasMap.label === "Engine swap (from 'updated engine')", m.hasMap);
  ok("report: the page says nothing about 'updated' or 'engine' being unused", !m.unusedLine && !(m.unusedWords || []).length, [m.unusedLine, m.unusedWords]);
  ok("report: the one car without the swap is shown with the line that says so", a.cards === 1 && /read from 'updated engine'/.test(m.note || ""), [a.cards, m.note]); }
// ---- lane-b-find-paths (Nov 11 2026): three defects from Lane C's live run of the same search ----
// (8) BOTH ANSWERS, ONE PHRASE MAPPING. The page's no-model search (the written answer paused or failed) used to drop "updated engine" silently: no chip, no phrase, "updated" and "engine" unused. Now it asks for the search of the typed words
// (filtersFromText, then runFilters with the words as lastUser, the call the written answer ends in). Every recorded query runs down both paths; the engine-change phrase maps to the same chip, the same words are used, and the cards a mapped word drops are shown the same way.
const ENGINE_TYPED = /\b(?:updated|upgraded|new|newer|rebuilt|built|different|modern|replacement|swapped|re-?powered)\s+(?:engine|motor|drivetrain|powertrain)\b/i;
ok("(8) the no-model search has its own reading of the words (samChat.filtersFromText)", typeof sc.filtersFromText === "function");
if (typeof sc.filtersFromText === "function") {
  for (const a of answers) {
    const pw = await sc.filtersFromText(env, a.typed).catch(() => null); if (!pw) { ok(`(8) "${a.typed}": the words read to a search`, false); continue; }
    const r2 = await runFilters(env, pw, { lastUser: a.typed }), m2 = r2.meta || {}, tag = `(8) "${a.typed}"`;
    const used2 = (r2.state && r2.state.filters) || pw, chips2 = page.filterParts({ ...pw, ...used2 }, null, null, hasLabelOf(m2)).map(x => x.label);
    if (/\bE30\b/i.test(a.typed)) ok(`${tag}: a make and a generation code alone read to the car and its generation`, pw.make === "BMW" && /3/.test(String(pw.model)) && /^e30$/i.test(String(pw.generation || "")), pw);
    const typedPhrase = ENGINE_TYPED.test(a.typed) && a.p.has === "swap";   /* a has word the model chose for itself ("rebuilt") is its own choice; the phrase mapping is the swap word */
    if (typedPhrase) {
      ok(`${tag}: the engine phrase maps to the same chip on the no-model path`, !!(m2.hasMap && a.m.hasMap && m2.hasMap.label === a.m.hasMap.label && chips2.includes(m2.hasMap.label)), { written: a.m.hasMap && a.m.hasMap.label, words: m2.hasMap && m2.hasMap.label, chips2 });
      const u2 = (m2.unusedWords || []).map(w => String(w).toLowerCase());
      ok(`${tag}: no-model path never calls "updated" or "engine" unused`, !u2.some(w => /^(updated|upgraded|rebuilt|built|new|newer|engine|motor|drivetrain|powertrain|swapped|replacement)$/.test(w)), m2.unusedWords);
      ok(`${tag}: no-model path draws the mapped word's chip once`, chips2.filter(x => /^Engine swap/.test(x)).length === 1, chips2);
      if (pw.make) ok(`${tag}: both paths show the same number of cars`, (r2.cards || []).length === a.cards, [(r2.cards || []).length, a.cards]);   /* a bare make is read from the taxonomy tables, which this fake world has none of */
    }
    // any answer: a no-model chip is a chip of the written answer's (nothing the buyer cannot account for), and no count twice
    for (const t of chips2) ok(`${tag}: no-model chip "${t}" prints its count once`, !/\(\d[\d,]*\)\s*\(\d[\d,]*\)/.test(t), t);
  }
}
// the page asks for it: the fallback runs the typed words through action rerun (the written answer's own render), and the old converse view is no longer the no-model search
{ const fb = c.slice(c.indexOf("var fallback = function"), c.indexOf("var finish = function(d)"));
  ok("(8) the page's fallback asks for the typed words' search through the written answer's own render", /__words/.test(fb) && !/ask\(\)/.test(fb.replace(/chatAsk\(/g, "")), fb.slice(0, 400));
  { const bs = fs.readFileSync(path.join(root, "api/buySearch.js"), "utf8"); ok("(8) the rerun action takes words and answers like the written answer (api/buySearch.js)", /if \(!b\.filters && b\.text\) \{[\s\S]{0,300}filtersFromText\(env, text\)/.test(bs) && /lastUser: \(byWords && byWords\.lastUser\)/.test(bs)); } }
// (9) A VISITOR NEVER SEES THAT THE WRITTEN ANSWER IS PAUSED. Sweep: every line a visitor can read on Find, Market Check and Sell that names written answers, the model, a pause or a limit of the model.
{ const rd = f => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch { return ""; } };
  const MODEL_WORDS = /written answers?|answers? (?:are|is) paused|(?:is|are) paused for the moment|paused for the moment|the model\b|Claude\b|Anthropic\b|model (?:is )?(?:paused|busy|limit)/i;
  const visitor = ["api/buy.js", "api/buySearch.js", "lib/live/samChat.js", "lib/live/converse.js", "lib/live/chatHttp.js", "api/sellChat.js", "api/chat.js", "api/sellerDecision.js", "public/js/entry.js", "public/js/result.js", "public/js/result-v2.js", "public/js/onebox.js", "public/js/chat-core.js", "public/js/sell.js", "lib/_ceilings.js", "lib/tasks/tasks.js"];
  for (const f of visitor) {
    const src = rd(f); if (!src) continue;
    // a string literal a visitor may read (a quoted sentence), outside comments
    const lits = (src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").match(/(["'`])(?:(?!\1)[^\\\n]|\\.){12,}\1/g) || []).filter(l => MODEL_WORDS.test(l) && /[a-z]{3,} [a-z]{3,}/i.test(l) && !/^["'`](?:\s*\/\/|\s*\*)/.test(l));
    const real = lits.filter(l => !/Anthropic API error/.test(l) && !/\b(?:systemPrompt|SYSTEM|You are|never invent|Never say|do not say|Do not say|\bapi\.anthropic|content-type|model:|MODEL|model_spend|sell_model)\b/i.test(l) && !/^["'`][a-z_]+["'`]$/.test(l));
    ok(`(9) ${f}: no sentence a visitor reads names written answers, the model or a pause`, real.length === 0, real.slice(0, 3));
  } }
// (10) A CAR WHOSE TITLE NAMES ANOTHER BODY NEVER MATCHES A TYPED BODY. Only a listing silent on body gets "Some of these may be a convertible. The listing doesn't say." A 1989 BMW 325is (coupe) matched a convertible search with that line.
// The shapes a listing states its body in (the title, the field, the nameplate, the first sentence of its description) or leaves unsaid, each searched for every typed body down Find (runFilters) and the Tasks matcher.
{ const base = rows.length, row = (i, title, body, desc, y = 1989, model = "3 Series") => ({ ...mk(40 + i, "BMW", model, y, title, body, "Manual", "Black"), id: 900 + i, description: desc || "" });
  const SHAPES = [
    [1, "1989 BMW 325i Convertible 5-Speed", "convertible", "", "convertible", "title"], [2, "1989 BMW 325is Coupe 5-Speed", "coupe", "", "coupe", "title names coupe"],
    [3, "1989 BMW 325is 5-Speed", null, "", "coupe", "nameplate 325is is a coupe"], [4, "1989 BMW 325i 5-Speed", null, "", null, "silent"],
    [5, "1989 BMW 325ix 5-Speed", "sedan", "", "sedan", "field names sedan"], [6, "1990 BMW 325i 5-Speed", null, "This 1990 BMW 325i sedan is finished in black over tan leather. It has 80,000 miles.", "sedan", "description names sedan"],
    [7, "1989 BMW 325i Touring Wagon", "convertible", "", "wagon", "title names wagon, field says convertible"], [8, "1991 BMW 325iC 5-Speed", null, "", "convertible", "nameplate 325iC is a convertible"],
    [9, "1989 BMW 325i 5-Speed", "coupe", "", "coupe", "field names coupe"], [10, "1989 BMW 325i Cabriolet", null, "", "convertible", "title names cabriolet (open family)"]
  ];
  const BR = SHAPES.map(([i, t, b, d]) => row(i, t, b, d, Number(t.slice(0, 4)))); const saved = rows.splice(0, rows.length, ...BR);
  const idOf = c => (c.r && c.r.id) || c.id;
  for (const typed of ["convertible", "coupe", "sedan", "wagon"]) {
    const fam = b => b === typed || (typed === "convertible" && b === "convertible");
    const want = SHAPES.filter(x => x[4] && fam(x[4])).map(x => 900 + x[0]), silent = SHAPES.filter(x => !x[4]).map(x => 900 + x[0]);
    for (const more of [false, true]) {
      const r = await runFilters(env, { make: "BMW", model: "3 Series", body: typed, ...(more ? { include_unstated: true } : {}) }, { lastUser: `BMW 3 Series ${typed}` }), cards = r.cards || [], ids = cards.map(idOf), mode = more ? "with the ones that don't say" : "as asked";
      ok(`(10) Find "${typed}" ${mode}: every car that states ${typed} is shown`, want.every(w => ids.includes(w)), { want, ids });
      ok(`(10) Find "${typed}" ${mode}: a car that names another body is never shown (${SHAPES.filter(x => x[4] && !fam(x[4])).map(x => x[5]).join("; ")})`, ids.every(i => want.includes(i) || silent.includes(i)), { ids, want, silent });
      ok(`(10) Find "${typed}" ${mode}: only a car silent on body carries the "doesn't say" mark`, cards.filter(c => (c.unknown || []).includes("body")).every(c => silent.includes(idOf(c))), cards.filter(c => (c.unknown || []).includes("body")).map(idOf));
      ok(`(10) Find "${typed}" ${mode}: a car that states ${typed} carries no "doesn't say" mark`, cards.filter(c => want.includes(idOf(c))).every(c => !(c.unknown || []).includes("body")), cards.filter(c => want.includes(idOf(c)) && (c.unknown || []).includes("body")).map(idOf));
      if (!more) ok(`(10) Find "${typed}" as asked: the count of cars that don't say is the silent cars alone`, Number((r.meta || {}).unstated || 0) === silent.length, { unstated: (r.meta || {}).unstated, silent });
    }
    // the Tasks matcher: it never notifies on an unknown, so only a car that states the body matches; a car naming another body never does
    const T = await import(pathToFileURL(path.join(root, "lib/tasks/tasks.js")).href);
    const tm = await T.findMatchesDetail(env, { id: "t", kind: "hunt", filters: { make: "BMW", model: "3 Series", body: typed }, reported_ids: [] }, { rows: BR }, null).catch(e => ({ err: String(e.message) })), tids = ((tm && tm.matches) || []).map(x => Number(x.r.id));
    ok(`(10) Tasks "${typed}": no car that names another body matches`, !tm.err && tids.every(i => want.includes(i)), { tids, want, err: tm.err });
    ok(`(10) Tasks "${typed}": every car that states ${typed} matches`, !tm.err && want.every(w => tids.includes(w)), { tids, want, err: tm.err });
  }
  rows.splice(0, rows.length, ...saved); void base; }
// ---- lane-b-find-mapped (Nov 11 2026): "Find me a BMW E30 convertible With an updated engine" drew 0 cards, "No live matches with 'swap'. 7 without it.", and a stray "could not be read yet" line. CAUSE: the engine maps "updated engine" to the has word "swap"; the
// mapped word was dropped (its cars shown, the line saying so) only when the search without it found one or two cars (WIDEN_MAX_SHOWN), so seven cars waited behind an offer as if the buyer had typed the word, and the none-live read of an empty answer printed its line.
// CLASS: a word the buyer did not type is never a typed word, at any count of cars without it, for every phrase the engine maps, for every car. A typed word keeps its offer.
{ const saved = rows.slice(), PH = ["updated engine", "upgraded engine", "rebuilt engine", "new motor", "swapped engine", "modern drivetrain", "re-powered engine"];
  const CARS = [
    { name: "BMW E30 convertible", make: "BMW", model: "3 Series", body: "convertible", yrs: [1982, 1994], title: y => `${y} BMW 325i Convertible`, ask: ph => `Find me a BMW E30 convertible with ${/^(?:updated|upgraded|rebuilt|new|modern|re-powered|swapped)/.test(ph) ? "an " : ""}${ph}`.replace("with an new", "with a new").replace("with an modern", "with a modern").replace("with an re-", "with a re-").replace("an rebuilt", "a rebuilt") },
    { name: "Porsche 911 coupe", make: "Porsche", model: "911", body: "coupe", yrs: [1984, 1989], title: y => `${y} Porsche 911 Carrera Coupe`, ask: ph => `Find me a Porsche 911 coupe with a ${ph}` }
  ];
  for (const car of CARS) for (const ph of PH) for (const n of [1, 2, 3, 5, 7, 12]) {
    const world = Array.from({ length: n }, (_, i) => mk(300 + i, car.make, car.model, car.yrs[0] + (i % (car.yrs[1] - car.yrs[0] + 1)), car.title(car.yrs[0] + (i % (car.yrs[1] - car.yrs[0] + 1))), car.body, "Manual", "Red"));
    rows.splice(0, rows.length, ...world);
    const typed = car.ask(ph), tag = `"${typed}" over ${n} cars without a swap`;
    const hm = sc.hasMapOf ? sc.hasMapOf(typed, "swap", { make: car.make, model: car.model }, []) : null;
    ok(`(11) ${tag}: the phrase is read as a phrase, never as the typed word`, !!hm && hm.from === ph.replace(/^an? /, ""), hm);
    const r = await runFilters(env, { make: car.make, model: car.model, year_min: car.yrs[0] - 2, year_max: car.yrs[1] + 2, body: car.body, has: "swap" }, { lastUser: typed }), m = r.meta || {}, cards = (r.cards || []).length;
    ok(`(11) ${tag}: all ${n} cars are shown, none hidden behind an offer`, cards === n, { cards, zero: m.zeroLine, widen: (m.widen || []).map(w => [w.kind, w.added]) });
    ok(`(11) ${tag}: the line says the word was read from the phrase and the cars are those without it`, !!(m.hasMap && m.hasMap.dropped) && /read from '[^']+'/.test(String(m.note || "")) && /without it/.test(String(m.note || "")), { note: m.note });
    ok(`(11) ${tag}: no zero count line and no offer for the word nobody typed`, !m.zeroLine && !(m.widen || []).some(w => w.kind === "anyhas"), { zero: m.zeroLine });
    const none = m.noneLive || null; ok(`(11) ${tag}: no none-live line (no "could not be read yet") on an answer with cars`, !none && !/could not be read/i.test([r.reply, m.note, m.zeroLine, m.unusedLine].filter(Boolean).join(" ")), none);
    ok(`(11) ${tag}: the chip of the dropped word is not drawn as a filter that ran`, !((r.state && r.state.filters) || {}).has, (r.state && r.state.filters) || null);
  }
  // a word the buyer TYPED is never dropped: no matches with it, the cars without it are an offer counted from the same rows
  rows.splice(0, rows.length, ...Array.from({ length: 7 }, (_, i) => mk(300 + i, "BMW", "3 Series", 1987 + i % 6, `${1987 + i % 6} BMW 325i Convertible`, "convertible", "Manual", "Red")));
  { const typed = "Find me a BMW E30 convertible with an engine swap", r = await runFilters(env, { make: "BMW", model: "3 Series", year_min: 1982, year_max: 1994, body: "convertible", has: "swap" }, { lastUser: typed }), m = r.meta || {};
    ok("(11) a typed word is no mapped phrase", !(sc.hasMapOf && sc.hasMapOf(typed, "swap", { make: "BMW", model: "3 Series" }, [])), null);
    ok("(11) a typed word keeps its offer: none shown, the offer counts the 7 without it, the line says 7", (r.cards || []).length === 0 && (m.widen || []).some(w => w.kind === "anyhas" && w.added === 7) && /\b7\b/.test(String(m.zeroLine || "")) && !(m.hasMap && m.hasMap.dropped), { cards: (r.cards || []).length, zero: m.zeroLine }); }
  const code = fs.readFileSync(path.join(root, "lib/live/samChat.js"), "utf8"), dropAt = code.indexOf("if (!sr.matches.length && p.has && ctx.lastUser) {");
  ok("(11) the drop of a mapped word has no count limit in its source", dropAt > 0 && !/WIDEN_MAX_SHOWN/.test(code.slice(dropAt, dropAt + 700)), null);
  rows.splice(0, rows.length, ...saved); }
console.log(`findVoiceCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the offer label prints the count twice", "api/buy.js", s => s.replace('(names[w.kind] || w.text || w.label || \\"\\")', '(names[w.kind] || w.label || \\"\\")')],
    ["the chip does not name its phrase", "lib/live/samChat.js", s => s.replace("label: `${name} (from '${from}')`", "label: name")],
    ["the unused-words line ignores the mapped phrase", "lib/live/samChat.js", s => s.replace("[placeName, hasMap && hasMap.from, f.has]", "[placeName]")],
    ["none-live passes a listing sentence", "lib/live/samChat.js", s => s.replace("filter(l => !LISTING_LINE_RE.test(String(l)))", "filter(l => true)")],
    ["the zero count line never names the offer", "lib/live/samChat.js", s => s.replace("ctx.searchMeta.zeroLine = `No live matches with '${String(f.has).toLowerCase()}'. ${wh.added} without it.`;", "")],
    ["a mapped word is never dropped", "lib/live/samChat.js", s => s.replace("hasDrop = { ...hm, n: r2.matches.length };", "")],
    ["a mapped word is dropped only for one or two cars", "lib/live/samChat.js", s => s.replace("if (r2 && r2.matches.length > 0) { hasDrop", "if (r2 && r2.matches.length > 0 && r2.matches.length <= WIDEN_MAX_SHOWN) { hasDrop")],
    ["the dropped line does not say what was read", "lib/live/samChat.js", s => s.replace(" (read from '${hasDrop.from}')", "")],
    ["the page ignores the chip label", "api/buy.js", s => s.replace('add(hasLabel || capWord(f.has), [\\"has\\"])', 'add(capWord(f.has), [\\"has\\"])')],
    ["the engine phrase maps nowhere (no swap word)", "lib/live/samChat.js", s => s.replace('const ENGINE_HAS = "swap";', 'const ENGINE_HAS = "";')],
    ["a part-word swap ('swapped') is not mapped from its phrase", "lib/live/samChat.js", s => s.replace("if (!(ph && word === ENGINE_HAS) && new RegExp", "if (new RegExp")],
    ["a make and a generation code alone read to no car", "lib/live/samChat.js", s => s.replace("if (fam && new Set(", "if (false && fam && new Set(")],
    ["the engine phrase stays in the car's words", "lib/live/samChat.js", s => s.replace('t.replace(ENGINE_PHRASE_RE, " ")', "t")],
    ["the rerun action takes no words", "api/buySearch.js", s => s.replace("if (!b.filters && b.text) {", "if (false) {")],
    ["the paused sentence is sent again", "api/buySearch.js", s => s.replace("capped: mg.why });", "capped: mg.why, note: \"Sam's written answers are paused for the moment. Here are the search results on their own.\" });")],
    ["the Sell chat says the answers are paused", "lib/_ceilings.js", s => s.replace("Sam can't answer that one just now. Try again in a little while.", "Sam's written answers are paused for the moment. Try again later today.")],
    ["Tasks says the answers are paused", "lib/tasks/tasks.js", s => s.replace("? TASKS_MODEL_BUSY :", "? \"Sam's written answers are paused for the moment. Try again later today.\" :")],
    ["a nameplate that is only a coupe says nothing", "lib/live/search.js", s => s.replace("const nb = bodyOfNameplate(title, r.make, r.year);", "const nb = null;")],
    ["a description's first sentence names no body", "lib/live/search.js", s => s.replace("const db = bodyOfDescription(desc, BODY_RE, BODIES);", "const db = null;")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "fv-")); try {
      spawnSync("cp", ["-R", ...fs.readdirSync(R).filter(x => x !== "node_modules" && x !== ".git").map(x => path.join(R, x)), tmp]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8" }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
