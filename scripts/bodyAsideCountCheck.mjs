// bodyAsideCountCheck (Lane B, Oct 20 2026, Lane F's fix after the 15:50 bodyaside read): the task counts a held-back sale only
// when its OWN title names the typed body and its year is the typed year; a row of another body or another year is never
// counted, for project and modified as well as no photo. Offline: the pure counter with the engine's own body reader, seeded rows.
globalThis.fetch = async () => { throw new Error("network blocked in check"); };
const ob = await import("../lib/onebox.js");
const { heldBodyRows } = await import("../lib/_bodyAside.js");
let bad = 0;
const ok = (c, m) => { if (c) console.log("ok   " + m); else { bad++; console.log("FAIL " + m); } };
const row = (id, t, y) => ({ id, title: t, raw_title: t, rtitle: t, year: y, price: 250000, sale_price: 250000, currency: "USD", make: "Porsche", model: "911" });
const spec = { make: "Porsche", model: "911", year: 2001, subject: "911" };
const ex = [
  { row: row("a", "2001 Porsche 911 Carrera 4S Cabriolet", 2001), reason: "no photo" },            // counts: the body, the year
  { row: row("b", "2001 Porsche 911 Carrera 4S Coupe", 2001), reason: "project or incomplete car (project)" },   // another body
  { row: row("c", "2004 Porsche 911 Carrera 4S Cabriolet", 2004), reason: "modified or non-stock" },              // another year
  { row: row("d", "2001 Porsche 911 Carrera 4S Cabriolet Project", 2001), reason: "project or incomplete car (project)" },   // counts
  { row: row("e", "2001 Porsche 911 Carrera 4S", 2001), reason: "modified or non-stock" },          // no body word: not counted
  { row: row("f", "2001 Porsche 911 Carrera 4S Cabriolet", 2001), reason: "different body style" }  // not a held-back reason
];
const deps = { body: "cabriolet", year: 2001, rowBodyWordOf: ob.obRowBodyWordOf, bodyFamily: ob.obBodyFamily, qualifyReason: () => null };
const got = heldBodyRows(ex, spec, deps);
const total = Object.values(got).reduce((a, n) => a + n, 0);
ok(got["no photo"] === 1, `the no-photo cabriolet of the typed year counts (${JSON.stringify(got)})`);
ok(total === 2, `only the two cabriolets of 2001 count, never the coupe, the 2004 cabriolet, a title with no body or another reason (counted ${total})`);
ok(!("modified" in got), "the 2004 cabriolet (modified) and the bodyless 2001 (modified) are not counted");
const diffCar = heldBodyRows([{ row: row("g", "2001 Porsche 911 Carrera 4S Cabriolet", 2001), reason: "no photo" }], spec, { ...deps, qualifyReason: () => "memorabilia or replica" });
ok(Object.keys(diffCar).length === 0, "a row another fence rejects (with the photo rule waived) is never counted");
console.log(bad ? `bodyAsideCountCheck: ${bad} failed` : "bodyAsideCountCheck: all passed");
process.exit(bad ? 1 : 0);
