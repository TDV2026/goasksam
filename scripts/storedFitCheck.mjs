// STORED FIT CHECK (Lane D, Nov 1 2026): the stored-answer read (lib/admin/storedFit.js, ops task storedfit) tells what the engine's STORED answer says and nothing else. Offline.
// The class: a missing stored row read as "the engine returns nothing". Nothing stored says nothing about the answer, so it is counted apart (no_row), never as nothing; and the read never computes or writes.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { storedFitOf, fitOfRaw, FITS } from "../lib/admin/storedFit.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const store = { "k:ok": { raw: { tier: "result", cluster: [1, 2] } }, "k:thin": { raw: { tier: "thin" } }, "k:nt": { raw: { tier: "not_tracked" } }, "k:ref": { raw: { tier: "refusal" } }, "k:odd": { raw: { tier: "unavailable" } } };
const cars = { "A": "ok", "B": "thin", "C": "nt", "D": "ref", "E": "odd", "F": "none", "G": "q" };
let reads = 0;
const deps = { resolve: async q => (q === "X" ? null : { q }), generationOf: async () => null, keyFor: v => "k:" + (cars[v.q] || "none"), readAnswer: async k => { reads++; return store[k] || { raw: null, reason: "no_row" }; }, questionKey: (k, q) => "q:" + q, readQuestion: async k => (k === "q:G" ? { raw: { tier: "q" } } : null) };
const r = await storedFitOf(["A", "B", "C", "D", "E", "F", "G", "X"], deps), f = Object.fromEntries(r.rows.map(x => [x.q, x.fit]));
ok(f.A === "range" && f.B === "thin" && f.C === "nothing" && f.D === "refusal" && f.G === "question" && f.X === "unresolved", "each stored shape maps to its own fit (" + JSON.stringify(f) + ")");
ok(f.F === "no_row", "a car with nothing stored is no_row, NOT nothing (" + f.F + ")");
ok(f.E === "no_row", "a stored shape that is not an answer (tier unavailable) is not counted as an answer (" + f.E + ")");
ok(r.counts.nothing === 1 && r.counts.no_row === 2 && FITS.reduce((n, k) => n + r.counts[k], 0) === 8, "the counts add up to the cars asked and keep nothing apart from no_row (" + JSON.stringify(r.counts) + ")");
ok(fitOfRaw(null) === "no_row" && fitOfRaw({}) === "no_row", "no answer at all is no_row");
const src = fs.readFileSync(path.join(ROOT, "lib/admin/storedFit.js"), "utf8"), task = (fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8").match(/if \(task === "storedfit"\) \{[\s\S]*?\n  \}\n/) || [""])[0];
ok(task.length > 200, "the storedfit task is in the ops endpoint");
ok(!/oneEngineAnswer|runOneBox|supabaseInsert|supabasePatch|writeWarm|markRecomputing|fetchOCD|ocd\b/i.test(src.replace(/\/\/.*$/gm, "") + task.replace(/\/\/.*$/gm, "")), "the fit read never runs the engine, writes a row or spends OldCarsData");
console.log(`storedFitCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
