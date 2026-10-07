// Description-derived facts (descriptions resilience plan). ONE source of truth for the three stored
// columns (stated_mileage, project_flag, desc_facts) shared by the ingest stamp (scripts/ingest.js) and
// the backfill (api/usageDashboard.js task=descfacts), so the stored columns always equal what the live
// extractors would have produced. Readers prefer these columns, with a live-parse fallback, so every
// description-dependent feature keeps working if OCD stops sending description text.
import { projectFlagReason, extractMarkers } from "./_classify.js";
import { statedMileageFromText } from "./_houseComps.js";

// Transmission stated PLAINLY in the title or description. NEVER inferred from the model. Explicit
// phrases only ("five-speed manual", "manual transmission", "G50", "Tiptronic", "PDK", "automatic
// transmission") so we never mistake "owner's manual", "manual mode" or "automatic climate" for a
// gearbox. Returns a label the onebox manual/auto matchers already recognize ("Manual" / "Automatic" /
// "PDK" / "Tiptronic") or null. Ambiguous (a manual AND an automatic signal) returns null, never a guess.
const TN = "(?:[1-9]|two|three|four|five|six|seven)";
const MANUAL_RE = new RegExp(`\\b(?:${TN}[\\s-]?speed\\s+manual|manual\\s+(?:transmission|gearbox|transaxle)|manual\\s+${TN}[\\s-]?speed|gated\\s+(?:manual|shifter)|dog[\\s-]?leg|stick[\\s-]?shift|g50|getrag)\\b`, "i");
const AUTO_RE = /\b(?:automatic\s+(?:transmission|gearbox|transaxle)|[1-9][\s-]?speed\s+automatic|sportomatic|slushbox|torque[\s-]?converter)\b/i;
export function transmissionFromText(title, description) {
  const t = `${title || ""}. ${description || ""}`;
  if (/\bpdk\b/i.test(t)) return "PDK";
  if (/\btiptronic\b/i.test(t)) return "Tiptronic";
  const man = MANUAL_RE.test(t), aut = AUTO_RE.test(t);
  if (man && !aut) return "Manual";
  if (aut && !man) return "Automatic";
  return null;
}

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
  const transmission = transmissionFromText(title, description);
  return { stated_mileage, project_flag, transmission, desc_facts: { markers, stated_mileage, transmission } };
}
