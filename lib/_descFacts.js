// Description-derived facts (descriptions resilience plan). ONE source of truth for the three stored
// columns (stated_mileage, project_flag, desc_facts) shared by the ingest stamp (scripts/ingest.js) and
// the backfill (api/usageDashboard.js task=descfacts), so the stored columns always equal what the live
// extractors would have produced. Readers prefer these columns, with a live-parse fallback, so every
// description-dependent feature keeps working if OCD stops sending description text.
import { projectFlagReason, extractMarkers } from "./_classify.js";
import { statedMileageFromText } from "./_houseComps.js";

export function computeDescFacts({ title, description, listingDetails, mileageStructured } = {}) {
  const project_flag = projectFlagReason(title, description) || null;
  const markers = extractMarkers({ listing_title: title, description });
  // Stated odometer: mined from prose ONLY when there is no structured mileage. The reader keeps its
  // own house-source gate (lib/_houseComps.js mileageInfo); storing it regardless is harmless and
  // future-proofs any non-house row that later needs it.
  let stated_mileage = null;
  if (!(Number(mileageStructured) > 0)) {
    const ld = Array.isArray(listingDetails) ? listingDetails.join(". ") : (listingDetails || "");
    const prose = `${description || ""}. ${ld}`;
    const mined = statedMileageFromText(prose);
    if (mined && mined.value > 0) stated_mileage = Math.round(mined.value);
  }
  return { stated_mileage, project_flag, desc_facts: { markers, stated_mileage } };
}
