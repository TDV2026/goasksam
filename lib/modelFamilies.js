// Curated MODEL_FAMILY map (Aug 2026, fragmentation fix).
//
// THE PROBLEM. OldCarsData files a badged family's sales under the badge, not the
// family head. A search for the family head ("E-Class", "5-Series") therefore
// undercounts massively: keyword "E-Class" returns 226 records while "E350"
// alone returns 772; keyword "5-Series" returns 13 while "M5" returns 1790 and
// "535i" 411; keyword "CLS-Class" returns 0 while "CLS550" returns 75; keyword
// "SL-Class" returns 74 while "SL500" returns 2145. The family head is a market;
// the badges are how the market is titled. Same class of bug as the BMW E24
// 6-Series (630/633/635) resolution fix, but here it bites POOL ASSEMBLY:
//   1. FETCH  - the keyword fallback passes query the family head only, so
//      badge-titled listings never enter the archive.
//   2. CLASSIFY - recordMatchesModel anchors on the family-head tokens, so a
//      record whose model is "E550" / "E63 AMG P30" / "500E" is excluded even
//      when it is squarely the searched car's market.
//
// THE FIX. familyFor(make, model) resolves a FAMILY-HEAD search (never a badge
// search: someone who typed "E350" wants E350, not the family) to:
//   - fetchBadges: a BOUNDED, highest-volume badge set appended to
//     modelSearchTerms, so the fetch keyword passes pull the badges into the
//     archive and classification catches the common ones. Bounded because each
//     term is a metered keyword pass; the long tail is caught by the regex.
//   - badgeRe: a family-scoped regex for the CLASSIFY catch-all
//     (familyBadgeMatch), tested only against the record's MODEL-POSITION tokens
//     (never arbitrary title substrings) and only when the record make matches
//     the family make. This preserves the leading-token discipline: the badge
//     must lead the nameplate, so "E63" never leaks in from a trailing trim.
//
// Only family-head searches expand. Badge searches, and makes/models absent from
// the map, behave exactly as before. Never blocks on missing coverage.

import { modelTokens, titleModelTokens, asText } from "./_classify.js";

// makeRe guards each marque's families so a badge regex can never cross marques.
const MB = /(mercedes|benz)/;
const BMW = /^bmw$/;

// Each family: head match tokens (lowercased, space-normalized), the make guard,
// a bounded fetchBadges list (top volume first), and badgeRe over model tokens.
export const MODEL_FAMILY = [
  // ---- Mercedes-Benz badged families ----
  { make: MB, head: "c class",   fetchBadges: ["C300", "C63", "C43", "C250", "C230"],       badgeRe: /^c\d{2,3}$/ },
  { make: MB, head: "e class",   fetchBadges: ["E350", "E550", "E63", "E320", "E500"],       badgeRe: /^(e\d{2,3}|\d{3}e)$/ },
  { make: MB, head: "s class",   fetchBadges: ["S550", "S63", "S500", "S65", "S430"],        badgeRe: /^s\d{2,3}$/ },
  { make: MB, head: "cl class",  fetchBadges: ["CL550", "CL600", "CL63", "CL500", "CL65"],   badgeRe: /^cl\d{3}$/ },
  { make: MB, head: "cls class", fetchBadges: ["CLS550", "CLS63", "CLS500", "CLS55"],        badgeRe: /^cls\d{2,3}$/ },
  { make: MB, head: "clk class", fetchBadges: ["CLK550", "CLK500", "CLK63", "CLK320", "CLK430"], badgeRe: /^clk\d{3}$/ },
  { make: MB, head: "sl class",  fetchBadges: ["SL500", "SL550", "SL63", "SL55", "SL65"],    badgeRe: /^(sl\d{2,3}|\d{3}sl)$/ },
  { make: MB, head: "slk class", fetchBadges: ["SLK350", "SLK55", "SLK320", "SLK230", "SLK280"], badgeRe: /^slk\d{3}$/ },
  { make: MB, head: "g class",   fetchBadges: ["G550", "G63", "G500", "G55", "G65"],         badgeRe: /^g\d{2,3}$/ },
  // ---- BMW numbered series (i/M variants and chassis-led titles) ----
  // 2002 (classic) is NOT a 2-Series: /^2\d{2}(suffix)?$/ is 3 chars + optional
  // suffix, so "2002" (4 digits) never matches; M235i/M240i are spelled out.
  { make: BMW, head: "2 series", fetchBadges: ["M2", "228i", "230i", "M240i", "235i"],        badgeRe: /^(2\d{2}(i|is|ic|xi)?|m2|m2\d{2}i)$/ },
  { make: BMW, head: "3 series", fetchBadges: ["M3", "335i", "328i", "330i", "325i"],        badgeRe: /^(3\d{2}(i|is|ic|ci|xi|ti|d)?|m3)$/ },
  { make: BMW, head: "4 series", fetchBadges: ["M4", "435i", "428i", "440i", "M440i"],        badgeRe: /^(4\d{2}(i|is|ic|xi|gc)?|m4|m4\d{2}i)$/ },
  { make: BMW, head: "5 series", fetchBadges: ["M5", "535i", "550i", "528i", "540i"],        badgeRe: /^(5\d{2}(i|is|ic|ci|xi|d)?|m5)$/ },
  { make: BMW, head: "6 series", fetchBadges: ["650i", "M6", "645ci", "640i", "635csi"],     badgeRe: /^(6\d{2}(i|ci|csi|cs)?|m6|63\d(csi|cs|i)?)$/ },
  { make: BMW, head: "7 series", fetchBadges: ["750i", "740i", "745i", "760i", "750il"],     badgeRe: /^7\d{2}(i|il|li)?$/ },
  { make: BMW, head: "8 series", fetchBadges: ["850i", "840i", "M8", "850ci", "850csi"],     badgeRe: /^(8\d{2}(i|ci|csi|d)?|m8)$/ },
];

