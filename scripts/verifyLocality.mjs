// Backend half of the locality fix (Part 1+2): once a Bay Area city resolves to the
// state "California", the region-only local specialist (Ingo) is region-covered and
// LOCAL, so he outranks the nationwide generalist (Spencer) for a San Francisco 911.
// This proves the outcome the frontend resolver now enables, and documents the bug it
// removes (an UNRESOLVED "san fransisco" drops Ingo entirely, handing it to Spencer).
// Uses the REAL exported matchers + comparator. Run: node scripts/verifyLocality.mjs
import { partnerRegionCovered, partnerLocalState, rankPartnerCandidates, localityConfirmed } from "../api/sellerDecision.js";

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

// Real roster region data. A 2021 911 Carrera: Ingo segment-matches (classic_european),
// Spencer marque+segment-matches (Porsche). Neither flag is what's under test - the
// LOCALITY resolution is - so the match flags are fixtures, region/local are computed live.
const ingo = { slug: "genau-auto-werks", name: "Ingo Schmoldt",
  regions: ["California", "San Francisco Peninsula", "East Bay", "Marin County", "Bay Area", "West Coast"],
  segmentMet: true, marqueMet: false };
const spencer = { slug: "specwerks-ltd", name: "Spencer Bailey",
  regions: ["Colorado", "Denver", "Mountain West", "Nationwide", "International"],
  segmentMet: true, marqueMet: true };

function pick(partners, criteria) {
  const cands = partners.map(p => ({
    partner: p, marqueMet: p.marqueMet, segmentMet: p.segmentMet,
    regionMet: partnerRegionCovered(p, criteria),
    local: partnerLocalState(p, criteria),
    regionCount: p.regions.length
  }));
  const matched = cands.filter(c => c.segmentMet && c.regionMet).sort(rankPartnerCandidates)[0] || null;
  return { cands, matched };
}

// ---- RESOLVED: state = "California" (what the frontend now yields for any Bay Area city) ----
const ca = { region: "US", state: "California" };
ok(partnerRegionCovered(ingo, ca) === true, "resolved CA: Ingo is region-covered");
ok(partnerLocalState(ingo, ca) === true, "resolved CA: Ingo is LOCAL to California");
ok(partnerRegionCovered(spencer, ca) === true && partnerLocalState(spencer, ca) === false, "resolved CA: Spencer covered (nationwide) but NOT local");
const rCA = pick([spencer, ingo], ca); // Spencer first in the array to prove order doesn't decide it
ok(rCA.matched && rCA.matched.partner.name === "Ingo Schmoldt", `resolved CA: SF 911 picks Ingo over Spencer [${rCA.matched && rCA.matched.partner.name}]`);

// ---- UNRESOLVED: state = raw "san fransisco" (the bug the resolver removes) ----
const raw = { region: "US", state: "san fransisco" };
ok(partnerRegionCovered(ingo, raw) === false, "raw typo: Ingo is NOT region-covered (dropped from the pool) - the bug");
ok(partnerRegionCovered(spencer, raw) === true, "raw typo: Spencer stays covered via Nationwide");
const rRaw = pick([spencer, ingo], raw);
ok(rRaw.matched && rRaw.matched.partner.name === "Spencer Bailey", `raw typo: Ingo excluded, Spencer wins by default [${rRaw.matched && rRaw.matched.partner.name}]`);

// ---- The pre-fix "correct spelling happens to work" fragility (substring luck) ----
const sf = { region: "US", state: "san francisco" };
ok(partnerLocalState(ingo, sf) === true, "correct-spelled 'san francisco' matched Ingo only by label-substring luck (now robust via CA)");

// ---- Part 3: last-resort suppression when locality is unconfirmable ----
ok(localityConfirmed({ region: "US", state: "California" }) === true, "localityConfirmed: 'California' -> true");
ok(localityConfirmed({ region: "US", state: "Colorado" }) === true, "localityConfirmed: 'Colorado' -> true");
ok(localityConfirmed({ region: "US", state: "Not sure" }) === false, "localityConfirmed: 'Not sure' -> false");
ok(localityConfirmed({ region: "US", state: "" }) === false, "localityConfirmed: empty -> false");
ok(localityConfirmed({ region: "US", state: "san fransisco" }) === false, "localityConfirmed: unresolved raw city -> false");

// Pure mirror of the Part 3 predicate in evaluatePartnerReferral (kept identical here so
// the invariant is testable without the DB-coupled async engine).
function suppressed(cands, matchedCand, criteria) {
  const rl = String(criteria.region || "").toLowerCase();
  const isUs = !rl || ["us", "usa", "united states"].includes(rl);
  if (!(isUs && matchedCand && !localityConfirmed(criteria))) return false;
  const nationwide = p => (p.regions || []).map(r => String(r).toLowerCase()).includes("nationwide");
  const rank = c => (c.marqueMet ? 2 : 0) + (c.segmentMet ? 1 : 0);
  const stronger = cands.some(c => c !== matchedCand && !c.regionMet && !nationwide(c.partner)
    && (c.segmentMet || c.marqueMet) && rank(c) > rank(matchedCand));
  return nationwide(matchedCand.partner) && stronger;
}
const natGeneralist = { partner: { name: "NatGen", regions: ["Nationwide"] }, marqueMet: false, segmentMet: true, regionMet: true, local: false, regionCount: 3 };
const droppedRegionalMarque = { partner: { name: "RegSpec", regions: ["California", "Bay Area"] }, marqueMet: true, segmentMet: true, regionMet: false, local: false, regionCount: 2 };
const natSpecialist = { partner: { name: "NatSpec", regions: ["Nationwide"] }, marqueMet: true, segmentMet: true, regionMet: true, local: false, regionCount: 3 };
const droppedRegionalSeg = { partner: { name: "RegSeg", regions: ["California"] }, marqueMet: false, segmentMet: true, regionMet: false, local: false, regionCount: 1 };
const unknown = { region: "US", state: "Not sure" };
ok(suppressed([natGeneralist, droppedRegionalMarque], natGeneralist, unknown) === true, "Part 3: unconfirmable + nationwide generalist beaten by a dropped STRONGER regional -> lead suppressed");
ok(suppressed([natSpecialist, droppedRegionalSeg], natSpecialist, unknown) === false, "Part 3: nationwide is the equal/better specialty fit -> still leads (no suppression)");
ok(suppressed([natGeneralist, droppedRegionalMarque], natGeneralist, { region: "US", state: "California" }) === false, "Part 3: CONFIRMED locality -> no-op");
ok(suppressed([natGeneralist, { ...droppedRegionalMarque, regionMet: true }], natGeneralist, unknown) === false, "Part 3: regional NOT dropped (covered) -> no suppression, ranking handles it");

console.log(fails === 0 ? "\nLOCALITY (backend ranking) ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
