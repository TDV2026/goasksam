// THE AMAZON AUTOS PILOT SCOPE, APPROVED BY SAM (Oct 20 2026; Lane C). In scope if any one is true, from the answer's own
// identity (year, make, model, trim), never from price or sales: (a) 25 or more years old (relative to the current year,
// one constant), any make; (b) any year, the listed makes; (c) any year, the listed models. One in-scope and one
// out-of-scope example per rule, the seven demo cars, and the page running the very same function. No network.
//   node scripts/amazonScopeCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
import { scopeFromWords, amazonInScope, SCOPE_AGE_YEARS, SCOPE_MAKES, SCOPE_MODELS, amazonPageHtml } from "../api/_amazonDemo.js";
import { carOf, DUMMY } from "../api/partnerDemo.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const R = { age: SCOPE_AGE_YEARS, makes: SCOPE_MAKES, models: SCOPE_MODELS }, Y = 2026;
const IN = (id, why) => ok(amazonInScope(id, Y, R) === true, `IN  ${why}: ${JSON.stringify(id)}`);
const OUT = (id, why) => ok(amazonInScope(id, Y, R) === false, `OUT ${why}: ${JSON.stringify(id)}`);
// (a) 25 years or older, any make; relative to the year, from one constant.
ok(SCOPE_AGE_YEARS === 25, "(a) one constant, 25 years");
IN({ year: 2001, make: "Toyota", model: "Corolla" }, "(a) a 2001 car in 2026 (25 years)");
OUT({ year: 2002, make: "Toyota", model: "Corolla" }, "(a) a 2002 ordinary car in 2026 (24 years)");
ok(amazonInScope({ year: 2002, make: "Toyota", model: "Corolla" }, 2027, R) === true, "(a) the same car comes in the next year (relative, not a hardcoded year)");
IN({ year: 1969, make: "Chevrolet", model: "Nova" }, "(a) a 1969 Nova"); IN({ year: 1959, make: "Chevrolet", model: "Bel Air" }, "(a) a 1959 Bel Air");
// (b) the makes, any year.
for (const mk of SCOPE_MAKES) IN({ year: 2024, make: mk, model: "Any" }, `(b) ${mk}, any year`);
OUT({ year: 2024, make: "Kia", model: "Telluride" }, "(b) a make not on the list");
// (c) the models, any year.
const C = [
  [["Lexus", "LFA"], ["Lexus", "RX"]], [["Mercedes-Benz", "C-Class", "C 63 AMG"], ["Mercedes-Benz", "S-Class", "S 580"]], [["Mercedes-Benz", "SL-Class", "SL 550"], ["Mercedes-Benz", "E-Class", "E 350"]],
  [["Mercedes-Benz", "SLS AMG"], ["Mercedes-Benz", "GLE", "GLE 350"]], [["Mercedes-Benz", "G-Class", "G 550"], ["Mercedes-Benz", "GLA"]],
  [["BMW", "M3"], ["BMW", "3-Series", "M340i"]], [["BMW", "X5 M"], ["BMW", "X5", "xDrive40i"]], [["Audi", "RS 6"], ["Audi", "A6"]], [["Audi", "R8"], ["Audi", "Q5"]],
  [["Land Rover", "Defender"], ["Land Rover", "Discovery"]], [["Ford", "GT"], ["Ford", "F-150"]], [["Ford", "Mustang", "Shelby GT350"], ["Ford", "Mustang", "EcoBoost"]],
  [["Ford", "Mustang", "Boss 302"], ["Ford", "Mustang", "GT Premium"]], [["Ford", "Mustang", "Mach 1"], ["Ford", "Mustang Mach-E"]], [["Ford", "Bronco"], ["Ford", "Explorer"]],
  [["Chevrolet", "Corvette"], ["Chevrolet", "Malibu"]], [["Chevrolet", "Camaro", "ZL1"], ["Chevrolet", "Camaro", "LT"]], [["Chevrolet", "Camaro", "SS"], ["Chevrolet", "Camaro", "1LT"]],
  [["Dodge", "Viper"], ["Dodge", "Durango"]], [["Dodge", "Challenger", "SRT Hellcat"], ["Dodge", "Challenger", "R/T"]], [["Dodge", "Charger", "SRT Demon"], ["Dodge", "Charger", "SXT"]],
  [["Jeep", "Wrangler", "Rubicon 392"], ["Jeep", "Wrangler", "Sport"]], [["Nissan", "GT-R"], ["Nissan", "Altima"]], [["Nissan", "Z"], ["Nissan", "Rogue"]],
  [["Toyota", "Supra"], ["Toyota", "Camry"]], [["Toyota", "Land Cruiser"], ["Toyota", "RAV4"]], [["Honda", "NSX"], ["Honda", "Accord"]], [["Acura", "NSX"], ["Acura", "MDX"]],
  [["Honda", "S2000"], ["Honda", "Pilot"]], [["Honda", "Civic", "Type R"], ["Honda", "Civic", "EX"]], [["Mazda", "MX-5 Miata"], ["Mazda", "CX-5"]],
  [["Jaguar", "F-Type", "R"], ["Jaguar", "F-Type", "R-Dynamic P300"]], [["Jaguar", "E-Type"], ["Jaguar", "XF"]]
];
for (const [[mk, md, tr], [mk2, md2, tr2]] of C) { IN({ year: 2015, make: mk, model: md, variant: tr || null }, "(c)"); OUT({ year: 2015, make: mk2, model: md2, variant: tr2 || null }, "(c)"); }
// The seven demo cars: all in scope (name and the rule that admits it).
const DEMO = [[{ year: 2014, make: "Porsche", model: "911", variant: "GT3" }, "(b) Porsche"], [{ year: 2015, make: "Porsche", model: "911", variant: "GT3" }, "(b) Porsche"], [{ year: 2005, make: "Porsche", model: "911" }, "(b) Porsche"],
  [{ year: 1965, make: "Ford", model: "Mustang" }, "(a) 61 years old"], [{ year: 1957, make: "Porsche", model: "356", variant: "Speedster" }, "(a) and (b)"], [{ year: 1966, make: "Ferrari", model: "275 GTB" }, "(a) and (b)"], [{ year: 2023, make: "Porsche", model: "911", variant: "GT3" }, "(b) Porsche"]];
