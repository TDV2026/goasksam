// A CARD'S MARKET CHECK QUESTION READS BACK AS THE CARD'S OWN CAR (Lane B, Nov 5 2026). No network, no database (the resolver runs on its curated data). Must hold, for a sample of cars, not one:
//  (1) for every sampled listing the question the card carries (market.query, what its Market Check button asks) resolves, through the same specOf a card is read through, to the card's OWN spec key,
//      so Market Check answers the pool the card printed (count, range and scope come from the one engine answer for that key);
//  (2) the class is real: the resolved words alone do NOT read back for every car (1970 Plymouth Hemi Cuda Convertible asked "Barracuda Cuda Convertible", losing the Cuda trim); the listing's own words do;
//  (3) a spec the buyer narrowed keeps its question as written; a car that neither text reads back keeps the resolved words; a read not back in time keeps them and remembers nothing;
//  (4) the card path (listingMarket) asks the read-back, and the live sample script asks the card's own question, not the listing title.
//   node scripts/cardQueryReadBackCheck.mjs [repo root]        (a tree without readBackQuery fails it)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const S = await import(pathToFileURL(path.join(ROOT, "lib/live/search.js")).href).catch(e => ({ err: e }));
ok("lib/live/search.js loads and exports readBackQuery", typeof S.readBackQuery === "function", S.err ? String(S.err.message).slice(0, 80) : "");
if (typeof S.readBackQuery !== "function") { console.log(`\n${failed} FAILED`); process.exit(1); }
const env = { supabaseUrl: "https://x.invalid", supabaseKey: "k" };
const yearOf = t => Number((t.match(/\b(?:19|20)\d\d\b/) || [0])[0]);
const specFor = async t => { const r = { listing_title: t, year: yearOf(t), make: null, model: null }; return S.specOf(env, r, S.listingFacts(r)); };
const TITLES = ["1995 Ferrari F355 Spider 6-Speed", "2003 Ferrari 360 Spider 6-Speed", "1988 Porsche 911 Carrera Cabriolet G50", "3.6L-Powered 1988 Porsche 911 Carrera Cabriolet G50", "1987 Porsche 911 Turbo", "2005 Porsche 911 Carrera S Cabriolet 6-Speed", "1969 Chevrolet Camaro Z/28", "1967 Shelby GT350 Mustang", "1965 Shelby Cobra 289", "2017 Porsche 911 GT3 RS", "1991 Acura NSX", "1973 Porsche 911 Carrera RS 2.7", "1994 Mercedes-Benz E500", "2004 BMW M3 Convertible 6-Speed", "1999 Porsche 911 Carrera 4 Cabriolet", "2001 Porsche 911 GT3", "1972 Datsun 240Z", "1965 Ford Mustang Fastback", "1995 Mazda MX-5 Miata", "1980 Mercedes-Benz 450SL", "2007 Ferrari F430 Spider", "2011 Ferrari 458 Italia", "1996 Ferrari F355 GTS", "1989 Ferrari 328 GTS", "1985 Ferrari 308 GTS Spider", "2000 Honda S2000", "1963 Chevrolet Corvette Split-Window", "1970 Plymouth Hemi Cuda Convertible", "2012 Porsche 911 Carrera S Cabriolet", "2013 Chevrolet Corvette 427 Convertible", "1970 Dodge Challenger R/T 426 Hemi", "1966 Ford Bronco Half-Cab", "1974 Porsche 911 S Targa", "1957 Chevrolet Bel Air Convertible", "2019 Chevrolet Camaro ZL1 1LE"];
let notRead = [], needFallback = [], n = 0;
for (const t of TITLES) {
  const sp = await specFor(t); if (!sp) continue; n++;
  const words = S.specQuery(sp, "exact"), q = await S.readBackQuery(env, sp, words);
  const back = await specFor(q);
  if (!(back && back.key === sp.key)) notRead.push(`${t} -> "${q}"`);
  const wb = await specFor(words); if (!(wb && wb.key === sp.key)) needFallback.push(t);
}
ok(`(1) all ${n} sampled cards: the question the card carries resolves to the card's own spec key`, notRead.length === 0 && n >= 30, notRead.slice(0, 3).join("; "));
ok("(2) the resolved words alone do not read back for every car (the class is real)", needFallback.length >= 1, `${needFallback.length} of ${n}: ${needFallback.slice(0, 3).join("; ")}`);
const hc = await specFor("1970 Plymouth Hemi Cuda Convertible"), hcw = S.specQuery(hc, "exact");
ok("(2) Hemi Cuda: the resolved words drop the Cuda trim and read back as a different car", !((await specFor(hcw)) || {}).key || (await specFor(hcw)).key !== hc.key, hcw);
ok("(2) Hemi Cuda: the read-back question is the listing's own words and reads back", (await S.readBackQuery(env, hc, hcw)) === hc.title && (await specFor(hc.title)).key === hc.key);
// (3)
const refined = { ...hc, refine: { tx: "manual", label: "manual" } };
ok("(3) a spec the buyer narrowed keeps its question as written", (await S.readBackQuery(env, refined, "1970 Plymouth Barracuda Cuda Convertible manual")) === "1970 Plymouth Barracuda Cuda Convertible manual");
const ghost = { ...hc, key: "[\"nope\"]", title: "1970 Plymouth Hemi Cuda Convertible" };
ok("(3) a car neither text reads back keeps the resolved words, as before", (await S.readBackQuery(env, ghost, "1970 Plymouth Barracuda Cuda Convertible")) === "1970 Plymouth Barracuda Cuda Convertible");
const slowSpec = { ...(await specFor("1970 Plymouth Hemi Cuda Convertible")), key: hc.key };
const slow = await S.readBackQuery(env, { ...slowSpec, title: slowSpec.title, v: slowSpec.v }, "1970 Plymouth Barracuda Cuda Convertible x", { ms: 1 });
ok("(3) an unanswered or failed read returns the question as written", typeof slow === "string" && slow.length > 0);
// (4)
const src = fs.readFileSync(path.join(ROOT, "lib/live/search.js"), "utf8");
ok("(4) the serve (listingMarket) reads no pool: it uses the verified question or starts the read-back behind the response", /mk\.query = readBackNow\(env, spec, mk\.query\)/.test(src) && !/mk\.query = await readBackQuery/.test(src));
ok("(4) refreshSpec verifies the question where the pool is read anyway and stores it with the core; the card prefers it", /core\.readBack = await readBackQuery\(env, spec, specQuery\(spec, core\.step\)/.test(src) && /m\.query = \(typeof core\.readBack === "string" && core\.readBack\) \|\| specQuery/.test(src));
const live = fs.readFileSync(path.join(ROOT, "scripts/buyEngineMatch.mjs"), "utf8");
ok("(4) the live sample reads Market Check with the card's own question (market.query), not the title", /askOf = c => \(c\.market && c\.market\.query\)/.test(live) && /t = askOf\(c\)/.test(live) && /want = \[\.\.\.new Set\(\(e\.cards \|\| \[\]\)\.map\(askOf\)\)\]/.test(live));
console.log(failed ? `\n${failed} FAILED` : "\ncardQueryReadBackCheck: all passed");
process.exit(failed ? 1 : 0);
