// Evidence-allowlist unit coverage (July 2026). Locks the source-of-truth that
// governs which sources count as comparable-sale EVIDENCE (the premium "others"
// denominator and the evidence tallies). Routing/recommendability is a separate
// axis and is intentionally NOT tested here: the allowlist never touches it.
import { isEvidenceSource, EVIDENCE_ALLOWLIST, KNOWN_SOURCE_SLUGS, MARQUE_GATED_EVIDENCE, marqueGatedBlocked, normSourceSlug } from "../api/sellerDecision.js";
import { recordPlatform } from "../lib/_classify.js";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
};
const rec = source => ({ source });

// ---- membership: self-listable marketplaces a seller could actually use ----
for (const slug of ["bringatrailer", "bat", "carsandbids", "hagerty", "pcarmarket", "acc", "allcollectorcars", "sothebysmotorsport", "hemmings", "autohunter"]) {
  check(`allowlist INCLUDES ${slug}`, isEvidenceSource(rec(slug)) === true, `isEvidenceSource=${isEvidenceSource(rec(slug))}`);
}
// ---- excluded: white-glove consignment + anomalies + unknowns ----
for (const slug of ["rmsothebys", "gooding", "goodingco", "oldcarsdata", "somethingnew", ""]) {
  check(`allowlist EXCLUDES ${slug || "(empty)"}`, isEvidenceSource(rec(slug)) === false, `isEvidenceSource=${isEvidenceSource(rec(slug))}`);
}
// rmsothebys/gooding are EXCLUDED from evidence but still KNOWN (they render as
// "a leading auction house" and can back the honest pre-note); a genuinely new
// slug is neither.
check("rmsothebys is known (not new-source)", KNOWN_SOURCE_SLUGS.has("rmsothebys"));
check("gooding is known (not new-source)", KNOWN_SOURCE_SLUGS.has("gooding"));
check("a novel slug is NOT known (triggers new-source detection)", !KNOWN_SOURCE_SLUGS.has(normSourceSlug("Barrett-Jackson")));

// ---- MB Market: marque-gated evidence (Mercedes-Benz only) ----
// MB Market is NOT in the unconditional allowlist: with no vehicle, or a non-Mercedes
// vehicle, it is NOT an evidence source. It counts only for a Mercedes-Benz search.
check("MB Market is marque-gated (mapped to Mercedes-Benz)", MARQUE_GATED_EVIDENCE.mbmarket === "Mercedes-Benz");
check("MB Market is NOT in the unconditional allowlist", !EVIDENCE_ALLOWLIST.has("mbmarket"));
check("MB Market is a KNOWN source (never new-source-flagged)", KNOWN_SOURCE_SLUGS.has("mbmarket"));
check("MB Market is NOT evidence with no vehicle (fail-closed)", isEvidenceSource(rec("mbmarket")) === false);
check("MB Market is NOT evidence for a non-Mercedes search", isEvidenceSource(rec("mbmarket"), { make: "Porsche" }) === false);
check("MB Market IS evidence for a Mercedes-Benz search", isEvidenceSource(rec("mbmarket"), { make: "Mercedes-Benz" }) === true);
check("MB Market IS evidence for a bare 'Mercedes' search", isEvidenceSource(rec("mbmarket"), { make: "Mercedes" }) === true);
check("marqueGatedBlocked: MB Market blocked for Porsche", marqueGatedBlocked(rec("mbmarket"), { make: "Porsche" }) === true);
check("marqueGatedBlocked: MB Market allowed for Mercedes-Benz", marqueGatedBlocked(rec("mbmarket"), { make: "Mercedes-Benz" }) === false);
check("marqueGatedBlocked: a normal source is never blocked", marqueGatedBlocked(rec("bringatrailer"), { make: "Porsche" }) === false);
check("a normal allowlisted source ignores the vehicle arg", isEvidenceSource(rec("carsandbids"), { make: "Porsche" }) === true);

// ---- attribution guard: the vendor name is never a source ----
check("recordPlatform maps the vendor name to 'unknown'", recordPlatform({ source: "oldcarsdata" }) === "unknown", recordPlatform({ source: "oldcarsdata" }));
check("recordPlatform maps empty source to 'unknown'", recordPlatform({}) === "unknown", recordPlatform({}));
check("recordPlatform passes a real slug through", recordPlatform({ source: "bringatrailer" }) === "bringatrailer", recordPlatform({ source: "bringatrailer" }));
check("the vendor-name anomaly is excluded from evidence", isEvidenceSource({ source: "oldcarsdata" }) === false);

// ---- denominator wiring: the exact predicate the premium walk uses ----
// others = eligible where platform != pick AND isEvidenceSource. Prove that a
// pool mixing allowlisted + excluded sources yields an allowlisted-only "others".
const pick = "bringatrailer";
const pool = [
  { record: rec("bringatrailer") }, // pick, excluded from others by platform
  { record: rec("carsandbids") },   // allowlisted -> counts
  { record: rec("sothebysmotorsport") }, // allowlisted (SOMO) -> counts
  { record: rec("hemmings") },      // allowlisted -> counts
  { record: rec("rmsothebys") },    // excluded -> DROPPED from denominator
  { record: rec("gooding") },       // excluded -> DROPPED from denominator
  { record: rec("oldcarsdata") }    // anomaly -> DROPPED from denominator
];
const others = pool.filter(item => recordPlatform(item.record) !== pick && isEvidenceSource(item.record))
  .map(item => recordPlatform(item.record));
check("premium 'others' denominator keeps allowlisted non-pick sources (incl. SOMO)",
  JSON.stringify(others.sort()) === JSON.stringify(["carsandbids", "hemmings", "sothebysmotorsport"]),
  JSON.stringify(others));
check("premium 'others' denominator drops rmsothebys, gooding and the vendor anomaly",
  !others.includes("rmsothebys") && !others.includes("gooding") && !others.includes("oldcarsdata"),
  JSON.stringify(others));

// Contract guard: analyze() filters PAIRS ({record, classification}); the
// predicate takes a BARE record, so the call site MUST unwrap .record. Passing
// the pair reads pair.platform (undefined) -> "unknown" -> excludes everything
// (the July 2026 landedSales=0 bug). Lock the shape so it cannot silently return.
const pairs = [
  { record: rec("bringatrailer"), classification: {} },
  { record: rec("carsandbids"), classification: {} },
  { record: rec("rmsothebys"), classification: {} }
];
const keptWrong = pairs.filter(isEvidenceSource);                 // the bug
const keptRight = pairs.filter(item => isEvidenceSource(item.record)); // correct
check("evidence filter on PAIRS drops everything if not unwrapped (bug guard)", keptWrong.length === 0, `keptWrong=${keptWrong.length}`);
check("evidence filter on PAIRS keeps allowlisted when unwrapped", keptRight.length === 2 && keptRight.every(p => normSourceSlug(recordPlatform(p.record)) !== "rmsothebys"), `keptRight=${keptRight.length}`);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALLOWLIST-UNIT ALL PASS");
process.exit(failures ? 1 : 0);
