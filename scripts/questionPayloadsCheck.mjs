// EVERY QUESTION THE ENGINE ASKS CARRIES A WAY OUT (Lane B, Oct 29 2026, Lane E's FULL: "the clarify path has no way out"). scripts/questionWayOutCheck.mjs covers the engine's own question tiers (model, generation, body, trim: a wayOut; gearbox,
// variant, documented history: the engine's skip "Just show what sold"). The RESOLVER's questions, which Lane E draws through renderChoice (a missing model or year, "Did you mean", a VIN that did not decode or is not shaped like one, a chassis hint,
// vehicleIdentity's grounded question), carried only the chips "Change car" and "Not sure", which RESET the search; none had a way to type the car the buttons left out. NOW lib/vehicle.js baseResult (and its two inline question builders) attach
// clarification.wayOut through clarifyWayOut (lib/questionWayOut.js), the engine's words: "Another model", "Another year", "Another car".
// This check runs the resolver on a battery of inputs that reach every kind of question and fails on any needs_clarification or needs_confirmation payload that has no wayOut (the chips "Change car" and "Not sure" do not count: they start over), and on any engine
// question tier that has neither a wayOut kind nor the engine's own skip.
//   node scripts/questionPayloadsCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href), W = await import(pathToFileURL(path.join(root, "lib/questionWayOut.js")).href);
// A. the resolver's questions: a missing make, model or year; a typo; a VIN of every shape; a chassis hint; a plain car word
const INPUTS = [["porsche", {}], ["911", {}], ["1995 honda", {}], ["chevrolet", {}], ["porche 911", {}], ["2001 bmw", {}], ["vw", {}], ["ford", {}], ["1969 chevrolet", {}], ["mercedes sl", {}], ["toyota 1995", {}], ["porsche 911", {}], ["sports car", {}], ["a car", {}], ["1234", {}],
  ["WP0AB0911GS12", {}], ["1HGCM82633A004352", { vinConfirm: true }], ["WBSBL93461JR12345", { vinConfirm: true }], ["WP0AB0911GS120000", { vinConfirm: true }], ["ZFFRG36A6P0095809", { vinConfirm: true }], ["XXXXXXXXXXXXXXXXX", { vinConfirm: true }], ["12345678901234567", { vinConfirm: true }]];
const kinds = {}; let asked = 0;
for (const [q, opt] of INPUTS) {
  const r = await V.resolveVehicle(q, opt).catch(e => ({ err: String(e) })); if (!r || !/^needs_/.test(String(r.status))) continue; asked++;
  const c = r.clarification || {}, w = c.wayOut, kind = c.kind || (c.missing || []).join("+") || "ask";
  kinds[kind] = (kinds[kind] || 0) + 1;
  ok(`${JSON.stringify(q)}${opt.vinConfirm ? " (VIN)" : ""}: the ${kind} question carries a way out (not only Change car / Not sure)`, !!w && w.id === "type_it" && W.WAY_OUT_KINDS.includes(w.kind) && !!w.label && !!w.placeholder && w.mode === "search", JSON.stringify(w));
}
ok(`the battery reached the resolver's questions (${asked}; kinds ${JSON.stringify(kinds)})`, asked >= 14 && Object.keys(kinds).length >= 4);
// the wordings are the engine's own
{ const w = k => W.wayOutFor(k, { year: 1995, make: "Honda", model: "Accord" }); ok("the wordings: Another model, Another year, Another car (reason table)", w("model").label === "Another model" && w("year").label === "Another year" && w("car").label === "Another car" && w("car").prefill === "" && /^Honda Accord /.test(w("year").prefill)); }
// B. the engine's own question tiers: a wayOut kind or the engine's skip, none without
{ const src = fs.readFileSync("lib/onebox.js", "utf8"), tiers = [...new Set([...src.matchAll(/\btier: "([a-z]+_choice)"/g)].map(m => m[1]))];
  for (const t of tiers) ok(`engine tier ${t}: a way out kind or the engine's skip`, !!W.WAY_OUT_TIER[t] || W.SKIP_TIERS.includes(t));
  ok("the skip tiers carry the engine's skip label", /skipLabel: "Just show what sold"/.test(src)); }
// C. the other payloads that leave the server
{ const vi = fs.readFileSync("api/vehicleIdentity.js", "utf8"), sd = fs.readFileSync("api/sellerDecision.js", "utf8");
  ok("vehicleIdentity's grounded question builds its way out", /wayOut: wayOutFor\(/.test(vi));
  ok("the Market Check clarification passes the resolver's clarification (with its way out) through", /clarification: resolution\.clarification \|\| /.test(sd) || /clarification: cl,/.test(sd)); }
console.log(fail ? `questionPayloadsCheck: ${fail} failure(s)` : "questionPayloadsCheck: all pass");
process.exit(fail ? 1 : 0);
