// Task filters carry the car as typed (Oct 2026, Lane C; lib/tasks/tasks.js typedCar): the setup model's job, filled
// from the one resolver's read of the buyer's words when it is the same car. Fixtures are the resolver's own output
// for each phrase (parseQueryResolved, checked by hand Oct 13 2026). No network.
//   node scripts/taskFiltersCheck.mjs
const { typedCar, validateJob, summaryFor, taskRow, knownTrim, statusLine, looseStatus, LOOSE_ORDER, engineAsks, setupQuestion, blockLines } = await import("../lib/tasks/tasks.js");
let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const V = (make, model, extra = {}) => ({ make, model, trim: null, edition: null, variant: null, wheelbase: null, series: null, bodyStyle: null, year: null, ...extra });
const cases = [
  ["1995 911 Carrera: model 911, trim Carrera", { make: "Porsche", model: "911 Carrera", year_min: 1995 }, V("Porsche", "911", { trim: "Carrera", year: 1995 }), { model: "911", trim: "Carrera", year_min: 1995 }],
  ["Mustang GT keeps GT", { make: "Ford", model: "Mustang", year_min: 2018 }, V("Ford", "Mustang", { trim: "GT", year: 2018 }), { model: "Mustang", trim: "GT" }],
  ["Regal Grand National keeps Grand National", { make: "Buick", model: "Regal", year_min: 1987 }, V("Buick", "Regal", { trim: "Grand National", year: 1987 }), { model: "Regal", trim: "Grand National" }],
  ["model written as the trim alone still matches", { make: "Buick", model: "Grand National" }, V("Buick", "Regal", { trim: "Grand National", year: 1987 }), { model: "Regal", trim: "Grand National", year_min: 1987 }],
  ["911 R keeps R", { make: "Porsche", model: "911" }, V("Porsche", "911", { trim: "R" }), { model: "911", trim: "R" }],
  ["Defender 110 keeps the 110", { make: "Land Rover", model: "Defender", year_min: 1997 }, V("Land Rover", "Defender", { wheelbase: "110", year: 1997 }), { model: "Defender", trim: "110" }],
  ["a chassis code model reads as its generation", { make: "Porsche", model: "911" }, V("Porsche", "997", { parentModel: "911", trim: "Carrera S", year: 2008 }), { model: "911", generation: "997", trim: "Carrera S" }],
  // The body as the resolver gives it (parseQueryResolved, checked Oct 14 2026), so the Task pools what Market Check pools.
  ["2003 M3 Coupe carries the coupe body", { make: "BMW", model: "M3", year_min: 2003 }, V("BMW", "M3", { bodyStyle: "coupe", year: 2003 }), { model: "M3", body: "coupe", year_min: 2003 }],
  ["1963 Corvette Split Window carries the coupe body", { make: "Chevrolet", model: "Corvette", year_min: 1963 }, V("Chevrolet", "Corvette", { bodyStyle: "coupe", year: 1963 }), { model: "Corvette", body: "coupe", year_min: 1963 }],
  ["2008 997 Carrera S Coupe carries the coupe body", { make: "Porsche", model: "911" }, V("Porsche", "997", { parentModel: "911", trim: "Carrera S", bodyStyle: "coupe", year: 2008 }), { model: "911", generation: "997", trim: "Carrera S", body: "coupe", year_min: 2008 }],
];
for (const [what, p, v, want] of cases) {
  const out = typedCar(p, v);
  ok(Object.entries(want).every(([k, x]) => out[k] === x), `${what} (got ${JSON.stringify(out)})`);
}
{ const p = { make: "Land Rover", model: "Defender 110", year_min: 1997 }; const out = typedCar(p, V("Land Rover", "Defender", { wheelbase: "110", year: 1997 })); ok(out.model === "Defender" && out.trim === "110", "model written as Defender 110: model Defender, trim 110 (got " + JSON.stringify(out) + ")"); }
// Never a different car, never a guess.
const mus = { make: "Ford", model: "Mustang", trim: "GT" };
ok(typedCar(mus, V("Chevrolet", "Camaro", { trim: "SS" })) === mus, "a different make: the model's job stands");
ok(typedCar(mus, V("Ford", "Bronco")) === mus, "a different model: the model's job stands");
ok(typedCar(mus, null) === mus && typedCar(mus, V("Ford", null)) === mus, "nothing resolved: the model's job stands");
{ const p = { make: "Ford", model: "Mustang", year_min: 1965, year_max: 1968 }; const out = typedCar(p, V("Ford", "Mustang", { year: 1966 })); ok(out.year_min === 1965 && out.year_max === 1968, "a stated year range is never replaced"); }
{ const p = { make: "Ford", model: "Mustang", gearbox: "manual", budget_max: 40000 }; const out = typedCar(p, V("Ford", "Mustang", { trim: "GT" })); ok(out.gearbox === "manual" && out.budget_max === 40000, "the rest of the job is kept"); }
{ const p = { make: "BMW", model: "M3", body: "convertible" }; ok(typedCar(p, V("BMW", "M3", { bodyStyle: "coupe" })).body === "convertible", "a body the job already states is never replaced"); }
ok(typedCar({ make: "BMW", model: "M3" }, V("BMW", "M3")).body === undefined, "no body typed: none added");
ok(validateJob("hunt", typedCar({ make: "BMW", model: "M3" }, V("BMW", "M3", { bodyStyle: "coupe" }))).filters.body === "coupe", "validateJob keeps the body");
// The row the Task's market is read from names what Market Check reads (golden table, Oct 14 2026).
{ const row = f => taskRow(f, f.year_min).listing_title;
  ok(row(validateJob("hunt", typedCar({ make: "Porsche", model: "911" }, V("Porsche", "997", { parentModel: "911", trim: "Carrera S", bodyStyle: "coupe", year: 2008 }))).filters) === "2008 Porsche 997 Carrera S coupe", "997 Carrera S Coupe: the row reads the 997");
  ok(row(validateJob("hunt", typedCar({ make: "BMW", model: "M3", year_min: 2003 }, V("BMW", "M3", { bodyStyle: "coupe", year: 2003 }))).filters) === "2003 BMW M3 coupe", "M3 Coupe: the row reads the coupe");
  ok(row(validateJob("hunt", typedCar({ make: "Chevrolet", model: "Corvette", year_min: 1963 }, V("Chevrolet", "Corvette", { bodyStyle: "coupe", year: 1963 }))).filters) === "1963 Chevrolet Corvette coupe", "Corvette Split Window: the row reads the coupe");
  ok(row({ make: "Chevrolet", model: "Corvette", generation: "C2", year_min: 1965 }) === "1965 Chevrolet Corvette", "a generation that is not a chassis code leaves the model"); }
