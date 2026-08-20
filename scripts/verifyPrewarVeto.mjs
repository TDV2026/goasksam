// Verifies the Spencer-specific prewar veto (Option B) against the REAL exported
// veto and the REAL candidate comparator from api/sellerDecision.js. Two guarantees:
//   1) A prewar vehicle can never select Spencer (he is filtered out of the pool),
//      so a prewar BMW/Mercedes routes to a non-Spencer partner with no tie.
//   2) The veto NEVER touches Howard/Ingo/Dan/Chris: it returns false for every
//      non-Spencer slug at every year, and for any postwar car it is a total no-op.
// Run: node scripts/verifyPrewarVeto.mjs
import { partnerPrewarVetoed, rankPartnerCandidates } from "../api/sellerDecision.js";

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const SPENCER = "specwerks-ltd";
const OTHERS = ["hows-motorcars-main-line", "genau-auto-werks", "authentic-auctions", "carbine123"];
const YEARS = [1930, 1940, 1945, 1946, 1955, 1970, 1988, 2005, 2021, undefined, 0, null, NaN];

// ---- Guarantee 2 (structural): the veto is false for every other partner, always ----
let otherTrips = 0;
for (const slug of OTHERS) for (const year of YEARS) {
  if (partnerPrewarVetoed({ slug }, { year })) otherTrips++;
}
ok(otherTrips === 0, `veto never fires for Howard/Ingo/Dan/Chris (checked ${OTHERS.length}x${YEARS.length} cases)`);

// ---- Spencer: vetoed iff prewar (<=1945), never on a missing/invalid year ----
ok(partnerPrewarVetoed({ slug: SPENCER }, { year: 1936 }) === true, "Spencer vetoed for a 1936 (prewar) car");
ok(partnerPrewarVetoed({ slug: SPENCER }, { year: 1945 }) === true, "Spencer vetoed at the 1945 boundary (prewar)");
ok(partnerPrewarVetoed({ slug: SPENCER }, { year: 1946 }) === false, "Spencer NOT vetoed at 1946 (postwar boundary)");
ok(partnerPrewarVetoed({ slug: SPENCER }, { year: 1988 }) === false, "Spencer NOT vetoed for a 1988 modern classic");
ok([undefined, 0, null, NaN].every(y => partnerPrewarVetoed({ slug: SPENCER }, { year: y }) === false), "Spencer NOT vetoed when year is missing/invalid");

// ---- Guarantee 1 (routing): the REAL selection expression, with hand-authored cand
// flags for a prewar Mercedes 540K (1936). Spencer, Howard and Chris all marque-match
// Mercedes; Dan segment-matches. Seller nationwide (no local). ----
const prewarMercedesCands = [
  { partner: { slug: "hows-motorcars-main-line", name: "Howard" }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 11 },
  { partner: { slug: "authentic-auctions", name: "Dan" }, marqueMet: false, segmentMet: true, regionMet: true, local: false, regionCount: 8 },
  { partner: { slug: "carbine123", name: "Chris" }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 8 },
  { partner: { slug: SPENCER, name: "Spencer" }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 5 }
];
// The two source lines, verbatim in spirit: filter by veto, then pick matched.
const selectMatched = (cands, vehicle) => cands
  .filter(c => !partnerPrewarVetoed(c.partner, vehicle))
  .filter(c => c.segmentMet && c.regionMet)
  .sort(rankPartnerCandidates)[0] || null;

const unvetoed = [...prewarMercedesCands].filter(c => c.segmentMet && c.regionMet).sort(rankPartnerCandidates)[0];
ok(unvetoed.partner.name === "Spencer", `precondition: WITHOUT the veto Spencer would win the prewar Mercedes (fewest regions) [${unvetoed.partner.name}]`);

const prewarPick = selectMatched(prewarMercedesCands, { year: 1936 });
ok(prewarPick && prewarPick.partner.name !== "Spencer", `prewar Mercedes selects a non-Spencer partner [${prewarPick?.partner.name}]`);
ok(!selectMatched(prewarMercedesCands, { year: 1936 }) || !prewarMercedesCands.filter(c => !partnerPrewarVetoed(c.partner, { year: 1936 })).some(c => c.partner.slug === SPENCER), "prewar: Spencer is removed from the candidate pool entirely (no lead, no tie, no secondary)");

// The non-Spencer ordering is byte-identical with and without the veto (veto only removes Spencer).
const orderNoVeto = prewarMercedesCands.filter(c => c.partner.slug !== SPENCER).sort(rankPartnerCandidates).map(c => c.partner.name).join(">");
const orderVeto = prewarMercedesCands.filter(c => !partnerPrewarVetoed(c.partner, { year: 1936 })).sort(rankPartnerCandidates).map(c => c.partner.name).join(">");
ok(orderNoVeto === orderVeto, `other four keep identical ranking under the veto [${orderVeto}]`);

// ---- Postwar: the veto is a no-op; Spencer (local to Colorado) can still win ----
const postwarM3Cands = [
  { partner: { slug: "hows-motorcars-main-line", name: "Howard" }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 11 },
  { partner: { slug: "carbine123", name: "Chris" }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 8 },
  { partner: { slug: SPENCER, name: "Spencer" }, marqueMet: true, segmentMet: true, regionMet: true, local: true, regionCount: 5 }
];
const keptPostwar = postwarM3Cands.filter(c => !partnerPrewarVetoed(c.partner, { year: 1988 }));
ok(keptPostwar.length === postwarM3Cands.length, "postwar 1988 car: veto removes nobody (total no-op)");
ok(selectMatched(postwarM3Cands, { year: 1988 }).partner.name === "Spencer", "postwar: Spencer (local) still selectable, veto does not over-reach");

console.log(fails === 0 ? "\nPREWAR-VETO ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
