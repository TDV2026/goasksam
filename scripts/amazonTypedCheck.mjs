// Sam (Oct 20 2026): "ensure that we can still type in any vin and any YMM". OFFLINE (no network, no env): the server
// side of the Amazon demo's typed matrix. For each kind of typed input, the engine answer it produces is run through the
// partner answer's own shaping (partnerShape) and the demo's case rule (demoAnswerCase), and must give a VISIBLE answer
// (a line, a range, a question with options, or sales), no error for an answerable car, and no price the engine did not
// print. It also proves a typed car never depends on the stored-answer list: demoKey refuses it, so the handler reads it
// live (the same path and timeout as before). The live page matrix (tabs a, b, c) is scripts/amazonDemoCheck.mjs.
const { partnerShape, refreshDemoAnswer, VIN_UNREADABLE_LINE } = await import("../api/partnerAnswer.js");
const { demoAnswerCase, OUT_OF_SCOPE_LINE } = await import("../lib/amazonDemoCase.js");
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const card = (price, date, title) => ({ price, date, mi: 41000, title, id: 7 });
const NOW = 2026;
// The typed matrix, each with the engine answer its kind produces (field names as the engine writes them).
const ROWS = [
  { typed: "WBSBF932XSEH00621", want: "answer", vinDecode: { year: 1995, make: "BMW", model: "M3" },
    d: { status: "one_box", tier: "result", cluster: [28000, 41000], poolN: 11, resolvedCar: { year: 1995, make: "BMW", model: "M3" }, cards: [card(35000, "2026-09-01", "1995 BMW M3 Coupe")] } },
  { typed: "WDDXJ8FB2FA010198", want: "out_of_scope", name: /2015 Mercedes-Benz S-Class/, identityNull: true, vinDecode: { year: 2015, make: "Mercedes-Benz", model: "S-Class", trim: "S550 4-MATIC" },
    d: { status: "one_box", tier: "thin", poolN: 6, thinLine: "Not enough sales of this exact car to give a reliable range. These are the sales we found.", cards: [card(45500, "2026-10-19", "2015 Mercedes-Benz S550 Coupe 4MATIC")] } },
  { typed: "WBSBF932XSEH006", want: "unreadable", direct: { ok: true, answerType: "vin_unreadable", line: VIN_UNREADABLE_LINE } },
  { typed: "1HGCM82633A004352 (decodes, no sales)", want: "no_sales", vinDecode: { year: 1999, make: "Honda", model: "Accord" },
    d: { status: "one_box", tier: "not_tracked", samLine: "We haven't tracked a 1999 Honda Accord sale yet.", resolvedCar: { year: 1999, make: "Honda", model: "Accord" } } },
  { typed: "1995 BMW M3", want: "answer",
    d: { status: "one_box", tier: "result", cluster: [28000, 41000], poolN: 11, resolvedCar: { year: 1995, make: "BMW", model: "M3" }, cards: [card(35000, "2026-09-01", "1995 BMW M3 Coupe")] } },
  { typed: "1967 Toyota 2000GT (thin)", want: "answer",
    d: { status: "one_box", tier: "thin", poolN: 45, thinLine: "Too few of these sales can be compared side by side to give a reliable range. These are the sales on record.", resolvedCar: { year: 1967, make: "Toyota", model: "2000GT" }, cards: [card(912000, "2026-03-12", "1967 Toyota 2000GT")] } },
  { typed: "2018 Toyota Camry", want: "out_of_scope", name: /2018 Toyota Camry/,
    d: { status: "one_box", tier: "result", cluster: [7000, 11500], poolN: 40, resolvedCar: { year: 2018, make: "Toyota", model: "Camry" }, cards: [card(8700, "2026-10-19", "2002 Toyota Camry Xle V6")] } },
  { typed: "1971 Mercedes 280SE", want: "answer", question: true,
    d: { status: "one_box", tier: "body_choice", prompt: "Which 280SE is it?", bodyOptions: ["Sedan", "Coupe", "Cabriolet"], resolvedCar: { year: 1971, make: "Mercedes-Benz", model: "280SE" } } },
  { typed: "Porsche 911", want: "answer", question: true,
    d: { status: "one_box", tier: "generation_choice", prompt: "Which generation is it?", generationOptions: [{ label: "991", query: "Porsche 991" }, { label: "992", query: "Porsche 992" }], resolvedCar: { make: "Porsche", model: "911" } } },
  { typed: "Porsche 911 under $1 (refusal)", want: "answer",
    d: { status: "one_box", tier: "refusal", samLine: "Those sales are too spread out to give a reliable range. These are the sales on record.", poolN: 9, resolvedCar: { year: 1989, make: "Porsche", model: "911" }, cards: [card(61000, "2026-05-01", "1989 Porsche 911 Carrera")] } },
  { typed: "a garbled clarification", want: "answer", question: true,
    d: { status: "needs_clarification", clarification: { question: "What year, make and model?", options: ["1995 BMW M3"] } } },
];
const visible = (out, c) => !!((c.line && String(c.line).trim()) || out.range || (out.question && (out.question.options || []).length) || (out.thin && String(out.thin).trim()) || (out.sales || []).length);
for (const r of ROWS) {
  let out;
  if (r.direct) out = r.direct;
  else { out = partnerShape(r.d, r.typed, 0, {}); if (r.vinDecode) { out.vinDecode = r.vinDecode; if (r.identityNull) out.identity = null; } }
  const c = demoAnswerCase(out, NOW);
  ok(out.ok !== false, `${r.typed}: no error (ok=${out.ok}, error=${out.error || "-"})`);
  ok(c.kind === r.want, `${r.typed}: case ${c.kind}, want ${r.want}`);
  ok(visible(out, c), `${r.typed}: a visible answer (line, range, question options, thin line or sales), case ${c.kind}`);
  if (r.name) ok(r.name.test(String(c.name || "")), `${r.typed}: the case carries the car's name (${c.name})`);
  if (c.kind === "out_of_scope") ok(c.line === OUT_OF_SCOPE_LINE, `${r.typed}: Sam's out-of-scope line`);
  if (r.question) ok(out.answerType === "identity_question" && out.question.options.length >= 1, `${r.typed}: asks the engine's question with its options`);
  // no invented price: a range only when the engine printed one, and exactly the engine's figures
  const printed = r.d && Array.isArray(r.d.cluster) ? r.d.cluster : null;
  ok(printed ? JSON.stringify([out.range.low ?? out.range[0], out.range.high ?? out.range[1]]) === JSON.stringify(printed) : !out.range, `${r.typed}: range ${JSON.stringify(out.range)} matches the engine's (${JSON.stringify(printed)})`);
  // a typed car is never served from (or dependent on) the stored-answer list: the handler reads it live
  const key = await refreshDemoAnswer(null, r.typed.replace(/ \(.*\)$/, ""));
  ok(key.why === "not a demo car", `${r.typed}: not in the stored-answer list, read live (${key.why})`);
}

