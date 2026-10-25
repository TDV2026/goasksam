// IDENTITY PAGES, LOCAL (Lane B, Sam's order, Oct 15 2026, after the e53 blank pages): the SAME rule the live identity
// check proves, run against the code being pushed with no network and no database. Synthetic sold rows (titles naming
// Coupe, Convertible, Fastback, and some naming no body) go through the real buildResult (the bare page), the real
// bodyOptions, the real body-refined buildResult for every option (the page each option opens) and the real output
// gate (runOutputInvariants, the gate the shared entry applies on every product and the public API). Fails on an empty
// answer, a missing count, a gate refusal, an option whose page opens a different count, a zero-count option, or options
// that do not sum to Any. e53 would have failed here: its gate refused every bare page with no-body titles.
//   node scripts/identityLocalCheck.mjs
import { buildResult, runOutputInvariants, isQualifying, applyOutputGate, typedModelMismatch } from "../lib/onebox.js";

const now = Date.now(), DAY = 864e5;
const iso = days => new Date(now - days * DAY).toISOString();
let seq = 0;
// price + image: the typed path's qualifier (isQualifying) wants a sale price above the car floor and a photo; the stored
// body field is set to a DIFFERENT body on purpose (the Cars & Bids contradiction), so a typed body must ignore it.
const row = (make, model, year, title, usd, daysAgo) => ({ id: ++seq, _usd: usd, price: usd, image: "x", body: "sedan", raw_title: title, rtitle: title, make, model, year, auction_end_date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10), source: "bringatrailer", mods: "", transmission: "Manual (4-Speed)", mileage: String(40000 + seq * 100) });
const pool = (make, model, year, bodies, usdBase = 30000, ageBase = 0) => {
  const rows = []; let i = 0;
  for (const [word, n] of bodies) for (let k = 0; k < n; k++, i++) rows.push(row(make, model, year, `${year} ${make} ${model}${word ? " " + word : ""}${k % 3 === 0 ? " 4-Speed" : ""}`, usdBase + (i % 11) * 900, ageBase + 10 + (i * 7) % 300));
  return rows;
};
const CASES = [
  { name: "1965 Mustang: Convertible 33, Coupe 20, Fastback 12, four with no body word", make: "Ford", model: "Mustang", year: 1965, bodies: [["Convertible", 33], ["Coupe", 20], ["Fastback", 12], ["", 4]] },
  { name: "1969 Camaro: Coupe 17, Convertible 3, one with no body word (its page opens one card)", make: "Chevrolet", model: "Camaro", year: 1969, bodies: [["Coupe", 17], ["Convertible", 3], ["", 1]], usd: 50000 },
  { name: "1966 Thunderbird: Convertible 14, Coupe 24, Hardtop 9 (reads coupe), none without a body word", make: "Ford", model: "Thunderbird", year: 1966, bodies: [["Convertible", 14], ["Coupe", 24], ["Hardtop", 9]], usd: 20000 },
  { name: "1969 Camaro, e81: 8 sales in twelve months (Coupe 6, Convertible 2), more in months 13 to 24, so the body pages read 24 months", make: "Chevrolet", model: "Camaro", year: 1969, bodies: [["Coupe", 6], ["Convertible", 2]], older: [["Coupe", 4], ["Convertible", 7]], usd: 50000, expectLonger: true },
  { name: "1972 Corvette, e82: Body not stated has 1 sale in twelve months and 6 older than three years, so its page reads the ladder window (60 months)", make: "Chevrolet", model: "Corvette", year: 1972, bodies: [["Coupe", 9], ["Convertible", 9], ["", 1]], older: [["", 6]], olderAge: 1200, usd: 40000, expectFlags: ["unspecified"] },
  { name: "one body only (no options, nothing to sum)", make: "Acura", model: "NSX", year: 1995, bodies: [["", 15]], usd: 90000 }
];