// The read-back names every typed word.
ok(summaryFor("hunt", validateJob("hunt", typedCar({ make: "Buick", model: "Regal", year_min: 1987 }, V("Buick", "Regal", { trim: "Grand National", year: 1987 }))).filters).includes("Grand National"), "the read-back says Grand National");
ok(summaryFor("hunt", validateJob("hunt", typedCar({ make: "Ford", model: "Mustang", year_min: 2018 }, V("Ford", "Mustang", { trim: "GT", year: 2018 }))).filters).includes("Mustang GT"), "the read-back says Mustang GT");
// A TRIM IS A KNOWN TRIM OR NOTHING (Lane D, Oct 16 2026, Sam; lib/tasks/tasks.js knownTrim in validateJob). Each case is a
// sentence a buyer typed, the job the setup model proposed for it (the first one exactly as observed live on Oct 16: the
// resolver read the sentence with trim "Find ME Manual Under" and the model copied it; the others as the same path
// produces or could produce them), and the filter that must come out. Printed as a table so the filter produced for
// every sentence is on record. Real trims survive word for word; sentence words, gearbox, colour and money never do.
console.log("\nsentence -> proposed trim -> filter produced");
const SENTENCES = [
  ["Find me a black manual 997 under $70k", { vehicle: "car", make: "Porsche", model: "911", generation: "997", trim: "Find ME Manual Under", gearbox: "manual", colour: "black", budget_max: 70000 }, { trim: undefined, gearbox: "manual", colour: "black", budget_max: 70000, generation: "997" }],
  ["black manual 997 under 70k", { make: "Porsche", model: "911", generation: "997", trim: "Black Manual Under", gearbox: "manual", colour: "black", budget_max: 70000 }, { trim: undefined, gearbox: "manual", colour: "black", budget_max: 70000 }],
  ["Porsche 997 Carrera S", { make: "Porsche", model: "911", generation: "997", trim: "Carrera S" }, { trim: "Carrera S" }],
  ["Keep looking for a 964 within 500 miles of LA", { make: "Porsche", model: "911", generation: "964", trim: "Keep Looking Within", location: "Los Angeles, CA", radius_miles: 500 }, { trim: undefined, radius_miles: 500 }],
  ["Find me a 1965 Mustang fastback", { make: "Ford", model: "Mustang", trim: "Fastback", body: "fastback", year_min: 1965, year_max: 1965 }, { trim: "Fastback", body: "fastback" }],
  ["a 1987 Buick Regal Grand National", { make: "Buick", model: "Regal", trim: "Grand National", year_min: 1987 }, { trim: "Grand National" }],
  ["2016 Porsche 911 R", { make: "Porsche", model: "911", trim: "R", year_min: 2016 }, { trim: "R" }],
  ["1997 Land Rover Defender 110", { make: "Land Rover", model: "Defender", trim: "110", year_min: 1997 }, { trim: "110" }],
  ["Find me a 1969 Ford Mustang Mach 1", { make: "Ford", model: "Mustang", trim: "Mach 1", year_min: 1969, year_max: 1969 }, { trim: "Mach 1" }],
  ["2019 Porsche 911 GT3 RS", { make: "Porsche", model: "911", trim: "GT3 RS", year_min: 2019 }, { trim: "GT3 RS" }],
  ["1979 Porsche 930 Turbo", { make: "Porsche", model: "911", generation: "930", trim: "930 Turbo", year_min: 1979 }, { trim: "930 Turbo" }],
  ["Looking for a red Miata, manual, under 15k", { make: "Mazda", model: "Miata", trim: "Looking Red Manual Under", gearbox: "manual", colour: "red", budget_max: 15000 }, { trim: undefined, gearbox: "manual", colour: "red", budget_max: 15000 }],
  ["Mustang GT", { make: "Ford", model: "Mustang", trim: "GT" }, { trim: "GT" }],
  ["a black one", { make: "Porsche", model: "911", trim: "Black", colour: "black" }, { trim: undefined, colour: "black" }],
  ["Honda Integra Type R", { make: "Honda", model: "Integra", trim: "Type R" }, { trim: "Type R" }],
  ["Chevelle SS 396", { make: "Chevrolet", model: "Chevelle", trim: "SS 396" }, { trim: "SS 396" }],
  ["1973 Porsche 911 Carrera RS 2.7", { make: "Porsche", model: "911", trim: "Carrera RS 2.7", year_min: 1973 }, { trim: "Carrera RS 2.7" }],
  ["a 718 Cayman GTS 4.0 with a manual", { make: "Porsche", model: "Cayman", generation: "718", trim: "GTS 4.0", gearbox: "manual" }, { trim: "GTS 4.0", gearbox: "manual" }],
  ["any 911 under 60k, automatic is fine", { make: "Porsche", model: "911", trim: "Automatic Is Fine", budget_max: 60000 }, { trim: undefined, budget_max: 60000 }],
];
for (const [sentence, proposed, want] of SENTENCES) {
  const f = validateJob("hunt", proposed).filters;
  console.log(`  ${sentence.padEnd(46)} ${JSON.stringify(proposed.trim).padEnd(26)} ${JSON.stringify(f)}`);
  ok(Object.entries(want).every(([k, x]) => f[k] === x), `${sentence}: ${JSON.stringify(want)} (got ${JSON.stringify(f)})`);
  ok(!("trim" in f) || f.trim === want.trim, `${sentence}: no partial trim ever (got ${JSON.stringify(f.trim)})`);
}
// MACH 1 (Lane C as integrator, Oct 19 2026, Lane F's decision): one digit after a kept trim word stays in the trim, so the
// Task reads and hunts the Mach 1 (the engine's 18 sales), never the plain 1969 Mustang; a digit on its own, or after a
// sentence word, is still dropped.
ok(knownTrim("Mach 1", { make: "Ford", model: "Mustang" }) === "Mach 1", "knownTrim keeps Mach 1");
ok(knownTrim("1", { make: "Ford", model: "Mustang" }) === null && knownTrim("Under 1", { make: "Ford", model: "Mustang" }) === null, "a lone digit, or one after a sentence word, is not a trim");
{ const f = validateJob("hunt", typedCar({ make: "Ford", model: "Mustang", year_min: 1969 }, V("Ford", "Mustang", { trim: "Mach 1", year: 1969 }))).filters; ok(taskRow(f, f.year_min).listing_title === "1969 Ford Mustang Mach 1", "Mach 1: the Task's row reads the Mach 1"); }
// The guard reads the typedCar output too (the resolver-filled job passes validateJob a second time in execSetup).
{ const p = validateJob("hunt", typedCar({ make: "Porsche", model: "911", generation: "997", gearbox: "manual", colour: "black", budget_max: 70000 }, V("Porsche", "997", { parentModel: "911", trim: "Find ME Manual Under", year: null }))).filters;
  ok(p.trim === undefined && p.gearbox === "manual" && p.colour === "black" && p.budget_max === 70000 && p.generation === "997", `the resolver's sentence trim is dropped after typedCar too (got ${JSON.stringify(p)})`); }