// ---- THE HANDLER ITSELF (Lane C's R2-A look found two gaps the shaping rows could not see), offline: fetch is stubbed
// (the free decode answers from a fixed vPIC row; any other request fails, so nothing leaves this machine), no Supabase
// env, and a crew cookie minted with a test-only code set in this process.
{
  const { vinOfInput, vinCheckDigitOk } = await import("../api/partnerAnswer.js");
  // (2) a typed year, make and model is never a VIN, whatever its letters add up to; the VIN field always is
  for (const q of ["1971 Mercedes 280SE", "BMW M3 E30 1988", "1995 BMW M3", "Porsche 911", "2018 Toyota Camry"]) ok(!vinOfInput({ q }).vin && !vinOfInput({ q }).attempt, `"${q}": typed as words, read as a car, never a VIN or a VIN attempt`);
  ok(vinOfInput({ q: "WBSBF932XSEH00621" }).vin === "WBSBF932XSEH00621" && vinOfInput({ q: " WBSBF932XSEH00621 " }).vin === "WBSBF932XSEH00621", "a VIN typed as one token is a VIN");
  ok(vinOfInput({ vin: "WBS BF932X SEH00621" }).vin === "WBSBF932XSEH00621", "the VIN field strips spaces");
  ok(vinOfInput({ q: "WBSBF932XSEH006" }).attempt === "WBSBF932XSEH006", "a 15-character one-token run is a VIN attempt (the unreadable line)");
  // (3) the check digit
  for (const v of ["WBSBF932XSEH00621", "WDDXJ8FB2FA010198", "1HGCM82633A004352"]) ok(vinCheckDigitOk(v), `${v}: check digit adds up`);
  for (const v of ["WBSBF932XSEH0062Z", "WBSBF932XSEH00622", "1HGCM82633A004353"]) ok(!vinCheckDigitOk(v), `${v}: check digit fails`);
  process.env.CURTAIN_CREW_CODE = "amazon-typed-check-only";
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) delete process.env[k];
  const { mintCrewCookieValue } = await import("../lib/_crew.js");
  const cookie = "gas_crew=" + mintCrewCookieValue();
  const M3_ROW = { Make: "BMW", Model: "M3", ModelYear: "1995", Trim: "", DriveType: "RWD/Rear-Wheel Drive", EngineCylinders: "6", DisplacementL: "3.0" };
  const realFetch = globalThis.fetch; let outside = [];
  globalThis.fetch = async (url) => { const u = String(url); if (u.includes("vpic.nhtsa.dot.gov") && u.includes("/DecodeVinValues/WBSBF932XSEH")) return new Response(JSON.stringify({ Results: [M3_ROW] }), { status: 200 }); outside.push(u.slice(0, 80)); throw new Error("offline check: no network"); };
  const { default: handler } = await import("../api/partnerAnswer.js");
  const call = body => new Promise(resolve => { const res = { _s: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this._s = c; return this; }, json(j) { resolve({ status: this._s, j }); return this; }, send(x) { resolve({ status: this._s, j: x }); return this; }, end() { resolve({ status: this._s, j: null }); return this; } };
    Promise.resolve(handler({ method: "POST", headers: { host: "goasksam.com", cookie }, body }, res)).catch(e => resolve({ status: 0, j: { thrown: String(e && e.message || e) } })); });
  // gap 3: the real M3 VIN with its last character changed decodes as the M3 but fails its check digit
  let r = await call({ q: "WBSBF932XSEH0062Z" });
  ok(r.j && r.j.answerType === "vin_unreadable" && r.j.line === VIN_UNREADABLE_LINE && !r.j.range && !r.j.history, `WBSBF932XSEH0062Z (mistyped): the unreadable line, no range, no history (got ${r.j && (r.j.answerType || r.j.error)})`);
  ok(demoAnswerCase(r.j, NOW).kind === "unreadable", "WBSBF932XSEH0062Z: the page's case is unreadable, never the 1995 M3");
  r = await call({ vin: "WBSBF932XSEH0062Z" });
  ok(r.j && r.j.answerType === "vin_unreadable", "the same mistyped VIN in the VIN field: the unreadable line");
  // the real VIN still decodes and goes on to the engine (offline the engine read fails: the still-reading state, never unreadable)
  r = await call({ q: "WBSBF932XSEH00621" });
  ok(r.j && r.j.answerType !== "vin_unreadable" && !(r.j.question && /no recorded sales or listings for this VIN/.test(r.j.question.text || "")), `WBSBF932XSEH00621 (real): read on as the 1995 M3, not unreadable (got ${r.j && (r.j.answerType || r.j.error)}, query ${r.j && r.j.query})`);
  // gap 2: a typed year, make and model goes to the engine as text, never the VIN no-record line
  for (const q of ["1971 Mercedes 280SE", "BMW M3 E30 1988"]) {
    r = await call({ q });
    ok(r.j && r.j.answerType !== "vin_unreadable" && !(r.j.question && /for this VIN/.test(r.j.question.text || "")) && r.j.query === q && !r.j.vin, `"${q}": read as a car (query "${r.j && r.j.query}", ${r.j && (r.j.answerType || r.j.error)}), never the VIN line`);
  }
  // Sam's option A with Lane F's exception: an EXACT archive record is the proof a VIN is real. A stubbed archive (a fake
  // Supabase host answered by the stub, nothing leaves this machine) holds one sale under the check-digit-failing VIN.
  process.env.SUPABASE_URL = "https://stub.supabase.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-only";
  const ARCHIVE = { WBSBF932XSEH0062Z: [{ appearance_date: "2025-06-01", source: "bringatrailer", url: null, listing_title: "1995 BMW M3", make: "BMW", model: "M3", model_family: "M3", year: 1995, mileage: 88000, result: "sold", price_usd: 31000 }] };
  globalThis.fetch = async (url) => { const u = String(url);
    if (u.includes("vpic.nhtsa.dot.gov") && u.includes("/DecodeVinValues/WBSBF932XSEH")) return new Response(JSON.stringify({ Results: [M3_ROW] }), { status: 200 });
    if (u.startsWith("https://stub.supabase.invalid/")) { const m = /vin_index\?vin_norm=eq\.([A-Z0-9]+)/.exec(u); return new Response(JSON.stringify(m ? (ARCHIVE[m[1]] || []) : []), { status: 200, headers: { "content-type": "application/json" } }); }
    outside.push(u.slice(0, 80)); throw new Error("offline check: no network"); };
  r = await call({ q: "WBSBF932XSEH0062Z" });
  ok(r.j && r.j.answerType !== "vin_unreadable" && Array.isArray(r.j.history) && r.j.history.length === 1 && r.j.history[0].result === "sold" && r.j.history[0].price === 31000, `a RECORDED VIN whose check digit fails: read as that exact car with its own history (got ${r.j && (r.j.answerType || r.j.error)}, history ${JSON.stringify(r.j && r.j.history)})`);
  r = await call({ q: "WBSBF932XSEH0062Y" });
  ok(r.j && r.j.answerType === "vin_unreadable" && !r.j.history, `a mistyped VIN with NO record (the archive read, nothing found): the unreadable line (got ${r.j && (r.j.answerType || r.j.error)})`);
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  // (the engine's own name lookups for a typed car are blocked by the stub too; only a VIN DECODE of typed words is wrong)
  ok(!outside.some(u => /DecodeVinValues/.test(u)), `no VIN decode of a typed year, make and model (blocked outside lookups: ${outside.length}, none sent)`);
  globalThis.fetch = realFetch;
}
// the still-reading state (engine busy) is the plain retry state, not an error page
{ const out = partnerShape({ status: "one_box", tier: "unavailable", stillReading: true, samLine: "Still reading the sales.", retry: true, retryAfterMs: 4000 }, "1995 BMW M3", 0, {});
  ok(out.stillReading === true && out.line === "Still reading the sales." && demoAnswerCase(out, NOW).kind === "error", "engine busy: the still-reading state with the engine's own line and retry (the page's Try again)"); }
console.log(`amazonTypedCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
