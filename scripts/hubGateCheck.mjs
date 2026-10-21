// THE HUB GATE READS THE SLUG AS THE PAGE DOES (Lane B's diagnosis, Oct 21 2026; Lane C's fix): the hubs sitemap listed
// /history/1923-1948-porsche-911-speedster-heritage-design and /history/250-gt-california-spyder-re-creation, which 404
// (the page parses the slug by position: a leading year, then the make). api/history.js rollout() now keeps a hub only
// when parseHubSlug reads it with no year and the make the hub was built from, and leaves out replica families (the
// pools' own words, lib/_classify.js). Search rule 7: a sitemap lists only live pages. No network.
//   node scripts/hubGateCheck.mjs                    the fixtures
//   node scripts/hubGateCheck.mjs --list hubs.xml    also report what the gate would drop from a saved hubs sitemap
import fs from "node:fs";
import { hubPageAgrees, replicaHub } from "../api/history.js";
import { parseHubSlug, hubSlug } from "../api/_historyData.js";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
// The two dead URLs, each with the make its hub was built from.
ok(!hubPageAgrees("1923-1948-porsche-911-speedster-heritage-design", "Porsche"), "a slug the page reads with a year (1923) and make '1948' is not a hub");
ok(!hubPageAgrees("250-gt-california-spyder-re-creation", "Ferrari") && replicaHub("250-gt-california-spyder-re-creation"), "a slug the page reads with make '250' is not a hub, and a re-creation family is left out");
// Real hubs pass, multi-word makes included.
for (const [make, fam] of [["Porsche", "911"], ["Alfa Romeo", "Giulia"], ["Mercedes-Benz", "300SL"], ["Aston Martin", "DB5"], ["Land Rover", "Defender"], ["Ferrari", "250 GT California Spyder"], ["Shelby", "Cobra Continuation Series"], ["Jaguar", "E-Type"]]) {
  const k = hubSlug(make, fam);
  ok(hubPageAgrees(k, make) && !replicaHub(k) && parseHubSlug(k).makeSlug === k.slice(0, parseHubSlug(k).makeSlug.length), `${k}: a real hub passes (the page reads the same make)`);
}
for (const k of ["jaguar-e-type-tribute", "ferrari-250-gto-replica", "ford-gt40-evocation", "ferrari-250-gt-california-spyder-recreation", "shelby-cobra-continuation"]) ok(replicaHub(k), `${k}: a replica family is left out`);
ok(!replicaHub("shelby-cobra-continuation-series") && !replicaHub("ford-gt-heritage-edition") && !replicaHub("porsche-911-carrera"), "a factory continuation series, a heritage edition and a plain car stay");
// The gate runs both tests before naming any hub, and counts what it drops.
const src = fs.readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
ok(/const hubKeys = \[\.\.\.hubs\.keys\(\)\]\.filter\(k => \{ if \(!hubPageAgrees\(k, hubs\.get\(k\)\.make\)\) \{ pageDisagrees\+\+; return false; \} if \(replicaHub\(k\)\) \{ replicaHubs\+\+; return false; \} return true; \}\)/.test(src), "rollout() filters the hub keys with both tests before the resolver names them");
ok(/counts\.hubs_page_disagrees = pageDisagrees; counts\.hubs_replica = replicaHubs;/.test(src), "the rollout counts report what the gate dropped");
const li = process.argv.indexOf("--list");
if (li > 0) {
  const xml = fs.readFileSync(process.argv[li + 1], "utf8"), slugs = [...xml.matchAll(/<loc>[^<]*\/history\/([^<\/]+)<\/loc>/g)].map(m => m[1]);
  const year = slugs.filter(k => { const p = parseHubSlug(k); return !p || p.year; }), oddMake = slugs.filter(k => { const p = parseHubSlug(k); return p && !p.year && !/[a-z]/.test(p.makeSlug); }), rep = slugs.filter(replicaHub);
  console.log(`REAL LIST: ${slugs.length} hubs; the page reads a year or nothing: ${year.length} ${JSON.stringify(year)}; a make with no letters: ${oddMake.length} ${JSON.stringify(oddMake)}; replica families: ${rep.length} ${JSON.stringify(rep)}`);
}
console.log(`hubGateCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
