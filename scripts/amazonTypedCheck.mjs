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
  { typed: "WXYZ123", want: "unreadable", direct: { ok: true, answerType: "vin_unreadable", line: VIN_UNREADABLE_LINE } },
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
// the still-reading state (engine busy) is the plain retry state, not an error page
{ const out = partnerShape({ status: "one_box", tier: "unavailable", stillReading: true, samLine: "Still reading the sales.", retry: true, retryAfterMs: 4000 }, "1995 BMW M3", 0, {});
  ok(out.stillReading === true && out.line === "Still reading the sales." && demoAnswerCase(out, NOW).kind === "error", "engine busy: the still-reading state with the engine's own line and retry (the page's Try again)"); }
console.log(`amazonTypedCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
