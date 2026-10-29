// THE SELL FLOW NEVER ENDS ON THE WATCH LINE ALONE, AND A SEARCH NEVER HANGS WITHOUT END (Lane B, Oct 29 2026, Sam's live 2004 Porsche 911 Carrera, signed out).
// WHAT HE SAW: (1) the Sell questions ended on "When the next 2004 Porsche 911 Carrera sells, Sam will email you ... Have Sam keep looking" with no answer, range or reason; (2) a new search for the same car showed "One moment. Reading the sales" with a bar that never
// finished, then fell back to the first page.
// CAUSE: (1) lib/sell/sellFlow.js buildRange returned { marketAnswer: null } whenever the engine's answer was not a result card, a builder refusal, a thin/refusal card or a generation/body question: nothing back (the engine threw or was cut), a tier Sell has no
// card for (not_tracked, unavailable, a trim, documented-history, variant or model question), so public/js sell client lib/sell/sellMcClient.js saw no marketAnswer, called failed(), and OBX.renderCouldNot(null) drew only the Have Sam keep looking card with no sentence.
// (2) sellMcClient.js api() was a bare fetch with no deadline and the waiting screen "goes on" after "This one is taking longer than usual": nothing ended it; a dropped call or a non-JSON 504 ended in the same sentence-less card.
// FIX: buildRange's answer is always a refusal, a card with a line (noRange), a question or a range card (rangeFromAnswer); anything else is a plain sentence from the engine's reason table; the engine races SELL_ENGINE_MS (45 s) and the compute finishes behind the response;
// a question Sell cannot show is answered by the pooled read; the client has a 60 s deadline and prints the server's (or the page's configured) engine sentence on every failure, beside the search box and Have Sam keep looking.
// This check: (a) every kind of engine answer gives an ending with a sentence or a card, never bare; (b) 44 cars across Porsche, BMW, Mercedes, Chevrolet, Ford, Land Rover and Toyota (coupes, cabriolets, targas, no stored row) through the real range step; (c) a cut engine
// still ends on a sentence; (d) the client cannot wait for ever and always has a sentence.
//   node scripts/sellEndingCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const F = await import(pathToFileURL(path.join(root, "lib/sell/sellFlow.js")).href), SF = await import(pathToFileURL(path.join(root, "lib/sell/sellFacts.js")).href), C = await import(pathToFileURL(path.join(root, "lib/sell/sellMcClient.js")).href);
const ends = o => !!(o && (o.refusal || o.question || (o.noRange && (o.noRange.line || o.noRange.card)) || (o.marketAnswer && typeof o.marketAnswer === "object") || (o.error && o.couldNotLine)));
// (a) every kind of engine answer
const head = { label: "2004 Porsche 911 Carrera", make: "Porsche", state: "California", how: "self", rush: null };
const KINDS = [["nothing came back", null, { timedOut: false }], ["the engine was cut", null, { timedOut: true }], ["not_tracked", { tier: "not_tracked", samLine: "No sales of this car are tracked." }], ["unavailable", { tier: "unavailable" }], ["trim_choice", { tier: "trim_choice", prompt: "Which one?" }], ["dochistory_choice", { tier: "dochistory_choice", prompt: "x" }], ["variant_choice", { tier: "variant_choice", prompt: "x" }],
  ["model_choice", { tier: "model_choice", prompt: "x" }], ["gearbox_choice", { tier: "gearbox_choice", prompt: "x" }], ["generation_choice", { tier: "generation_choice", prompt: "Which?", generationOptions: [{ label: "996", query: "2004 Porsche 911 996" }] }], ["body_choice", { tier: "body_choice", prompt: "Which?", bodyOptions: ["Coupe", "Cabriolet"], resolvedCar: { year: 2004, make: "Porsche", model: "911" } }],
  ["builder refusal", { tier: "refusal", refusal: { kind: "builder_car" }, samLine: "A builder car." }], ["other refusal", { tier: "refusal", refusal: { kind: "spread" }, samLine: "Spread." }], ["thin", { tier: "thin", thinLine: "Six sales.", cards: [] }], ["result", { tier: "result", cluster: [30000, 40000], cards: [] }], ["a tier Sell has never heard of", { tier: "something_new" }]];
