// Task filters carry the car as typed (Oct 2026, Lane C; lib/tasks/tasks.js typedCar): the setup model's job, filled
// from the one resolver's read of the buyer's words when it is the same car. Fixtures are the resolver's own output
// for each phrase (parseQueryResolved, checked by hand Oct 13 2026). No network.
//   node scripts/taskFiltersCheck.mjs
const { typedCar, validateJob, summaryFor } = await import("../lib/tasks/tasks.js");
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
// The read-back names every typed word.
ok(summaryFor("hunt", validateJob("hunt", typedCar({ make: "Buick", model: "Regal", year_min: 1987 }, V("Buick", "Regal", { trim: "Grand National", year: 1987 }))).filters).includes("Grand National"), "the read-back says Grand National");
ok(summaryFor("hunt", validateJob("hunt", typedCar({ make: "Ford", model: "Mustang", year_min: 2018 }, V("Ford", "Mustang", { trim: "GT", year: 2018 }))).filters).includes("Mustang GT"), "the read-back says Mustang GT");
console.log(`taskFiltersCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
