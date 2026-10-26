// The Singer answer carries no "Sam didn't use 'by' or 'singer'" line (e90, Oct 25 2026). Offline: the real resolver and the real
// engine wrapper on an empty archive; the Singer rule answers before any sale is read.
//   node scripts/singerLeftoverCheck.mjs [repo root]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const imp = f => import(pathToFileURL(path.join(root, f)).href);
globalThis.fetch = async () => new Response("[]", { status: 200 });
const { resolveVehicle } = await imp("lib/vehicle.js");
const { oneEngineAnswer, BUILDER_CAR_LINE } = await imp("lib/onebox.js");
const UW = await imp("lib/live/unusedWords.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const answer = async text => { const r = await resolveVehicle(text, {}); const a = await oneEngineAnswer(r.vehicle, null, text, env, null); return { v: r.vehicle, raw: a && a.raw ? a.raw : a, corrections: r.corrections }; };
const S = "1992 Porsche 911 Carrera 4 by Singer";
const s = await answer(S);
ok("Singer: the answer is the builder-car refusal with Sam's sentence, unchanged", s.raw.refusal && s.raw.refusal.kind === "builder_car" && s.raw.samLine === BUILDER_CAR_LINE, s.raw.samLine);
ok("Singer: the sentence is the approved one", BUILDER_CAR_LINE === "Singer cars are not compared with standard 911s, so Sam shows no range for this car.");
ok("Singer: the typed words do leave 'by' and 'singer' over (this is what printed the line)", JSON.stringify(UW.unusedWordsOf(S, s.v, s.corrections).unused) === JSON.stringify(["by", "singer"]));
ok("Singer: no leftover-word line is added above the refusal", typeof UW.unusedFieldsFor === "function" && Object.keys(UW.unusedFieldsFor(S, s.v, s.raw)).length === 0);
const M = "2004 Porsche 911 carrera gt";
const mv = (await resolveVehicle(M, {})).vehicle;
const mism = (await imp("lib/onebox.js")).typedModelMismatch(M, mv);
ok("typed model naming another car: the engine's own guard reads the typed words as a different car", !!mism && mism.namesModel === "Carrera GT", JSON.stringify(mism));
// the guard needs sales to fire, so its refusal is built here exactly as the engine builds it (lib/onebox.js, TYPED-MODEL GUARD)
const mr = { tier: "refusal", refusal: { kind: "invariant_failed", failedChecks: ["typed_model_mismatch"], typed: mism && mism.typed, namesModel: mism && mism.namesModel }, samLine: "Sam could not verify this one, so no figures are shown." };
ok("typed model naming another car: the typed words leave a word over, and no line is added above that refusal", UW.unusedWordsOf(M, mv, null).unused.length > 0 && typeof UW.unusedFieldsFor === "function" && Object.keys(UW.unusedFieldsFor(M, mv, mr)).length === 0, JSON.stringify(UW.unusedWordsOf(M, mv, null).unused));
const P = "1999 Porsche 911 Carrera zorp";
const p = await resolveVehicle(P, {});
ok("any other answer keeps the line exactly as before", typeof UW.unusedFieldsFor === "function" && UW.unusedFieldsFor(P, p.vehicle, { tier: "result" }).unusedLine === UW.unusedWordsOf(P, p.vehicle, null).line && !!UW.unusedWordsOf(P, p.vehicle, null).line, UW.unusedWordsOf(P, p.vehicle, null).line);
const sd = fs.readFileSync(path.join(root, "api/sellerDecision.js"), "utf8");
ok("sellerDecision builds the line through unusedFieldsFor", /unusedFieldsFor\(/.test(sd) && !/unusedWordsOf\(/.test(sd));
process.exit(failed ? 1 : 0);
