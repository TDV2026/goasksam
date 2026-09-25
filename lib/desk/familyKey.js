// Sam Desk — model_family assignment (Stage C).
// =====================================================================
// deskModelFamily(row) is the SINGLE source of truth for the sales_archive
// model_family column (the grouping/record key). It is NOT the /sell comp-defrag
// map: lib/modelFamilies.js deliberately FOLDS the M3 into "3 Series" so a
// 3-Series comp fetch pulls M3 titles; that is correct for /sell comps and WRONG
// for a grouping/record key. A performance badge that is its OWN market (BMW M3,
// Mercedes 190E 2.3-16, Porsche 944 Turbo) must be its own model_family, never
// folded into the base family, or the record fix and the ranking members break.
//
// PRECEDENCE (first match wins):
//   1. Marque performance badge (standalone M-car / AMG / RS) via performanceBadge:
//      M3 -> "M3", C63 -> "C63", AMG GT -> "AMG GT", RS6 -> "RS6". Own market.
//   2. Curated own-market trim the badge/family logic misses: 944 Turbo, 190E 2.3-16.
//      Extend NARROWLY here, same discipline as MODEL_FAMILY (rule 16 own-market tiers).
//   3. Badged family head (3 Series, E-Class). An M-Performance trim (M340i, M240i)
//      is NOT a standalone M-car and folds into its base series here.
//   4. Base model (Camaro, 911, 240Z, a plain 944).
//
// Word-boundary safety (why M340i is not an M3): performanceBadge's \bM[2-8]\b needs
// a boundary after the digit, and "M340i" has "4" there, so it never reads as M3.
// =====================================================================

import { performanceBadge } from "../onebox.js";
import { MODEL_FAMILY } from "../modelFamilies.js";
import { modelTokens, titleModelTokens } from "../_classify.js";

// Curated OWN-MARKET trims the marque-badge + family logic does not cover. A plain
// 944 and a 944 Turbo are different markets, so they are different model_family
// values; the ranking lists them separately and the record for each is clean.
const OWN_MARKET_TRIM = [
  { make: /porsche/i, model: /^924$/i, trimRe: /\bturbo\b/i, family: "924 Turbo" },
  { make: /porsche/i, model: /^944$/i, trimRe: /\bturbo\s?s\b/i, family: "944 Turbo S" },
  { make: /porsche/i, model: /^944$/i, trimRe: /\bturbo\b/i, family: "944 Turbo" },
  { make: /porsche/i, model: /^968$/i, trimRe: /\bturbo\s?s\b/i, family: "968 Turbo S" },
  { make: /mercedes|benz/i, model: /^190\s?e?$/i, trimRe: /2\.?3[\s-]?16|2\.?5[\s-]?16|cosworth/i, family: "190E 2.3-16" },
];

// "3 series" -> "3 Series"; "e class" -> "E-Class"; "cls class" -> "CLS-Class".
function displayFamily(head) {
  const words = String(head).split(/\s+/);
  if (words.length === 2 && /^class$/i.test(words[1])) return words[0].toUpperCase() + "-Class";
  return words.map(w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Model-position tokens for a row: the model field plus the title's model-position
// tokens (after a leading year + make), so a chassis-led title ("E46 330i") is read.
function familyTokens(make, model, title) {
  const toks = modelTokens(model) || [];
  const tt = title ? (titleModelTokens(title, make) || []) : [];
  return toks.concat(tt).map(t => String(t).toLowerCase());
}

// A badged family head (3 Series, E-Class), or null. Folds an M-Performance trim
// (M340i) into its base series by stripping a leading M before the number.
function familyHeadFor(make, model, title) {
  const toks = familyTokens(make, model, title);
  for (const f of MODEL_FAMILY) {
    if (f.make && !f.make.test(String(make || "").toLowerCase())) continue;
    const hit = toks.some(t => f.badgeRe.test(t) || f.badgeRe.test(t.replace(/^m(?=\d)/, "")));
    if (hit) return displayFamily(f.head);
  }
  return null;
}

// row: { make, model, trim, title } (title = the listing title; used as a fallback
// source for the badge when the model field is generic, e.g. model "3 Series").
export function deskModelFamily(row) {
  const make = String((row && row.make) || "").trim();
  const model = String((row && row.model) || "").trim();
  const trim = String((row && row.trim) || "").trim();
  const title = String((row && row.title) || "").trim();
  if (!make) return model || null;

  // 1. marque performance badge (own market). Detect from model+trim first, then the
  //    title (rows whose model field is the generic family carry the badge only in the title).
  const pb = (performanceBadge(make, [model, trim].filter(Boolean).join(" "), "", title) || {}).badge
          || (title ? (performanceBadge(make, title, "", title) || {}).badge : null);
  if (pb) return pb;

  // 2. curated own-market trim.
  const own = OWN_MARKET_TRIM.find(o => o.make.test(make) && o.model.test(model) && (o.trimRe.test(trim) || o.trimRe.test(title)));
  if (own) return own.family;

  // 3. badged family head (folds M-Performance trims into the base series).
  const fam = familyHeadFor(make, model, title);
  if (fam) return fam;

  // 4. base model.
  return model || null;
}