for (const [name, d, tm] of KINDS) {
  const first = { refusal: SF.refusalOf(d), question: SF.choiceOf(d), noRange: SF.noRangeOf(d) }, o = F.rangeFromAnswer(head, d, first, tm || {}, d && d.tier === "result" ? SF.cardAnswerOf(d) : null);
  ok(`engine answer "${name}": the range step ends on an answer, a card or a plain sentence`, ends(o) && !(o.marketAnswer === null), JSON.stringify(o).slice(0, 160));
  if (!o.marketAnswer && !o.refusal && !o.question) ok(`"${name}": the sentence is not empty`, !!(o.noRange && (o.noRange.line || o.noRange.card)) || !!o.couldNotLine, o.noRange && o.noRange.line);
}
// (b) 44 cars through the real range step (seeded pools: several bodies, so some answers are split, some thin, some results; no stored row exists for any)
const bodies = ["Coupe", "Cabriolet", "Targa", "Sedan"];
const CARS = [];
for (const [make, model, years] of [["Porsche", "911", [1986, 1995, 2004, 2011, 2019, 1973, 1999]], ["BMW", "M3", [1988, 2001, 2004, 2008, 2015, 1995]], ["Mercedes-Benz", "SL-Class", [1972, 1990, 2003, 2012, 1957]], ["Chevrolet", "Corvette", [1963, 1969, 1984, 1996, 2009, 2014]], ["Ford", "Mustang", [1965, 1969, 1987, 2003, 2013, 2020]], ["Land Rover", "Defender", [1985, 1997, 2008, 2013]], ["Toyota", "Supra", [1987, 1994, 2021]], ["Toyota", "Land Cruiser", [1968, 1982, 1998]]]) for (const y of years) CARS.push(`${y} ${make} ${model}`);
CARS.push("2004 Porsche 911 Carrera", "2004 Porsche 911 Carrera Cabriolet", "1986 Porsche 911 Carrera Targa");
const poolFor = text => { const m = /^(\d{4}) (\S+(?: \S+)?) (\S+(?: \S+)?)/.exec(text) || []; return Array.from({ length: 36 }, (_, i) => ({ id: "p" + i, price: 20000 + i * 900, _usd: 20000 + i * 900, auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: Number(m[1]) || 2000, make: "Porsche", model: "911", raw_title: `${text} ${bodies[i % 4]}`, rtitle: `${text} ${bodies[i % 4]}`, mileage: String(20000 + i * 3000), vin_norm: "VINSWEEP" + i, transmission: i % 2 ? "Manual" : "Automatic", image: "https://img.test/x.jpg", source: "bringatrailer", platform: "bringatrailer" })); };
let endedN = 0, bare = [], byKind = {};
for (const text of CARS) {
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", noStore: true, poolSeed: { rows: poolFor(text) } };
  const o = await F.buildRange(env, { carText: text, state: "California", how: "self", rush: null }).catch(e => ({ thrown: String(e && e.message || e) }));
  const kind = o.refusal ? "refusal" : o.question ? "question" : o.noRange ? "noRange:" + (o.noRange.kind || "") : o.marketAnswer ? "range card" : o.error ? "error+line" : "NOTHING";
  byKind[kind] = (byKind[kind] || 0) + 1; if (ends(o)) endedN++; else bare.push(text + " => " + JSON.stringify(o).slice(0, 80));
}
ok(`${CARS.length} cars through the range step: every one ends on a refusal, a card, a question, a range or a sentence`, endedN === CARS.length && CARS.length >= 40, `${endedN} of ${CARS.length}; ${JSON.stringify(byKind)}; bare: ${bare.slice(0, 3).join(" | ")}`);
// (c) a cut engine ends on a sentence, and nothing is stored
{ const real = globalThis.fetch; globalThis.fetch = async (u, i) => { await new Promise(r => setTimeout(r, 400)); return real(u, i); };   // a slow database: the engine cannot finish inside 5 ms
  const o = await F.buildRange({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", noStore: true, sellEngineMs: 5 }, { carText: "2004 Porsche 911 Carrera", state: "California", how: "self", rush: null }); globalThis.fetch = real;
  ok("an engine cut at the deadline ends on the engine's 'still being read' sentence, not on a bare watch line", !o.marketAnswer && !!(o.noRange && /still being read/.test(String(o.noRange.line))), JSON.stringify(o.noRange)); }
// (e) a stored row is read with a realistic cap: a 2 second cap dropped it under database load and sent the visit to a cold compute (the 2004 Porsche 911 Carrera had a fresh stored row)
{ const sb = fs.readFileSync("lib/sell/sellBlock.js", "utf8"), sf = fs.readFileSync("lib/sell/sellFlow.js", "utf8");
  ok("the stored answer and the stored block are read with STORED_READ_MS (8 s), not the 2 s piece cap", /readWarmAnswerDetailed\(env, key\), STORED_READ_MS/.test(sb) && (sf.match(/STORED_READ_MS\)/g) || []).length >= 2); }
// (d) the client
{ const src = C.SELL_MC_CLIENT;
  ok("every call to /api/sellChat has a deadline (AbortController) and catches a dropped or non-JSON answer", /AbortController/.test(src) && /waitMaxMs/.test(src) && /AbortError/.test(src) && /unreadable/.test(src));
  ok("the failed step prints a sentence: the server's couldNotLine, the noRange line, or the page's configured engine line", /function lineOf\(j\)/.test(src) && /couldNotLine: lineOf\(j\)/.test(src));
  ok("no failure path draws the watch card with nothing: renderCouldNot is never called with null", !/renderCouldNot\(null/.test(src));
  ok("the page is configured with the engine's lines and the wait limit", /couldNot:/.test(fs.readFileSync("api/sellNext.js", "utf8")) && /waitMaxMs/.test(fs.readFileSync("api/sellNext.js", "utf8")));
  ok("the server's catch sends the engine's line with the error", /couldNotLine: reasonLine\("cold\.missed"\)/.test(fs.readFileSync("api/sellChat.js", "utf8"))); }
console.log(fail ? `sellEndingCheck: ${fail} failure(s)` : "sellEndingCheck: all pass");
process.exit(fail ? 1 : 0);