ok(knownTrim("Carrera S", { make: "Porsche", model: "911" }) === "Carrera S" && knownTrim("Find ME Manual Under", { make: "Porsche", model: "911" }) === null && knownTrim("Black", { make: "BMW", model: "M3" }) === null && knownTrim("Black Series", { make: "Mercedes-Benz", model: "C63" }) === "Black Series" && knownTrim("2016", { make: "Porsche", model: "911" }) === null && knownTrim("70k", { make: "Porsche", model: "911" }) === null && knownTrim("AMG Black Series", { make: "Mercedes-Benz", model: "C63" }) === "AMG Black Series" && knownTrim("Series", { make: "BMW", model: "3 Series" }) === null, "knownTrim: known kept, sentence, colour alone, year and money dropped, Black Series and AMG Black Series kept, a bare Series dropped");

// THE STATUS LINE (Sam, Oct 16 2026; lib/tasks/tasks.js statusLine + looseStatus): the wording for ten typed sentences, with a
// fixture of live rows searched through an injected search (the chooser's order and the counts are what is proved here;
// the live chooser runs the same runSearch, trustFilter and taskFits as the hunt). The table is printed on every run.
console.log("\nsentence -> filter -> status line when one filter is unmet (count from the fixture)");
const F = (sentence, proposed) => [sentence, validateJob("hunt", proposed).filters];
const TEN = [
  F("Find me a black manual 997 under $70k", { make: "Porsche", model: "911", generation: "997", trim: "Find ME Manual Under", gearbox: "manual", colour: "black", budget_max: 70000 }),
  F("Keep looking for a 1990s Mazda Miata under $15k", { make: "Mazda", model: "Miata", budget_max: 15000, year_min: 1990, year_max: 1999 }),
  F("Find me a 1965 Mustang fastback", { make: "Ford", model: "Mustang", trim: "Fastback", body: "fastback", year_min: 1965, year_max: 1965 }),
  F("Porsche 997 Carrera S", { make: "Porsche", model: "911", generation: "997", trim: "Carrera S" }),
  F("Keep looking for a 964 within 500 miles of LA", { make: "Porsche", model: "911", generation: "964", trim: "Keep Looking Within", location: "Los Angeles, CA", radius_miles: 500 }),
  F("a 1987 Buick Regal Grand National", { make: "Buick", model: "Regal", trim: "Grand National", year_min: 1987 }),
  F("1997 Land Rover Defender 110", { make: "Land Rover", model: "Defender", trim: "110", year_min: 1997 }),
  F("Looking for a red Miata, manual, under 15k", { make: "Mazda", model: "Miata", trim: "Looking Red Manual Under", gearbox: "manual", colour: "red", budget_max: 15000 }),
  F("Mustang GT", { make: "Ford", model: "Mustang", trim: "GT" }),
  F("any 911 under 60k, automatic is fine", { make: "Porsche", model: "911", trim: "Automatic Is Fine", budget_max: 60000 }),
];
// The injected search: a row matches when every filter it states agrees (colour, gearbox, body, trim word in the title,
// generation word in the title, years, budget); the fixture holds cars that miss exactly one filter of each sentence.
const ROWS = [
  { id: 1, listing_title: "2008 Porsche 911 Carrera S Coupe", make: "Porsche", model: "911", year: 2008, gen: "997", colour: "silver", gearbox: "manual", body: "coupe", trim: "Carrera S", price: 52000 },
  { id: 2, listing_title: "2007 Porsche 911 Carrera 4S Cabriolet", make: "Porsche", model: "911", year: 2007, gen: "997", colour: "black", gearbox: "automatic", body: "cabriolet", trim: "Carrera 4S", price: 41000 },
  { id: 3, listing_title: "1994 Mazda MX-5 Miata", make: "Mazda", model: "Miata", year: 1994, colour: "red", gearbox: "manual", body: "roadster", trim: null, price: 19500 },
  { id: 4, listing_title: "2019 Mazda MX-5 Miata Club", make: "Mazda", model: "Miata", year: 2019, colour: "white", gearbox: "manual", body: "roadster", trim: "Club", price: 21000 },
  { id: 5, listing_title: "1965 Ford Mustang Coupe", make: "Ford", model: "Mustang", year: 1965, colour: "blue", gearbox: "manual", body: "coupe", trim: null, price: 28000 },
  { id: 6, listing_title: "1966 Ford Mustang Convertible", make: "Ford", model: "Mustang", year: 1966, colour: "red", gearbox: "automatic", body: "convertible", trim: null, price: 29000 },
  { id: 7, listing_title: "1986 Porsche 911 Carrera Coupe", make: "Porsche", model: "911", year: 1986, gen: "G-body", colour: "guards red", gearbox: "manual", body: "coupe", trim: "Carrera", price: 58000 },
  { id: 8, listing_title: "1987 Buick Regal T-Type", make: "Buick", model: "Regal", year: 1987, colour: "black", gearbox: "automatic", body: "coupe", trim: "T-Type", price: 24000 },
  { id: 9, listing_title: "1997 Land Rover Defender 90", make: "Land Rover", model: "Defender", year: 1997, colour: "green", gearbox: "manual", body: "suv", trim: "90", price: 60000 },
  { id: 10, listing_title: "1993 Mazda MX-5 Miata", make: "Mazda", model: "Miata", year: 1993, colour: "red", gearbox: "automatic", body: "roadster", trim: null, price: 16000 },
];
const fits = (f, r) => (!f.make || r.make === f.make) && (!f.model || r.model === f.model) && (!f.generation || r.gen === f.generation) && (!f.colour || r.colour === f.colour) && (!f.gearbox || r.gearbox === (f.gearbox === "manual" ? "manual" : "automatic")) && (!f.body || r.body === f.body) && (!f.trim || (r.trim || "").toLowerCase() === String(f.trim).toLowerCase()) && (!f.year_min || r.year >= f.year_min) && (!f.year_max || r.year <= f.year_max) && (!f.budget_max || r.price <= f.budget_max);
const search = async (filters, rows) => rows.filter(r => fits(filters, r)).map(r => ({ r }));
const WANT = {
  "Find me a black manual 997 under $70k": "Nothing black yet. 1 other car matches the rest.",
  "Keep looking for a 1990s Mazda Miata under $15k": "Nothing under $15,000 yet. 2 other cars match the rest.",
  "Find me a 1965 Mustang fastback": "No fastback yet. 1 other car matches the rest.",
  "Porsche 997 Carrera S": "No 997 Carrera S yet. 2 other cars match the rest.",
  "Keep looking for a 964 within 500 miles of LA": "No 964 yet. 3 other cars match the rest.",
  "a 1987 Buick Regal Grand National": "No Regal Grand National yet. 1 other car matches the rest.",
  "1997 Land Rover Defender 110": "No Defender 110 yet. 1 other car matches the rest.",
  "Looking for a red Miata, manual, under 15k": "Nothing under $15,000 yet. 1 other car matches the rest.",
  "Mustang GT": "No Mustang GT yet. 2 other cars match the rest.",
  "any 911 under 60k, automatic is fine": "Nothing under $60,000 yet. 3 other cars match the rest.",
};
for (const [sentence, f] of TEN) {
  const st = await looseStatus({}, { filters: f }, ROWS, { search });
  console.log(`  ${sentence.padEnd(46)} ${JSON.stringify(f).slice(0, 70).padEnd(72)} ${st.text}`);
  if (WANT[sentence] !== undefined) ok(st.text === WANT[sentence], `${sentence}: status "${st.text}" (wanted "${WANT[sentence]}")`);
}
// The red manual Miata under 15k: colour dropped finds nothing (3 is $19,500, 10 is automatic), so the chooser walks on;
// gearbox dropped finds nothing either (both red Miatas are over $15,000); budget dropped finds the red manual 1994 car.
{ const st = await looseStatus({}, { filters: TEN[7][1] }, ROWS, { search }); ok(st.text === "Nothing under $15,000 yet. 1 other car matches the rest." && st.dropped === "budget_max", `the chooser walks the order past filters whose removal finds nothing (got "${st.text}")`); }
ok(statusLine({}, null, 0) === "Nothing yet. Sam is watching.", "nothing at all: Nothing yet. Sam is watching.");
{ const st = await looseStatus({}, { filters: { make: "Ferrari", model: "F40" } }, ROWS, { search }); ok(st.text === "Nothing yet. Sam is watching." && st.dropped === null, "make and model only, nothing live: Nothing yet. Sam is watching."); }
{ const st = await looseStatus({}, { filters: { make: "Porsche", model: "911", colour: "black", gearbox: "manual" } }, [], { search }); ok(st.text === "Nothing yet. Sam is watching.", "no candidate rows: Nothing yet. Sam is watching., never a count"); }
ok(statusLine({ colour: "black" }, "colour", 8) === "Nothing black yet. 8 other cars match the rest." && statusLine({ colour: "black" }, "colour", 1) === "Nothing black yet. 1 other car matches the rest.", "Sam's wording exactly, singular and plural");
ok(LOOSE_ORDER[0] === "colour" && LOOSE_ORDER[LOOSE_ORDER.length - 1] === "generation", "the order: colour first, generation last");

