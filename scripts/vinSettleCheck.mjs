// A VIN NEVER ASKS A QUESTION IT ALREADY ANSWERS (Lane B, Nov 2 2026; Sam's live find: the VIN WP0AA29962S621698 drew the exact car's sale, a 2002 Porsche 911 Carrera 4S Coupe 6-Speed, $32,000, and under it Market Check asked
// "These sold as Carrera, Carrera 4, Carrera 4S and Turbo, and they price differently. Which one is it?").
// CAUSE: a VIN search is a typed search of the year, make and model the VIN names (lib/vinAsTyped.js typedWordsFor), so the decode's trim and the trim of the archive record of that exact VIN never reached the engine, and the typed car's own trim question was
// asked of a car whose trim is known. FIX: the VIN's facts (vinFactsOf: decode trim and body, the archive record's trim, title and gearbox) settle a question tier (lib/onebox.js settleQuestionFromVin); the settled option is opened the way its chip opens it;
// an unsettled one is asked about that attribute only, narrowed to what the VIN leaves, with the engine's line saying why (vinAskLine).
// CLASS: every VIN fixture below runs the plan, the typed engine and settleVinAnswer, and the same four rules hold for all of them: a settled attribute is not asked, an unsettled one is asked alone with its reason, the chips never list an option the VIN rules out,
// and a car the VIN names with no question to ask is not changed. Offline, a seeded pool.   node scripts/vinSettleCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const imp = f => import(pathToFileURL(path.join(root, f)).href);
const E = await imp("lib/onebox.js"), V = await imp("lib/vehicle.js"), A = await imp("lib/vinAsTyped.js");
const settle = A.settleVinAnswer || (async d => d);   // on a base without the fix there is nothing to call: the typed answer stands, and the rules below fail
const mk = (id, y, make, model, title, price, i, vin) => ({ id, price, _usd: price, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: y, make, model, raw_title: title, rtitle: title, mileage: String(40000 + i * 1500), vin_norm: vin || "ZZZ" + id.replace(/\W/g, ""), transmission: "Manual (6-speed)", image: "https://img.test/x.jpg", source: "bringatrailer", platform: "bringatrailer" });
const pool = (y, make, model, spec, ownVin, ownTitle, ownTrim) => {
  const rows = [];
  for (const [trim, base, n, body] of spec) for (let i = 0; i < n; i++) rows.push(mk(trim + i, y, make, model, `${y} ${make} ${model} ${trim} ${body || "Coupe"}`, base + i * 700, i));
  if (ownVin) { const j = rows.findIndex(r => new RegExp(ownTrim).test(r.rtitle)); rows[j] = { ...rows[j], vin_norm: ownVin, price: 32000, _usd: 32000, rtitle: ownTitle, raw_title: ownTitle }; }
  return rows;
};
const P911 = [["Carrera", 30000, 14], ["Carrera 4", 38000, 8], ["Carrera 4S", 50000, 9], ["Turbo", 90000, 17]];
const VIN = "WP0AA29962S621698", TITLE = "2002 Porsche 911 Carrera 4S Coupe 6-Speed";
const env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 0, poolSeed: { rows } });
// one fixture: the car the page sends (decode facts), what the archive holds for the exact VIN, the seeded pool, and what must happen
async function run(f) {
  const rows = f.rows, veh = { year: f.year, make: f.make, model: f.model, nameModel: f.model, trim: f.decodeTrim || null, bodyStyle: f.decodeBody || null, vin: f.vin, raw: f.vin };
  const plan = await A.vinSearchPlan(veh, { resolveVehicle: V.resolveVehicle, archive: f.archive || null, live: f.live || null });
  if (!plan || plan.unresolved) return { plan };
  const go = async (rf, o) => E.withReadFields((await E.oneEngineAnswer(plan.vehicle, null, plan.text, { ...env(rows), asked: o && o.openWhole ? 9 : 0 }, rf && Object.keys(rf).length ? rf : null)).raw, plan.text, plan.vehicle);
  const first = await go({}, {}), out = A.applyVinOverlay(await settle(first, plan.ctx, go), plan.ctx);
  // the bug as it was: the typed car of the VIN's year, make and model alone, asked the question
  const bareText = A.typedWordsFor(veh), bareV = (await V.resolveVehicle(bareText, {})).vehicle, typed = E.withReadFields((await E.oneEngineAnswer(bareV, null, bareText, env(rows), null)).raw, bareText, bareV);
  return { plan, typed, out };
}
const labels = (d, dim) => (dim === "body" ? (d.bodyOptions || []) : (d.trimOptions || [])).map(o => (o && typeof o === "object" ? o.label : o));
const rep = (t, base, n, y, mk_, mo_, vin) => [...Array(n)].map((_, i) => mk(t.replace(/\W/g, "") + i, y, mk_, mo_, `${y} ${mk_} ${mo_} ${t}`, base + i * 700, i, vin && i === 0 ? vin : null));
const MUST = vin => [...rep("GT Fastback", 60000, 10, 1965, "Ford", "Mustang", vin), ...rep("Shelby GT350 Fastback", 450000, 8, 1965, "Ford", "Mustang"), ...rep("Coupe", 26000, 12, 1965, "Ford", "Mustang")];
const F = [
  { n: "the live find: 2002 911, decode trim Carrera 4S and the archive sale of this VIN", year: 2002, make: "Porsche", model: "911", vin: VIN, decodeTrim: "Carrera 4S", decodeBody: "coupe", archive: { trim: "Carrera 4S 6-Speed", displayName: TITLE }, rows: pool(2002, "Porsche", "911", P911, VIN, TITLE, "Carrera 4S"), settled: "Carrera 4S" },
  { n: "the decode names no trim, the archive sale of the VIN does", year: 2002, make: "Porsche", model: "911", vin: VIN, decodeTrim: null, archive: { trim: "Carrera 4S 6-Speed", displayName: TITLE }, rows: pool(2002, "Porsche", "911", P911, VIN, TITLE, "Carrera 4S"), settled: "Carrera 4S" },
  { n: "the REAL decode of the case VIN says Trim \"Carrera (2WD + 4WD)\" (a family word) and the car's live listing says Carrera 4S: the live title settles it, never the plain Carrera", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S621698", decodeTrim: "Carrera", archive: null, live: { title: "2002 Porsche 911 Carrera 4S Coupe 6-Speed" }, rows: pool(2002, "Porsche", "911", P911), settled: "Carrera 4S" },
  { n: "the real decode alone (\"Carrera\", no record, no live listing): it rules out the Turbo and asks among the Carrera trims, never settles on the plain Carrera", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600009", decodeTrim: "Carrera", archive: null, rows: pool(2002, "Porsche", "911", P911), asks: "trim", chips: ["Carrera", "Carrera 4", "Carrera 4S"], narrowed: true },
  { n: "the VIN has never sold, the decode names the trim", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600001", decodeTrim: "Carrera 4S", archive: null, rows: pool(2002, "Porsche", "911", P911), settled: "Carrera 4S" },
  { n: "a 911 Turbo: the trim word is also a longer trim's word, the exact trim wins", year: 2002, make: "Porsche", model: "911", vin: "WP0AB29962S680001", decodeTrim: "Turbo", archive: null, rows: pool(2002, "Porsche", "911", [...P911, ["Turbo S", 120000, 6]]), settled: "Turbo" },
  { n: "the decode and the archive say nothing about the trim: the trim is asked, alone, with the reason", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600002", decodeTrim: null, archive: null, rows: pool(2002, "Porsche", "911", P911), asks: "trim", chips: ["Carrera", "Carrera 4", "Carrera 4S", "Turbo"] },
  { n: "the decode gives a word no option carries (\"Base\"): not proof of anything, the trim is asked with the reason", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600003", decodeTrim: "Base", archive: null, rows: pool(2002, "Porsche", "911", P911), asks: "trim", chips: ["Carrera", "Carrera 4", "Carrera 4S", "Turbo"] },
  { n: "the decode gives only the family word (Carrera) and the options hold two Carrera trims: only those two are listed, never the Turbo", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600004", decodeTrim: "Carrera", archive: null, rows: pool(2002, "Porsche", "911", [["Carrera 4", 38000, 8], ["Carrera 4S", 50000, 9], ["Turbo", 90000, 17]]), asks: "trim", chips: ["Carrera 4", "Carrera 4S"], narrowed: true },
  { n: "the archive sale names a trim no option carries (a GT2): no list of other trims is shown, the whole car is read", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600005", decodeTrim: null, archive: { trim: "GT2", displayName: "2002 Porsche 911 GT2" }, rows: pool(2002, "Porsche", "911", P911, "WP0AA29962S600005", "2002 Porsche 911 GT2", "Carrera 4S"), whole: true },
  { n: "an older car with a chassis number, not a decodable VIN: the archive title settles the body (1965 Mustang Fastback, a stored-question car)", year: 1965, make: "Ford", model: "Mustang", vin: "5F09A100001", decodeTrim: null, archive: { trim: null, displayName: "1965 Ford Mustang Fastback" }, rows: MUST("5F09A100001"), dim: "body", settled: "Fastback", minCluster: 50000 },
  { n: "an older car with a chassis number and no archive record: the body is asked, alone, with the reason", year: 1965, make: "Ford", model: "Mustang", vin: "5F09A100002", decodeTrim: null, archive: null, rows: MUST(null), dim: "body", asks: "body", chips: ["Coupe", "Fastback"] },
  { n: "a VIN for a car with no sales at all: no question is made up, nothing changes", year: 2002, make: "Porsche", model: "911", vin: "WP0AA29962S600006", decodeTrim: "Carrera 4S", archive: null, rows: [], none: true }
];
for (const f of F) {
  const r = await run(f);
  if (!r.typed) { ok(`${f.n}: the VIN names a car`, false, JSON.stringify(r.plan && r.plan.line)); continue; }
  const { typed, out } = r;
  const dim = f.dim || "trim";
  if (f.settled) {
    ok(`${f.n}: the typed car would have asked (the bug is reproduced)`, typed.tier === `${dim}_choice`, typed.tier);
    ok(`${f.n}: the VIN settles the ${dim}, no question is asked`, !/_choice$/.test(String(out.tier)) && !out.trimChips && Array.isArray(out.vinSettled) && out.vinSettled.some(s => s.dimension === dim && s.label === f.settled), `${out.tier} ${JSON.stringify(out.vinSettled)}`);
    ok(`${f.n}: it reads ${f.settled} sales, not the whole car's (cluster starts above ${f.minCluster || 40000})`, out.tier === "result" && Array.isArray(out.cluster) && out.cluster[0] > (f.minCluster || 40000), JSON.stringify(out.cluster));
  } else if (f.asks) {
    ok(`${f.n}: still a question, about the ${f.asks} only`, out.tier === `${f.asks}_choice` && out.vinSettled === undefined, out.tier);
    ok(`${f.n}: the engine says why in a plain line, and the prompt the page prints starts with it`, typeof out.vinAskLine === "string" && /^The VIN /.test(out.vinAskLine) && String(out.prompt).startsWith(out.vinAskLine) && !/[–—]/.test(out.vinAskLine), out.vinAskLine);
    ok(`${f.n}: the chips are exactly ${f.chips.join(", ")}`, JSON.stringify(labels(out, dim)) === JSON.stringify(f.chips), JSON.stringify(labels(out, dim)));
    if (f.narrowed) ok(`${f.n}: the chips list no trim the VIN rules out`, !labels(out, dim).includes("Turbo") && /narrows/.test(out.vinAskLine));
  } else if (f.whole) {
    ok(`${f.n}: no question, no chips of other trims`, !/_choice$/.test(String(out.tier)) && !out.trimChips, out.tier);
    ok(`${f.n}: said as a fact of the answer (vinSettled names the trim and where it came from)`, Array.isArray(out.vinSettled) && out.vinSettled.some(s => s.dimension === "trim"), JSON.stringify(out.vinSettled));
  } else if (f.none) {
    ok(`${f.n}: no question was made up, no settle fields`, !/_choice$/.test(String(out.tier)) && out.vinSettled === undefined && out.vinAskLine === undefined, out.tier);
  }
}
// invalid VIN and a plain typed search
{ const p = await A.vinSearchPlan({ vin: "1ABCDEFGHJKLMNPRS", raw: "1ABCDEFGHJKLMNPRS" }, { resolveVehicle: V.resolveVehicle, archive: null }); ok("an invalid VIN names no car and says so (unchanged)", !!p && p.unresolved === true && /does not name a car/.test(p.line)); }
ok("a typed search is not a VIN search (unchanged)", (await A.vinSearchPlan({ year: 2002, make: "Porsche", model: "911" }, { resolveVehicle: V.resolveVehicle })) === null);
// the other question tiers, one rule: settled from the VIN, else asked alone
if (E.settleQuestionFromVin) {
  const body = { tier: "body_choice", bodyOptions: ["Coupe", "Cabriolet", "Targa"] }, gear = { tier: "gearbox_choice", gearboxOptions: ["Manual", "Automatic"] };
  const bs = vf => E.settleQuestionFromVin(body, vf), gs = vf => E.settleQuestionFromVin(gear, vf);
  ok("body: the decode's body style settles it", (x => x && x.settled && x.refine.body === "cabriolet")(bs({ year: 2002, decodeBody: "cabriolet" })));
  ok("body: the archive title settles it when the decode is silent", (x => x && x.settled && x.refine.body === "targa")(bs({ year: 2002, archiveTitle: "2002 Porsche 911 Targa 6-Speed" })));
  ok("body: no body fact asks the body alone", (x => x && x.settled === false && x.keep === null)(bs({ year: 2002 })));
  ok("body: a body no option carries rules every option out", (x => x && x.settled === false && Array.isArray(x.keep) && x.keep.length === 0)(bs({ year: 2002, archiveTitle: "2002 Porsche 911 Speedster" })));
  ok("gearbox: the archive record's gearbox settles it", (x => x && x.settled && x.refine.tx === "manual")(gs({ archiveTitle: "2002 Porsche 911 Carrera 6-Speed", archiveTx: "Manual (6-speed)" })));
  ok("gearbox: no gearbox fact asks the gearbox alone", (x => x && x.settled === false && x.keep === null)(gs({})));
  ok("a tier that is not a trim, body or gearbox question is not touched", E.settleQuestionFromVin({ tier: "result" }, { decodeTrim: "X" }) === null && E.settleQuestionFromVin({ tier: "generation_choice", generationOptions: [] }, { decodeTrim: "X" }) === null);
}
// the wiring: Market Check settles the VIN car before it answers, and the partner demo hands over the VIN's facts
{ const fs = await import("node:fs"); const sd = fs.readFileSync(path.join(root, "api/sellerDecision.js"), "utf8"), pa = fs.readFileSync(path.join(root, "api/partnerAnswer.js"), "utf8");
  ok("api/sellerDecision.js settles a VIN car's question before the VIN overlay", /settleVinAnswer\(oneBox, vinCtx/.test(sd) && sd.indexOf("settleVinAnswer(oneBox, vinCtx") < sd.indexOf("if (vinCtx) oneBox = applyVinOverlay(oneBox, vinCtx)"));
  ok("api/sellerDecision.js reads the archive record of the exact VIN for the plan", /findVinArchiveMatch\(\{ supabaseUrl, supabaseKey \}, \{ vin: vehicle\.vin \|\| vehicle\.chassis \}\)/.test(sd) && /vinSearchPlan\(vehicle, \{ resolveVehicle, archive: vinArchive, live: vinLive \}\)/.test(sd));
  ok("the partner demo passes the VIN's facts to the engine's read", /marketCheckAnswer\(req, text, refine, asked, true, vinFacts\)/.test(pa) && /vinFacts/.test(sd)); }
console.log(fail ? `vinSettleCheck: ${fail} failure(s)` : "vinSettleCheck: all pass");
process.exit(fail ? 1 : 0);
