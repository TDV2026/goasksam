// Desk v3 stage 2: assessment and reserve are independent numbers. Writing one never writes the other. node scripts/deskIndependenceCheck.mjs [rootDir]
import path from "node:path"; import { setup } from "./_deskCaseWorld.mjs";
const root = path.resolve(process.argv[2] || "."), { K, M, readyCase, T } = await setup(root);
let pass = 0, fail = 0; const ok = (n, c) => { if (c) pass++; else { fail++; console.log("FAIL " + n); } };
const base = await readyCase(), J = x => JSON.stringify(x), ev = base.desk.evidence;
const patches = [{ figure: ev.q1 + 100 }, { figure: null }, { low: 1, high: 999999 }, { explanation: "A new explanation of the figure that is long enough to count." }, { figure: ev.high, low: ev.low, high: ev.high, explanation: "x" }];
for (const p of patches) { const c = K.setAssessment(base, p, T); ok("assessment " + J(p) + " leaves the reserve bytes identical", J(c.reserve) === J(base.reserve)); }
const rp = [{ figure: ev.q3 }, { figure: null }, { rationale: "A new rationale." }, { seller_agreed: true }, { seller_agreed: false, figure: ev.q1, rationale: "y" }];
for (const p of rp) { const c = K.setReserve(base, p, T); ok("reserve " + J(p) + " leaves the assessment bytes identical", J(c.assessment) === J(base.assessment)); }
// the other kinds of edit touch neither
for (const [n, c] of [["a photo", M.addPhoto(base, { id: "ph9" }, T)], ["a comparable pick", K.selectComparables(base, [], T)], ["a note", K.correctField(base, "colour", "Black", { now: T })], ["verifying a field", K.verify(K.correctField(base, "colour", "Black", { now: T }), "colour", { now: T })]]) ok(n + " touches neither figure", J(c.assessment) === J(base.assessment) && J(c.reserve) === J(base.reserve));
// writing the assessment to the reserve's value does not write the reserve; a reserve never moves because the assessment crossed it
const crossed = K.setAssessment(base, { figure: base.reserve.figure }, T);
ok("an assessment set to the reserve's figure does not change the reserve", J(crossed.reserve) === J(base.reserve));
const crossed2 = K.setReserve(base, { figure: base.assessment.figure }, T);
ok("a reserve set to the assessment's figure does not change the assessment", J(crossed2.assessment) === J(base.assessment));
// both orders reach the same state
ok("the order of the two writes does not matter", J(K.setReserve(K.setAssessment(base, { figure: ev.median + 500 }, T), { figure: ev.q1 - 500 }, T).assessment) === J(K.setAssessment(base, { figure: ev.median + 500 }, T).assessment));
// seller_agreed is the reserve's and is never set by anything but the reserve writer
ok("seller_agreed is true only when the reserve writer set it", base.reserve.seller_agreed === false && K.setReserve(base, { seller_agreed: "yes" }, T).reserve.seller_agreed === false && K.setReserve(base, { seller_agreed: true }, T).reserve.seller_agreed === true);
console.log(`deskIndependenceCheck: ${pass} pass, ${fail} FAIL`); process.exit(fail ? 1 : 0);
