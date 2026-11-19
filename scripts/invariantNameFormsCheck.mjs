// A CAR IS THE SAME CAR IN EVERY FORM ITS TITLES WRITE THE NAME, AND ONLY THEN (Lane B, Oct 29 2026).
// The live Find sweep (livecardrefusals + warmwhy, 1,186 specs): 61 specs printed "could not be checked", 59 of 100 recomputed texts failed receipts_carry_resolved_car. Some are the invariant doing its job (a 2014 Audi S7 pool of RS7s, a 1959 Mercedes 190 pool of 190SLs,
// a 2008 Audi TT pool of A4s and A6s are other cars); some are the invariant not reading a name the way the titles write it: 1965 Citroen DS19 on "Ds 19 Cabriolet", 1974 Jaguar XJ6 on "XJ6L" and "XJ6C", 1966 Triumph TR4 on "TR4A", 2013 BMW 135i on "135is".
// RULE: a glued code (DS19, XJ6, TR4) is also the code spaced or hyphenated, or with ONE trailing letter (L, C, X, K, E, A); an i-type number (135i) also reads with an s (135is). Never two letters (GT3RS, M3CS), never inside a longer word (RS7 is not S7).
// This check: each real form passes the invariant (and the pool is not refused for it); each other car still fails it.
//   node scripts/invariantNameFormsCheck.mjs [repo root]
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const run = (make, model, year, cs) => { const cards = Array.from({ length: 8 }, (_, i) => ({ make, model: cs[i % cs.length][0], title: cs[i % cs.length][1], price: 20000 + i * 100, id: "c" + i })); const r = E.runOutputInvariants({ tier: "result", poolN: 8, cards, resolvedCar: { make, model, year }, cluster: null }, { make, model, year }); return r.find(c => c.name === "receipts_carry_resolved_car"); };
const SAME = [
  ["Citroen", "DS19", 1965, [["DS 19 Cabriolet", "1965 Citroën Ds 19 Cabriolet by Chapron"], ["DS 19", "1964 Citroen DS 19"]]],
  ["Jaguar", "XJ6", 1974, [["XJ", "1974 Jaguar XJ6L"], ["XJ", "1975 Jaguar XJ6C 5-Speed"], ["XJ", "1976 Jaguar XJ6"]]],
  ["Triumph", "TR4", 1966, [["TR5", "1966 Triumph TR4A Irs"], ["TR4", "1965 Triumph TR4"]]],
  ["BMW", "135i", 2013, [["1-Series", "2013 BMW 135is Coupe 6-Speed"], ["1-Series", "2013 BMW 135i Coupe"]]],
  ["Mercedes-Benz", "S550", 2008, [["S-Class", "2008 Mercedes-Benz S550L"]]]
];
for (const [mk, md, y, cs] of SAME) { const c = run(mk, md, y, cs); ok(`${y} ${mk} ${md}: its own titles' forms carry the car`, !!c && c.ok, c && c.detail.slice(0, 120)); }
const OTHER = [
  ["Audi", "S7", 2014, [["RS7", "2014 Audi RS7 Prestige"], ["RS7", "2014 Audi RS7"]]],
  ["Mercedes-Benz", "190", 1961, [["190SL", "1961 Mercedes-Benz 190SL"]]],
  ["Audi", "TT", 2008, [["A4", "2008 Audi A4 2.0T Cabriolet Quattro"], ["A6", "2008 Audi A6 3.2 Avant Quattro S Line"]]],
  ["Porsche", "GT3", 2010, [["GT3RS", "2010 Porsche 911 GT3RS"], ["GT3RS", "2010 Porsche GT3RS 4.0"]]],
  ["BMW", "M3", 2012, [["M3CS", "2012 BMW M3CS"]]],
  ["BMW", "135i", 2013, [["3-Series", "2013 BMW 335i Coupe"]]]
];
for (const [mk, md, y, cs] of OTHER) { const c = run(mk, md, y, cs); ok(`${y} ${mk} ${md}: a pool of other cars still fails`, !!c && !c.ok, c && c.detail.slice(0, 100)); }
console.log(fail ? `invariantNameFormsCheck: ${fail} failure(s)` : "invariantNameFormsCheck: all pass");
process.exit(fail ? 1 : 0);
