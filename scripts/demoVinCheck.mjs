// THE AMAZON DEMO'S VIN NAME, FEATURES AND ANSWER CASES (Sam's revision 2, items 7 and 8; Lane E, Oct 20 2026), offline:
// the vPIC decode of two real VINs (rows saved from vPIC on Oct 20 2026, no network) gives the car's year, make and model
// and only the features the decode holds; the four answer cases (unreadable VIN, read with no sales, outside the pilot
// scope, an answer) come out as Sam's lines. Exits 1 on any failure.
//   node scripts/demoVinCheck.mjs
import { vpicFacts } from "../lib/vehicle.js";
import { demoAnswerCase, OUT_OF_SCOPE_LINE } from "../lib/amazonDemoCase.js";
import { VIN_UNREADABLE_LINE } from "../api/partnerAnswer.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const S550 = { ModelYear: "2015", Make: "MERCEDES-BENZ", Model: "S-Class", Trim: "S550 4-MATIC", Series: "", BodyClass: "Coupe", DriveType: "AWD/All-Wheel Drive", Seats: "", EngineCylinders: "8", DisplacementL: "4.7", EngineHP: "", FuelTypePrimary: "Gasoline", TransmissionStyle: "", TransmissionSpeeds: "" };
const M3 = { ModelYear: "1995", Make: "BMW", Model: "M3", Trim: "", Series: "3-Series", BodyClass: "Coupe", DriveType: "", Seats: "", EngineCylinders: "6", DisplacementL: "2.9906391800", EngineHP: "240", FuelTypePrimary: "Gasoline", TransmissionStyle: "", TransmissionSpeeds: "" };
const a = vpicFacts(M3, "WBSBF932XSEH00621");
ok(a.readable && a.year === 1995 && a.make === "BMW" && a.model === "M3" && a.bodyStyle === "coupe", `WBSBF932XSEH00621 names "1995 BMW M3 Coupe" (got ${a.year} ${a.make} ${a.model} ${a.bodyStyle})`);
ok(a.trim === null, "the decode's Series (\"3-Series\") is never used as a trim");
ok(JSON.stringify(a.features) === JSON.stringify({ engine: "6 cylinders, 3.0 L, 240 hp", fuel: "Gasoline" }), `only the features the decode holds: ${JSON.stringify(a.features)}`);
const b = vpicFacts(S550, "WDDXJ8FB2FA010198");
ok(b.year === 2015 && b.make === "Mercedes-Benz" && b.model === "S-Class" && b.trim === "S550 4-MATIC", `WDDXJ8FB2FA010198 names the 2015 Mercedes-Benz S-Class S550 4-MATIC (got ${b.year} ${b.make} ${b.model} ${b.trim})`);
ok(b.features.drivetrain === "All-wheel drive" && !("seats" in b.features) && !("transmission" in b.features), `blank decode fields are omitted, never guessed: ${JSON.stringify(b.features)}`);
ok(vpicFacts({ Make: "", ErrorCode: "11" }, "ZZZZZZZZZZZZZZZZZ").readable === false, "a decode with no make is unreadable");
const cases = [
  ["(a) unreadable", { ok: true, answerType: "vin_unreadable", line: VIN_UNREADABLE_LINE }, "unreadable", VIN_UNREADABLE_LINE],
  ["(c) the S550 coupe, outside the pilot", { ok: true, answerType: "zero_result", identity: { year: 2015, make: "Mercedes-Benz", model: "S-Class", variant: "S550 4-MATIC" }, carName: "2015 Mercedes-Benz S-Class S550 4-MATIC", thin: "x" }, "out_of_scope", OUT_OF_SCOPE_LINE],
  ["(c) decoded only, no engine identity", { ok: true, answerType: "identity_question", identity: null, vinDecode: { year: 2015, make: "Mercedes-Benz", model: "S-Class", trim: "S550 4-MATIC" }, question: { text: "x", options: [] } }, "out_of_scope", OUT_OF_SCOPE_LINE],
  ["(b) read, no sales, in scope", { ok: true, answerType: "zero_result", identity: { year: 1995, make: "BMW", model: "M3" }, carName: "1995 BMW M3", thin: "No 1995 M3 sale on record in the last five years." }, "no_sales", "No 1995 M3 sale on record in the last five years."],
  ["an answer with a range", { ok: true, answerType: "range", identity: { year: 2023, make: "Porsche", model: "911", variant: "GT3" }, range: { low: 1, high: 2 }, sales: [{}] }, "answer", null],
];
for (const [n, ans, kind, line] of cases) { const r = demoAnswerCase(ans, 2026); ok(r.kind === kind && r.line === line, `${n}: ${r.kind} "${r.line}"`); }
ok(VIN_UNREADABLE_LINE === "We couldn't read that VIN. Check it, or type the year, make and model." && OUT_OF_SCOPE_LINE === "Market Check covers enthusiast and specialty cars in this pilot.", "Sam's two lines, word for word");
console.log(`demoVinCheck: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
