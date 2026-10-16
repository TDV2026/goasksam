// Task filters carry the car as typed (Oct 2026, Lane C; lib/tasks/tasks.js typedCar): the setup model's job, filled
// from the one resolver's read of the buyer's words when it is the same car. Fixtures are the resolver's own output
// for each phrase (parseQueryResolved, checked by hand Oct 13 2026). No network.
//   node scripts/taskFiltersCheck.mjs
const { typedCar, validateJob, summaryFor, taskRow, knownTrim } = await import("../lib/tasks/tasks.js");
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
// The guard reads the typedCar output too (the resolver-filled job passes validateJob a second time in execSetup).
{ const p = validateJob("hunt", typedCar({ make: "Porsche", model: "911", generation: "997", gearbox: "manual", colour: "black", budget_max: 70000 }, V("Porsche", "997", { parentModel: "911", trim: "Find ME Manual Under", year: null }))).filters;
  ok(p.trim === undefined && p.gearbox === "manual" && p.colour === "black" && p.budget_max === 70000 && p.generation === "997", `the resolver's sentence trim is dropped after typedCar too (got ${JSON.stringify(p)})`); }
ok(knownTrim("Carrera S", { make: "Porsche", model: "911" }) === "Carrera S" && knownTrim("Find ME Manual Under", { make: "Porsche", model: "911" }) === null && knownTrim("Black", { make: "BMW", model: "M3" }) === null && knownTrim("Black Series", { make: "Mercedes-Benz", model: "C63" }) === "Black Series" && knownTrim("2016", { make: "Porsche", model: "911" }) === null && knownTrim("70k", { make: "Porsche", model: "911" }) === null && knownTrim("AMG Black Series", { make: "Mercedes-Benz", model: "C63" }) === "AMG Black Series" && knownTrim("Series", { make: "BMW", model: "3 Series" }) === null, "knownTrim: known kept, sentence, colour alone, year and money dropped, Black Series and AMG Black Series kept, a bare Series dropped");

console.log(`taskFiltersCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