let failed = 0;
const fail = (c, msg) => { failed++; console.log(`FAIL  ${c.name}: ${msg}`); };
for (const c of CASES) {
  const rows = pool(c.make, c.model, c.year, c.bodies, c.usd).concat(c.older ? pool(c.make, c.model, c.year, c.older, c.usd, c.olderAge || 380) : []);
  const vehicle = { make: c.make, model: c.model, trim: "", year: c.year, bodyStyle: null };
  const base = () => ({ resolvedCar: { make: c.make, model: c.model, year: c.year, trim: "", bodyStyle: null }, resolvedSpec: null, dedup: {}, vehicle, exactSale: null, inlineSplits: [] });
  const spec = { make: c.make, model: c.model, trim: "", year: c.year, bodyStyle: null, excludeVariants: [], genCode: null, subject: `${c.year} ${c.model}` };
  const chosen = () => ({ rows: rows.map(r => ({ ...r })), step: "base", windowLabel: "past year" });
  let d;
  try { d = buildResult(chosen(), base(), iso, spec, null); } catch (e) { fail(c, "bare buildResult threw " + e.message); continue; }
  if (!d || !d.tier) { fail(c, "empty bare answer"); continue; }
  const poolN = Number.isFinite(d.poolN) ? d.poolN : (d.rawPool || []).length;
  if (!(poolN >= 1)) { fail(c, "bare answer has no count"); continue; }
  const gateBare = runOutputInvariants(d, vehicle).filter(x => !x.ok);
  if (gateBare.length) { fail(c, "bare answer refused by the gate: " + gateBare.map(x => x.name + " (" + x.detail + ")").join("; ")); continue; }
  const opts = Array.isArray(d.bodyOptions) ? d.bodyOptions : [];
  const distinctBodies = c.bodies.filter(([w]) => w).length;
  if (distinctBodies >= 2 && !opts.length) { fail(c, "no body options on a pool with two or more bodies"); continue; }
  if (distinctBodies < 2 && opts.length) { fail(c, "options offered on a one-body pool"); continue; }
  if (!opts.length) { console.log(`PASS  ${c.name}: bare ${d.tier} ${poolN}, no options`); continue; }
  let sum = 0, ok = true;
  for (const o of opts) {
    if (!(Number(o.n) >= 1)) { ok = false; console.log(`      zero-count option ${o.label}`); }
    sum += Number(o.inPool) || 0;
    let pg;
    try { pg = buildResult(chosen(), base(), iso, spec, { body: o.value }); } catch (e) { ok = false; console.log(`      ${o.label}: page threw ${e.message}`); continue; }
    const opened = pg && (Number.isFinite(pg.poolN) ? pg.poolN : (pg.rawPool || []).length);
    const cards = pg && Array.isArray(pg.cards) ? pg.cards.length : null;
    const gate = pg ? runOutputInvariants(pg, { ...vehicle, bodyStyle: o.value === "unspecified" ? null : o.value }).filter(x => !x.ok) : [{ name: "no answer" }];
    const bodyNull = o.value === "unspecified" ? (pg && pg.resolvedCar && pg.resolvedCar.bodyStyle == null) : true;
    const opensN = Number(o.opens ?? o.n), same = opened === opensN && cards === opensN;
    if (!same || gate.length || !bodyNull) { ok = false; console.log(`      ${o.label} (${o.n}) opens ${opened} with ${cards} card(s)${gate.length ? ", gate: " + gate.map(x => x.name).join(",") : ""}${bodyNull ? "" : ", bodyStyle not null on Body not stated"}`); }
    // TYPED = CHIP (Sam, Oct 15 2026, option 2): typing the body word ("1965 Ford Mustang coupe" -> spec.bodyStyle) must
    // qualify exactly the rows the chip opens: one classifier, title words only, no stored field, no default body.
    if (o.value !== "unspecified") {
      const typed = rows.filter(r => isQualifying(r, { ...spec, bodyStyle: o.value })).length;
      if (typed !== Number(o.opens ?? o.n)) { ok = false; console.log(`      typed "${o.value}" qualifies ${typed} rows, the chip opens ${o.opens ?? o.n}`); }
    }
  }
  if (c.expectLonger) {
    const flagged = opts.filter(o => o.windowLonger === true);
    if (flagged.length !== opts.length || !flagged.every(o => o.windowMonths === 24 && /^Based on \w+ sales over the last 24 months\.$/.test(o.windowNote || "") && o.opens > o.inPool && o.n === o.inPool)) { ok = false; console.log(`      expected every option flagged windowLonger with 24 months: ${JSON.stringify(opts)}`); }
    // the check must not be weakened: the same answer with the flags stripped (options that read a longer window without saying so) is still refused
    const stripped = { ...d, bodyOptions: opts.map(({ windowLonger, windowMonths, windowNote, ...o }) => o) };
    const refused = runOutputInvariants(stripped, vehicle).filter(x => !x.ok).map(x => x.name);
    if (!refused.includes("identity_options_sum_to_pool")) { ok = false; console.log("      an unflagged option that opens more than its share was NOT refused"); }
  } else if (c.expectFlags) {
    const got = opts.filter(o => o.windowLonger === true).map(o => o.value).sort().join(","), want = c.expectFlags.slice().sort().join(",");
    if (got !== want) { ok = false; console.log(`      flagged ${got || "none"}, expected ${want}: ${JSON.stringify(opts)}`); }
  } else if (opts.some(o => o.windowLonger)) { ok = false; console.log("      an option is flagged windowLonger on a pool where every page reads the same window"); }
  const covered = opts.some(o => o.value === "unspecified");
  const total = sum + (covered ? 0 : (Number(d.bodyUnspecified) || 0));
  if (total !== poolN) { ok = false; console.log(`      options sum ${sum}${covered ? "" : " + unspecified " + (d.bodyUnspecified || 0)} != Any ${poolN}`); }
  const noBody = c.bodies.find(([w]) => !w);
  if (noBody && noBody[1] > 0 && !covered) { ok = false; console.log(`      ${noBody[1]} row(s) with no body word are in no option (silent gap)`); }
  if (ok) console.log(`PASS  ${c.name}: bare ${d.tier} ${poolN}; ${opts.map(o => `${o.label} ${o.n}`).join(", ")} = ${sum}; typed body words qualify the chip's rows`);
  else failed++;
}
// e81: a "could not verify" refusal is never stored as a finished answer (the next search recomputes); a plain "too spread out" refusal still is.
{
  const { answerCacheable } = await import("../lib/live/search.js");
  const base = { tier: "refusal", fallbackRung: "exact", rungLabel: "x", poolN: 0, cards: [] };
  const a = answerCacheable({ ...base, refusal: { kind: "invariant_failed", failedChecks: ["identity_options_sum_to_pool"] } });
  const b = answerCacheable({ ...base, refusal: { kind: "too_spread_out" } });
  if (a !== false) { failed++; console.log("FAIL  an invariant_failed refusal is storable"); } else console.log("PASS  an invariant_failed refusal is never stored");
  if (b !== true) { failed++; console.log("FAIL  an ordinary refusal stopped being storable"); } else console.log("PASS  an ordinary refusal is still stored");
}
// e82 FALLBACK (Sam's launch gate: every car returns a range): a chip check that fails drops the chips and keeps the range; a non-chip failure still refuses.
{
  const c = CASES[3], rows = pool(c.make, c.model, c.year, c.bodies, c.usd).concat(pool(c.make, c.model, c.year, c.older, c.usd, 380));
  const vehicle = { make: c.make, model: c.model, trim: "", year: c.year, bodyStyle: null };
  const base = { resolvedCar: { make: c.make, model: c.model, year: c.year, trim: "", bodyStyle: null }, resolvedSpec: null, dedup: {}, vehicle, exactSale: null, inlineSplits: [] };
  const spec = { make: c.make, model: c.model, trim: "", year: c.year, bodyStyle: null, excludeVariants: [], genCode: null, subject: `${c.year} ${c.model}` };
  const d = buildResult({ rows: rows.map(r => ({ ...r })), step: "base", windowLabel: "past year" }, base, iso, spec, null);
  const broken = { ...d, bodyOptions: d.bodyOptions.map(({ windowLonger, windowMonths, windowNote, ...o }) => o) };   // chips that open more than their share, unflagged
  const gated = applyOutputGate(broken, vehicle, "fallback test");
  if (!(gated.tier === d.tier && gated.chipFallback && gated.bodyOptions === null && gated.cluster && gated.cluster[0] === d.cluster[0] && Array.isArray(gated.cards) && gated.cards.length === d.cards.length)) { failed++; console.log("FAIL  a failed chip check did not keep the range: " + JSON.stringify({ tier: gated.tier, fb: !!gated.chipFallback, opts: gated.bodyOptions })); }
  else console.log(`PASS  a failed chip check drops the chips and keeps the range (${gated.chipFallback.failedChecks.join(", ")}; cluster ${JSON.stringify(gated.cluster)}, ${gated.cards.length} cards)`);
  const bad = applyOutputGate({ ...d, qualifyingTotal: Number(d.qualifyingTotal) + 5 }, vehicle, "non-chip failure test");
  if (bad.tier !== "refusal") { failed++; console.log("FAIL  a non-chip failure no longer refuses"); } else console.log("PASS  a non-chip failure still refuses");
  const { answerCacheable } = await import("../lib/live/search.js");
  if (answerCacheable(gated) !== false) { failed++; console.log("FAIL  a chip-fallback answer is storable"); } else console.log("PASS  a chip-fallback answer is never stored");
}
// e82: the same words in another order are the same car (the 1972 K5 Blazer), and a typed "trim" that is the car's own chassis code is honoured (the 1985 Toyota AE86).
{
  const m1 = typedModelMismatch("1972 chevrolet k5 blazer", { make: "Chevrolet", model: "Blazer", trim: "K5" });
  if (m1) { failed++; console.log("FAIL  k5 blazer typed, resolved Blazer K5: " + JSON.stringify(m1)); } else console.log("PASS  the K5 Blazer typed in the other word order is not a model mismatch");
  const c = CASES[0], rows = pool(c.make, c.model, c.year, c.bodies, c.usd);
  const vehicle = { make: "Toyota", model: "Corolla", trim: "AE86", year: 1985, bodyStyle: null };
  const d0 = buildResult({ rows: rows.map(r => ({ ...r })), step: "base", windowLabel: "past year" }, { resolvedCar: { make: c.make, model: c.model, year: c.year, trim: "", bodyStyle: null }, resolvedSpec: null, dedup: {}, vehicle, exactSale: null, inlineSplits: [] }, iso, { make: c.make, model: c.model, trim: "", year: c.year, bodyStyle: null, excludeVariants: [], genCode: null, subject: "x" }, null);
  const test = gen => runOutputInvariants({ ...d0, rungLabel: "1985 Corolla", scopeLabel: "1985 Corolla", fallbackRung: "exact", resolvedCar: { ...d0.resolvedCar, trim: "", genCode: gen } }, vehicle).filter(x => x.name === "typed_words_honoured_or_wider");
  const yes = test("AE86"), no = test("AE92");
  if (!(yes.length && yes[0].ok)) { failed++; console.log("FAIL  AE86 as the generation code is not honoured"); } else console.log("PASS  a typed trim equal to the generation code is honoured");
  if (no.length && no[0].ok) { failed++; console.log("FAIL  a trim the answer never names was honoured"); } else console.log("PASS  a trim the answer never names is still judged as before");
}
console.log(failed ? `\nidentityLocalCheck: ${failed} case(s) FAILED.` : "\nidentityLocalCheck: every option equals its page and the options sum to Any, on the code being pushed.");
process.exit(failed ? 1 : 0);