for (const [id, why] of DEMO) IN(id, "demo car " + why);
// The page runs the very same function, relative to the visitor's year.
const h = amazonPageHtml("c", "1965 Ford Mustang", { carOf, listing: DUMMY });
ok(h.includes("var amazonInScope = " + amazonInScope.toString()) && /amazonInScope\(a && a\.identity, new Date\(\)\.getFullYear\(\), SCOPE\)/.test(h), "the page runs amazonInScope itself, with this year");
const js = fs.readFileSync(new URL("../api/_amazonDemo.js", import.meta.url), "utf8");
ok(!/price|range|sales|count/i.test(amazonInScope.toString()), "the scope reads the identity only, never price or sales");
// SCOPE FROM THE LISTING'S OWN WORDS (Lane F, Oct 20 2026): an out-of-scope listing draws no module and makes no read.
{ const W = t => scopeFromWords(t, Y, R);
  ok(W("2015 Toyota Corolla") === false, "words: a 2015 Toyota Corolla is out at once");
  ok(["2014 Porsche 911 GT3", "2015 Porsche 911 GT3", "2005 Porsche 911", "1965 Ford Mustang Fastback", "1957 Porsche 356 Speedster", "1966 Ferrari 275 GTB", "2023 Porsche 911 GT3"].every(c => W(c) === true), "words: the seven demo cars are in at once");
  ok(W("2018 Chevy Corvette") === true && W("2017 Mercedes G550") === true && W("2016 Nissan 370Z") === true && W("2019 Ford Mustang GT350") === true, "words: aliases and model rules (Chevy Corvette, Mercedes G550, 370Z, Mustang GT350) are in");
  ok(W("2015 Ford Mustang") === false && W("2019 Honda Accord") === false, "words: ordinary young cars of a listed make are out");
  ok(W("Citroen DS") === null && W("2015 Citroen DS") === null && W("Toyota Corolla") === null, "words with no year or no known make: undecided, the answer decides after the read");
  const out = amazonPageHtml("c", "2015 Toyota Corolla", { carOf, listing: DUMMY }), inn = amazonPageHtml("c", "1966 Ferrari 275 GTB", { carOf, listing: DUMMY });
  ok(!/id="c-mc"/.test(out) && !/id="mc-body"/.test(out) && !/Reading the sales/.test(out.replace(/<script>[\s\S]*<\/script>/, "")) && /OUT_OF_SCOPE = true/.test(out), "the Corolla listing: no module element, no Reading line, and the page knows it is out (no read)");
  ok(/id="c-mc"/.test(inn) && /OUT_OF_SCOPE = false/.test(inn), "the 275 GTB listing: the module is there and the page reads");
  ok(/if \(VIEW === "c" && !OUT_OF_SCOPE\) ask\(body\)\.then\(drawC\)/.test(out), "tab c reads only when the listing is not out of scope");
  ok(/OUT_OF_SCOPE = false/.test(amazonPageHtml("c", "Citroen DS", { carOf, listing: DUMMY })), "an undecided listing still reads, and the answer decides"); }
// TABS a AND b (Lane F, Oct 20 2026): typed words decide the same way before any read; undecided words read as before.
{ const ha = amazonPageHtml("a", "", { carOf, listing: DUMMY });
  ok(ha.includes("scopeFromWords = " + scopeFromWords.toString()) && /function wordsOut\(q\)\{ return scopeFromWords\(q, new Date\(\)\.getFullYear\(\), SCOPE\) === false; \}/.test(ha), "tabs a and b run scopeFromWords itself on the typed words");
  ok(/if \(wordsOut\(q\)\) \{ \$\("a-out"\)\.innerHTML = ""; return; \} \$\("a-out"\)\.innerHTML = '<p class="loading">/.test(ha) && /if \(wordsOut\(q\)\) \{ \$\("b-out"\)\.innerHTML = ""; return; \} \$\("b-out"\)\.innerHTML = '<p class="loading">/.test(ha), "an out-of-scope typed car draws nothing and makes no read, before the Reading line");
  const m = /var KNOWN_MAKES = (.*?), MAKE_WORDS = (.*?), scopeFromWords = /.exec(ha);
  ok(m && JSON.parse(m[1]).length > 40 && JSON.parse(m[2]).length > 3, "the page carries the known makes and the make words"); }
console.log(`amazonScopeCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
