// IDENTITY PAGES, LOCAL (Lane B, Sam's order, Oct 15 2026, after the e53 blank pages): the SAME rule the live identity
// check proves, run against the code being pushed with no network and no database. Synthetic sold rows (titles naming
// Coupe, Convertible, Fastback, and some naming no body) go through the real buildResult (the bare page), the real
// bodyOptions, the real body-refined buildResult for every option (the page each option opens) and the real output
// gate (runOutputInvariants, the gate the shared entry applies on every product and the public API). Fails on an empty
// answer, a missing count, a gate refusal, an option whose page opens a different count, a zero-count option, or options
// that do not sum to Any. e53 would have failed here: its gate refused every bare page with no-body titles.
//   node scripts/identityLocalCheck.mjs
import { buildResult, runOutputInvariants } from "../lib/onebox.js";

const now = Date.now(), DAY = 864e5;
const iso = days => new Date(now - days * DAY).toISOString();
let seq = 0;
const row = (make, model, year, title, usd, daysAgo) => ({ id: ++seq, _usd: usd, raw_title: title, rtitle: title, make, model, year, auction_end_date: new Date(now - daysAgo * DAY).toISOString().slice(0, 10), source: "bringatrailer", mods: "", transmission: "Manual (4-Speed)", mileage: String(40000 + seq * 100) });
const pool = (make, model, year, bodies, usdBase = 30000) => {
  const rows = []; let i = 0;
  for (const [word, n] of bodies) for (let k = 0; k < n; k++, i++) rows.push(row(make, model, year, `${year} ${make} ${model}${word ? " " + word : ""}${k % 3 === 0 ? " 4-Speed" : ""}`, usdBase + (i % 11) * 900, 10 + (i * 7) % 300));
  return rows;
};
const CASES = [
  { name: "1965 Mustang: Convertible 33, Coupe 20, Fastback 12, four with no body word", make: "Ford", model: "Mustang", year: 1965, bodies: [["Convertible", 33], ["Coupe", 20], ["Fastback", 12], ["", 4]] },
  { name: "1969 Camaro: Coupe 17, Convertible 3, one with no body word (its page opens one card)", make: "Chevrolet", model: "Camaro", year: 1969, bodies: [["Coupe", 17], ["Convertible", 3], ["", 1]], usd: 50000 },
  { name: "1966 Thunderbird: Convertible 14, Coupe 24, Hardtop 9 (reads coupe), none without a body word", make: "Ford", model: "Thunderbird", year: 1966, bodies: [["Convertible", 14], ["Coupe", 24], ["Hardtop", 9]], usd: 20000 },
  { name: "one body only (no options, nothing to sum)", make: "Acura", model: "NSX", year: 1995, bodies: [["", 15]], usd: 90000 }
];

let failed = 0;
const fail = (c, msg) => { failed++; console.log(`FAIL  ${c.name}: ${msg}`); };
for (const c of CASES) {
  const rows = pool(c.make, c.model, c.year, c.bodies, c.usd);
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
    const same = opened === Number(o.n) && cards === Number(o.n);
    if (!same || gate.length || !bodyNull) { ok = false; console.log(`      ${o.label} (${o.n}) opens ${opened} with ${cards} card(s)${gate.length ? ", gate: " + gate.map(x => x.name).join(",") : ""}${bodyNull ? "" : ", bodyStyle not null on Body not stated"}`); }
  }
  const covered = opts.some(o => o.value === "unspecified");
  const total = sum + (covered ? 0 : (Number(d.bodyUnspecified) || 0));
  if (total !== poolN) { ok = false; console.log(`      options sum ${sum}${covered ? "" : " + unspecified " + (d.bodyUnspecified || 0)} != Any ${poolN}`); }
  const noBody = c.bodies.find(([w]) => !w);
  if (noBody && noBody[1] > 0 && !covered) { ok = false; console.log(`      ${noBody[1]} row(s) with no body word are in no option (silent gap)`); }
  if (ok) console.log(`PASS  ${c.name}: bare ${d.tier} ${poolN}; ${opts.map(o => `${o.label} ${o.n}`).join(", ")} = ${sum}`);
  else failed++;
}
console.log(failed ? `\nidentityLocalCheck: ${failed} case(s) FAILED.` : "\nidentityLocalCheck: every option equals its page and the options sum to Any, on the code being pushed.");
process.exit(failed ? 1 : 0);
