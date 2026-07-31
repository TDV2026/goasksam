// Evidence-allowlist unit coverage (July 2026). Locks the source-of-truth that
// governs which sources count as comparable-sale EVIDENCE (the premium "others"
// denominator and the evidence tallies). Routing/recommendability is a separate
// axis and is intentionally NOT tested here: the allowlist never touches it.
import { isEvidenceSource, EVIDENCE_ALLOWLIST, KNOWN_SOURCE_SLUGS, normSourceSlug } from "../api/sellerDecision.js";
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

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALLOWLIST-UNIT ALL PASS");
process.exit(failures ? 1 : 0);
