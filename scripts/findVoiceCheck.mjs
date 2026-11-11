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
    ["the dropped line does not say what was read", "lib/live/samChat.js", s => s.replace(" (read from '${hasDrop.from}')", "")],
    ["the page ignores the chip label", "api/buy.js", s => s.replace('add(hasLabel || capWord(f.has), [\\"has\\"])', 'add(capWord(f.has), [\\"has\\"])')]
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
