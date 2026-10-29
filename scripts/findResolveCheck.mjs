// A FIND CARD STANDS ON THE ANSWER OF ITS OWN SPEC, WHATEVER THE TYPED TEXT WOULD ASK (Lane B, Oct 29 2026, the live 1995 Porsche 911 Carrera Cabriolet card: Watertown NY, Manual, 102,000 miles).
// CAUSE: (1) the engine asks a question first for the spec's text (dochistory_choice here), so no Market Check row is stored for it; the Find ladder takes the pooled read (asked 2) and builds the CORE from that, but the card's option answer came
// only from the stored Market Check row. (2) That row, once a read behind the card wrote it at tier not_tracked, existed but held no options, so the card kept the CORE's own option lines (Manual 18, Tiptronic 13: written under older read-time rules,
// before the 24 month cap and the recount) beside the core's count line (23 sales since October 2025): 18 + 13 against 23, no matched option, no Find answer. FIX (lib/live/search.js serveSplitCard): a card stands on the spec's stored Market Check row only
// when it is a sales answer (result or thin); else on the spec's Find answer (FINDANS:, the pooled read the ladder takes, computed behind the response); a split core with neither prints NONE of its option numbers (pending: still reading, or, when the
// spec's read gives no sales answer, the engine's plain words "Sam cannot read the sales for this exact car yet, so no figures are shown.").
// CLASS: every *_choice kind (dochistory, trim, generation, body, gearbox, variant) the engine can ask first, with the real listing text of each. This check fails if a card shows an answer from a row other than its own spec's, or option numbers that
// do not add up (options over the answer's own total, outside an option's own window).
//   node scripts/findResolveCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
const OLD_PICK = "These sales split into options priced apart, so pick one to see its range.";
// real listings, one per question kind the engine asks first
const LISTINGS = [
  ["dochistory_choice", "1995 Porsche 911 Carrera Cabriolet", "Manual", "Convertible", 1995, "Porsche", "911", "manual"],
  ["trim_choice", "1999 Porsche 911 Carrera 4 Coupe 6-Speed", "Manual (6-speed)", "Coupe", 1999, "Porsche", "911", "manual"],
  ["generation_choice", "2004 BMW M3 Coupe", "Manual (6-speed)", "Coupe", 2004, "BMW", "M3", "manual"],
  ["body_choice", "1990 Porsche 911 Carrera 4", "Manual (5-speed)", null, 1990, "Porsche", "911", "manual"],
  ["gearbox_choice", "2008 Porsche 911 Carrera S", "Manual (6-speed)", "Coupe", 2008, "Porsche", "911", "manual"],
  ["variant_choice", "1984 Land Rover Defender 110", "Manual (5-speed)", null, 1984, "Land Rover", "Defender", "manual"]
];
const pool = n => Array.from({ length: n }, (_, i) => ({ id: "r" + i, _usd: 30000 + i * 1100, year: 1995, auction_end_date: "2026-0" + (1 + (i % 8)) + "-10", rtitle: "x", raw_title: "x", transmission: i < 14 ? "Manual" : "Tiptronic" }));
const optsOf = dim => [{ dimension: dim, label: dim === "gearbox" ? "Manual" : "Coupe", value: dim === "gearbox" ? "manual" : "coupe", n: 14, low: 52000, high: 88000, rangeFloor: false, ownWindow: false, windowWords: "since October 2025" }, { dimension: dim, label: dim === "gearbox" ? "Tiptronic" : "Cabriolet", value: dim === "gearbox" ? "auto" : "cabriolet", n: 9, low: 41000, high: 61000, rangeFloor: false, ownWindow: false, windowWords: "since October 2025" }];
const answer = (kind) => ({ tier: "result", poolN: 23, rawPool: pool(23), cluster: null, optionsState: "split", headlineDimension: "gearbox", options: optsOf("gearbox"), windowWords: "since October 2025", thinReason: "pooled_apart", thinLine: OLD_PICK, resolvedCar: { year: 1995 }, escalatedFrom: { tier: kind } });
// the core as it was stored: option lines under older rules (18 and 13 against a count of 23), the old sentence, the count line
const CORE = { v: 13, engineVersion: "e99-20261028-trimfix", kind: "count", count: 23, window: "since October 2025", optionsState: "split", optionLines: ["Manual $57,000 to $92,500, 18 sales", "Tiptronic $48,000 to $65,500, 13 sales"], thinReason: "pooled_apart", thinLine: OLD_PICK, countLine: "23 sales since October 2025.", answerLine: OLD_PICK, family: "1995 911 Carrera cars" };
const linesOf = mk => [...(mk.optionLines || []), mk.countLine, mk.answerLine, ...((mk.findAnswer && mk.findAnswer.lines) || []), mk.optionsRemainder && mk.optionsRemainder.line].filter(x => typeof x === "string" && x);
const sumN = mk => (Array.isArray(mk.options) ? mk.options : []).filter(o => !o.windowDiffers).reduce((t, o) => t + (Number(o.n) || 0), 0);
for (const [kind, title, tx, body, year, make, model, gb] of LISTINGS) {
  const row = { listing_title: title, transmission: tx, body, year, make, model }, facts = { miles: 102000, gearbox: gb, priceUsd: 70000 }, spec = { v: { year, make, model }, generation: null, title, key: "k-" + kind };
  const label = `${kind} [${title}]`;
  // 1. the stored Market Check row is a not_tracked row, the spec's Find answer is not computed yet: no card from the stale core's numbers
  const p = S.serveSplitCard(CORE, { tier: "not_tracked" }, null, row, facts, spec);
  ok(`${label}: a not_tracked row and no Find answer yet: the card is pending, no option numbers from the core`, p.pending === true && p.mk === null);
  // 2. the spec's Find answer exists: the card stands on it (its numbers, its option for the listing, nothing from the old core lines)
  const f = S.serveSplitCard(CORE, { tier: "not_tracked" }, answer(kind), row, facts, spec), L = f.mk ? linesOf(f.mk).join(" | ") : "";
  ok(`${label}: with the spec's Find answer the card stands on that answer, not the core's old lines`, !!f.mk && !/\b18 sales\b|\b13 sales\b|\$57,000|\$48,000|\$65,500|\$92,500/.test(L), L);
  ok(`${label}: its own gearbox settles the option (Manual) and the card carries a Find answer`, !!f.mk && f.mk.matchedOption && f.mk.matchedOption.value === "manual" && !!f.mk.findAnswer, f.mk && JSON.stringify(f.mk.matchedOption && f.mk.matchedOption.value));
  ok(`${label}: the options add up to the answer's own total (${sumN(f.mk || {})} of 23)`, !!f.mk && sumN(f.mk) <= 23, L);
  ok(`${label}: no line says pick or choose`, !/\b(pick|choose)\b/i.test(L));
  // 3. the spec's own read gives no sales answer: the engine's plain words and no figures at all
  const u = S.serveSplitCard(CORE, null, { tier: "not_tracked" }, row, facts, spec), U = u.mk ? linesOf(u.mk).join(" | ") : "";
  ok(`${label}: a spec that cannot be read says so in the engine's words and shows no figures`, !!u.mk && /cannot read the sales for this exact car/.test(U) && !/\d/.test(U.replace(/this exact car/, "")), U);
  // 4. a plain range core (no options) is untouched: its own numbers stand
  const r = S.serveSplitCard({ ...CORE, kind: "range", low: 50000, high: 80000, optionsState: null, optionLines: null, countLine: "23 sales since October 2025.", answerLine: null }, null, null, row, facts, spec);
  ok(`${label}: a core with a range and no options stands on its own numbers`, !r.pending && !!r.mk && r.mk.kind === "range");
}
console.log(fail ? `findResolveCheck: ${fail} failure(s)` : "findResolveCheck: all pass");
process.exit(fail ? 1 : 0);