function normHead(value) {
  return asText(value).toLowerCase().replace(/[\s\-]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

// Resolve a FAMILY-HEAD search to its family entry, or null. Badge searches and
// unmapped models resolve to null (no expansion). Matches "E-Class", "E Class",
// "eclass"; never "E350".
export function familyFor(make, model) {
  const m = normHead(make);
  const md = normHead(model);
  const mdCompact = md.replace(/ /g, "");
  if (!md) return null;
  return MODEL_FAMILY.find(f => {
    if (f.make && !f.make.test(m)) return false;
    const head = normHead(f.head);
    return md === head || mdCompact === head.replace(/ /g, "");
  }) || null;
}

// Bounded badge terms to append to modelSearchTerms for a family-head search.
export function familyFetchTerms(vehicle) {
  const fam = familyFor(vehicle && vehicle.make, vehicle && vehicle.model);
  return fam ? fam.fetchBadges.slice() : [];
}

// CLASSIFY catch-all: does this record belong to the searched family? Tested only
// against MODEL-POSITION tokens (record model field + the model portion of the
// title after a leading year+make), make-guarded, family-scoped regex. The long
// tail the bounded fetchBadges miss (E320, 500E, 645Ci, chassis-led "E46 330i")
// is caught here without a leading-token false positive.
export function familyBadgeMatch(vehicle, record) {
  const fam = familyFor(vehicle && vehicle.make, vehicle && vehicle.model);
  if (!fam) return false;
  const recMake = asText(record.ocd_make_name || record.listing_make || vehicle.make);
  if (fam.make && !fam.make.test(recMake.toLowerCase())) return false;
  const recToks = modelTokens(record.ocd_model_name || record.listing_model || record.model);
  const title = asText(record.title || record.listing_title);
  const titToks = title ? titleModelTokens(title, recMake) : [];
  // Scan the nameplate tokens only (not the whole title). Chassis-led titles like
  // "E46 330i" put the chassis first and the badge second, so scan every
  // model-position token rather than only the lead.
  return recToks.some(t => fam.badgeRe.test(t)) || titToks.some(t => fam.badgeRe.test(t));
}

// Curated PACKAGE-NAME -> PARENT-BADGE pool aliases (Aug 2026 Porsche scan).
//
// A named package resolves correctly to its own trim (Weissach, Touring), which
// stays for DISPLAY and rarity, but the archive titles those exact cars under a
// PARENT badge (Weissach under "GT3 RS", the GT3 Touring under "GT3 Touring"), so
// the package's OWN keyword returns ~0 comps: 911 Weissach kw=0 vs GT3 RS=448;
// bare 911 Touring kw=1 vs GT3 Touring=245 (and bare "Touring" also mis-pools
// against unrelated Touring-badged non-GT3 cars). poolTrimFor swaps ONLY the
// pooling trim (fetch keyword + classification trim-match) to the parent badge;
// the seller still sees the true package name. Same curated discipline as
// MODEL_FAMILY. Deliberately NARROW: only confirmed real, high-traffic mismatches.
// Bare "Touring" only (GT3 Touring already pools correctly, so it must not alias).
const PORSCHE_TRIM_ALIAS = [
  { model: /^911$/, trimRe: /weissach/i, parent: "GT3 RS" },
  { model: /^911$/, trimRe: /^touring$/i, parent: "GT3 Touring" },
];
export function poolTrimFor(vehicle) {
  const make = normHead(vehicle && vehicle.make);
  const model = normHead(vehicle && vehicle.model).replace(/ /g, "");
  const trim = asText(vehicle && vehicle.trim);
  if (!trim) return null;
  if (/porsche/.test(make)) {
    const hit = PORSCHE_TRIM_ALIAS.find(a => a.model.test(model) && a.trimRe.test(trim));
    if (hit) return hit.parent;
  }
  return null;
}