// THE ENGINE ASKS FIRST (e65 escalatedFrom; Lane C as integrator, Oct 19 2026, Lane F's decision): a bare 2001 M3 is a body
// question on Market Check. The pooled read the shared card escalates to carries escalatedFrom; the Task's setup asks the
// engine's question in its words, and the email prints no count or range from that read. Fixtures are the shapes e65 returns.
{ const PROMPT = "Coupe or convertible? They sell in different markets.";
  const pooled = { kind: "range", low: 20000, high: 47000, count: 12, family: "2001 M3s", escalatedFrom: { tier: "body_choice", options: ["Coupe", "Convertible"], prompt: PROMPT } };
  const conv = { kind: "range", low: 20000, high: 41000, count: 9, family: "2001 M3 convertibles", escalatedFrom: null };
  const a = engineAsks(pooled);
  ok(a && a.prompt === PROMPT && a.options.join("|") === "Coupe|Convertible", "engineAsks: the engine's own prompt and options");
  ok(engineAsks(conv) === null && engineAsks(null) === null && engineAsks({ escalatedFrom: { tier: "body_choice", prompt: null } }) === null, "engineAsks: nothing when the engine asked nothing");
  const rows = [];
  const read = row => { rows.push(row.listing_title); return Promise.resolve(/Convertible|convertible/.test(row.listing_title) ? conv : pooled); };
  const q = await setupQuestion({}, { make: "BMW", model: "M3", year_min: 2001, year_max: 2001 }, read);
  ok(q && q.prompt === PROMPT && rows[0] === "2001 BMW M3", `setup: a bare 2001 M3 asks the engine's body question (got ${JSON.stringify(q)})`);
  ok(await setupQuestion({}, { make: "BMW", model: "M3", body: "convertible", year_min: 2001, year_max: 2001 }, read) === null && rows.length === 1, "setup: a named body asks nothing and reads nothing");
  ok(await setupQuestion({}, { make: "BMW", model: "M3", year_min: 2001, year_max: 2001 }, () => Promise.reject(new Error("x"))) === null, "setup: a read that fails asks nothing");
  const marked = blockLines(pooled, 30000, "", "Current bid $30,000.");
  ok(marked.rangeLine === null && marked.lines.join(" ") === "Current bid $30,000." && !/\b12\b|\$20,000|\$47,000|sales/.test(marked.lines.join(" ")), `email: a marked read prints the bid only, no count or range (got ${JSON.stringify(marked.lines)})`);
  const placed = blockLines(conv, 30000, "", "Current bid $30,000.");
  ok(placed.rangeLine && /Current bid \$30,000/.test(placed.rangeLine), `email: an unmarked read is placed as before (got ${JSON.stringify(placed)})`); }

console.log(`taskFiltersCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
