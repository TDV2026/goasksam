// scripts/bodyChangesCheck.mjs (Lane B, Oct 20 2026, Sam's yes to the body-change sweep): offline, no network. The code reader
// never takes a model name for a body code, and the sweep finds a W204/W205-style boundary from titles alone, lists the typed
// years that would mix, skips titles naming two codes, and reports curated models apart.
const LIB = process.env.BC_LIB || "../lib/_bodyChanges.js";
const { codesInTitle, findBodyChanges } = await import(new URL(LIB, import.meta.url).href);
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(codesInTitle("Mercedes-Benz", "2012 Mercedes-Benz C63 AMG Coupe W204"), ["204"]), "a Mercedes W204 title reads 204");
ok(eq(codesInTitle("Mercedes-Benz", "1989 Mercedes-Benz 560SL R107"), ["107"]), "an R107 reads 107");
ok(eq(codesInTitle("Mercedes-Benz", "2010 Mercedes-Benz C300 Sport"), []), "a C300 is a model, never a body code");
ok(eq(codesInTitle("Mercedes-Benz", "2004 Mercedes-Benz S500"), []), "an S500 is a model, never a body code");
ok(eq(codesInTitle("Mercedes-Benz", "1994 Mercedes-Benz E320 Wagon S124"), ["124"]), "an S124 wagon reads 124");
ok(eq(codesInTitle("Porsche", "1984 Porsche 944"), []), "a Porsche 944 is a model, never a body code");
ok(eq(codesInTitle("Porsche", "2013 Porsche 911 Carrera S 991.1"), ["991"]), "a 991.1 reads 991");
ok(eq(codesInTitle("BMW", "2003 BMW M3 Coupe E46"), ["E46"]), "an E46 reads E46");
ok(eq(codesInTitle("Toyota", "1995 Toyota Supra Turbo MkIV"), ["MK4"]), "a Supra MkIV reads MK4");
ok(eq(codesInTitle("Volkswagen", "1987 Volkswagen Golf GTI Mk2"), ["MK2"]), "a Golf Mk2 reads MK2");
ok(eq(codesInTitle("Mazda", "1991 Mazda MX-5 Miata na"), []), "a lowercase 'na' is not a code");
ok(eq(codesInTitle("Ferrari", "1987 Ferrari F40"), []), "a make with no code shape reads nothing");

const rows = [];
const add = (n, year, title, model = "C-Class") => { for (let i = 0; i < n; i++) rows.push({ make: "Mercedes-Benz", model, year, listing_title: title }); };
for (const y of [2008, 2009, 2010, 2011, 2012, 2013, 2014]) add(2, y, `${y} Mercedes-Benz C63 AMG W204`);
for (const y of [2017, 2018, 2019, 2020]) add(2, y, `${y} Mercedes-AMG C63 S W205`);
add(1, 2015, "2015 Mercedes-Benz C63 W204 W205 swap");
const r = findBodyChanges(rows);
const c = r.candidates[0];
ok(r.candidates.length === 1 && c.earlier.code === "204" && c.later.code === "205", "the W204/W205 boundary is found from titles alone");
ok(c && c.sales === 22, "its sales are the two codes' sales (14 + 8)");
ok(c && eq(c.typedYearsThatMix, [2015, 2016]), `the typed years that mix are the ones whose +/- 2 window reaches both bodies (${c && c.typedYearsThatMix})`);
ok(r.titlesNamingTwoCodesSkipped === 1, "a title naming two codes is skipped, never guessed");
ok(/NAME/.test(r.limit), "the limit is stated on the output");

const far = [];
for (const y of [1972, 1973, 1974]) for (let i = 0; i < 3; i++) far.push({ make: "Mercedes-Benz", model: "SL", year: y, listing_title: `${y} Mercedes-Benz 450SL R107` });
for (const y of [1990, 1991, 1992]) for (let i = 0; i < 3; i++) far.push({ make: "Mercedes-Benz", model: "SL", year: y, listing_title: `${y} Mercedes-Benz 500SL R129` });
ok(findBodyChanges(far).candidates.length === 0, "two bodies years apart never mix (no candidate)");

const cur = [];
for (const y of [2003, 2004]) for (let i = 0; i < 3; i++) cur.push({ make: "Porsche", model: "911", year: y, listing_title: `${y} Porsche 911 Carrera 996` });
for (const y of [2005, 2006]) for (let i = 0; i < 3; i++) cur.push({ make: "Porsche", model: "911", year: y, listing_title: `${y} Porsche 911 Carrera 997` });
const rc = findBodyChanges(cur);
ok(rc.candidates.length === 0 && rc.curatedModelsAlsoCrossing.length === 1, "a curated model (911) is reported apart, not as a candidate");

console.log(bad ? `bodyChangesCheck: ${bad} failed` : "bodyChangesCheck: all passed");
process.exit(bad ? 1 : 0);
