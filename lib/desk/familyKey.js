// Sam Desk — model_family assignment (Stage C).
// =====================================================================
// deskModelFamily(row) is the SINGLE source of truth for the sales_archive
// model_family column (the grouping/record key). It is NOT the /sell comp-defrag
// map: lib/modelFamilies.js deliberately FOLDS the M3 into "3 Series" so a
// 3-Series comp fetch pulls M3 titles; that is correct for /sell comps and WRONG
// for a grouping/record key.
//
// FOUR standing rules (dry-run review, Sep 2026):
//  - A performance badge that is its OWN market (BMW M3, Mercedes C63/190E 2.3-16,
//    Porsche 944 Turbo, the classic 300SL/190SL) is its OWN family, never folded
//    into the base family — the record fix and the ranking members depend on it.
//  - A chassis / generation CODE is NEVER a family (996/997/991/992/930/964/993 -> 911;
//    C3 -> Corvette; E30 -> 3 Series). The code lives in the generation dimension.
//  - No family is named "Unknown"/blank: a junk model returns null so the row is
//    excluded from family reads (never a bogus "Unknown" family).
//  - An M-Performance TRIM (M340i) is NOT a standalone M-car and folds into its base
//    series.
//
// PRECEDENCE (first match wins):
//   1. junk / blank model            -> null (excluded from family reads)
//   2. marque performance badge      -> the badge (M3, C63, AMG GT, RS6)
//   3. curated own-market trim       -> the trim market (944 Turbo, 190E 2.3-16)
//   4. own-market model a family map would swallow -> the model (300SL, 190SL)
//   5. chassis/generation code       -> its BASE model (996 -> 911, C3 -> Corvette, E30 -> 3 Series)
//   6. badged family head            -> the family (328i -> 3 Series; E-Class; SL-Class)
//   7. base model                    -> Camaro, 911, 240Z, a plain 944
// =====================================================================

import { performanceBadge } from "../onebox.js";
import { familyFor, MODEL_FAMILY } from "../modelFamilies.js";
import { modelTokens, titleModelTokens } from "../_classify.js";
import { CURATED_GENERATIONS } from "../generations.js";

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");

// Model values that carry no real nameplate — never a family.
const JUNK_MODEL = new Set(["", "unknown", "n/a", "na", "none", "null", "other", "various", "misc", "tbd", "-", "?", "unspecified", "unlisted", "no model", "nomodel"]);
function isJunk(model) { const n = norm(model); return !n || JUNK_MODEL.has(String(model || "").toLowerCase().trim()) || JUNK_MODEL.has(n); }

// Curated OWN-MARKET trims the marque-badge + family logic does not cover. A plain 944
// and a 944 Turbo are different markets, so they are different model_family values.
const OWN_MARKET_TRIM = [
  { make: /porsche/i, model: /^924$/i, trimRe: /\bturbo\b/i, family: "924 Turbo" },
  { make: /porsche/i, model: /^944$/i, trimRe: /\bturbo\s?s\b/i, family: "944 Turbo S" },
  { make: /porsche/i, model: /^944$/i, trimRe: /\bturbo\b/i, family: "944 Turbo" },
  { make: /porsche/i, model: /^968$/i, trimRe: /\bturbo\s?s\b/i, family: "968 Turbo S" },
  { make: /mercedes|benz/i, model: /^190\s?e?$/i, trimRe: /2\.?3[\s-]?16|2\.?5[\s-]?16|cosworth/i, family: "190E 2.3-16" },
];

// ---- reverse generation-code index (built once) ----
// CODE_OWNERS: make|code -> [{model, md, perf}]. MODEL_ISBASE: make|model -> is it a TRUE
// base, not a chassis-code ALIAS. A model is an ALIAS when it is CODE-SHAPED (996/991/992)
// AND its code-set is a strict subset of a fuller model's (911 owns 901..992, so 991's
// {991.1,991.2} makes 991 an alias of 911). A WORD model that merely shares codes (Cayman
// shares 987/981/718 with Boxster) is NEVER an alias — only code-shaped models are.
const CODE_OWNERS = new Map();
const MODEL_CODES = new Map();   // make|model -> Set(code)
function codeShapedModel(md) { return /^\d{2,3}$/.test(md) || /^[a-z]\d{2,3}$/.test(md) || /^c\d$/.test(md); }
for (const g of CURATED_GENERATIONS) {
  const mk = norm(g.make), md = norm(g.model), cd = norm(g.code);
  const ck = mk + "|" + cd;
  (CODE_OWNERS.get(ck) || CODE_OWNERS.set(ck, []).get(ck)).push({ model: g.model, md, perf: !!performanceBadge(g.make, g.model) });
  const mkey = mk + "|" + md;
  (MODEL_CODES.get(mkey) || MODEL_CODES.set(mkey, new Set()).get(mkey)).add(cd);
}
const MODEL_ISBASE = new Map();
for (const [mkey, codes] of MODEL_CODES) {
  const [mk, md] = mkey.split("|");
  let alias = false;
  if (codeShapedModel(md)) {
    for (const [okey, ocodes] of MODEL_CODES) {
      if (okey === mkey || !okey.startsWith(mk + "|")) continue;
      if (ocodes.size > codes.size && [...codes].every(c => ocodes.has(c))) { alias = true; break; }
    }
  }
  MODEL_ISBASE.set(mkey, !alias);
}
function trueBaseOwners(mk, code) { return (CODE_OWNERS.get(mk + "|" + code) || []).filter(o => MODEL_ISBASE.get(mk + "|" + o.md)); }

// A chassis/generation code -> its BASE model, or null when the model is not a code.
// title disambiguates a code shared by two bases (718 -> Boxster vs Cayman).
function codeBaseFor(make, model, title) {
  const mk = norm(make), nm = norm(model);
  if (!nm) return null;
  let owners = trueBaseOwners(mk, nm);                 // the model IS a code (996, e30, c3, 930)
  if (!owners.length && /^\d{3}$/.test(nm)) {          // a numeric mirror whose codes are suffixed (991 -> 991.1/991.2)
    for (const [k, arr] of CODE_OWNERS) if (k.startsWith(mk + "|" + nm + ".")) owners = owners.concat(arr.filter(o => MODEL_ISBASE.get(mk + "|" + o.md)));
  }
  if (!owners.length) return null;
  const uniq = [...new Map(owners.map(o => [o.md, o])).values()];
  if (uniq.length === 1) return uniq[0].model;
  const t = norm(title);
  const byTitle = uniq.find(o => t.includes(o.md));
  if (byTitle) return byTitle.model;
  return (uniq.find(o => !o.perf) || uniq[0]).model;   // prefer the non-performance base (E30 -> 3-Series, not M3)
}

// "3 series"/"3-series" -> "3 Series"; "e class" -> "E-Class".
function displayFamily(head) {
  const words = String(head).replace(/-/g, " ").split(/\s+/);
  if (words.length === 2 && /^class$/i.test(words[1])) return words[0].toUpperCase() + "-Class";
  return words.map(w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function familyTokens(make, model, title) {
  const toks = modelTokens(model) || [];
  const tt = title ? (titleModelTokens(title, make) || []) : [];
  return toks.concat(tt).map(t => String(t).toLowerCase());
}
// A badged family head (3 Series, E-Class), or null. Folds an M-Performance trim (M340i)
// into its base series by stripping a leading M before the number.
function familyHeadFor(make, model, title) {
  const toks = familyTokens(make, model, title);
  for (const f of MODEL_FAMILY) {
    if (f.make && !f.make.test(String(make || "").toLowerCase())) continue;
    if (toks.some(t => f.badgeRe.test(t) || f.badgeRe.test(t.replace(/^m(?=\d)/, "")))) return displayFamily(f.head);
  }
  return null;
}

// A classic 3-digit SL (300SL Gullwing, 190SL, 280SL Pagoda, 450SL) is its OWN market and
// must never be folded into the modern SL-Class by the family map's \d{3}sl branch.
function classicSL(make, model, title) {
  if (!/mercedes|benz/i.test(String(make || ""))) return null;
  const m = String(model || "").replace(/[\s-]/g, "").match(/^(\d{3})sl$/i);
  if (m) return m[1] + "SL";
  const tm = String(title || "").match(/\b(\d{3})\s?-?sl\b/i);
  if (tm) return tm[1] + "SL";
  return null;
}

// row: { make, model, trim, title } (title = the listing title; a fallback source for the
// badge when the model field is generic, and for code / SL disambiguation).
export function deskModelFamily(row) {
  const make = String((row && row.make) || "").trim();
  const model = String((row && row.model) || "").trim();
  const trim = String((row && row.trim) || "").trim();
  const title = String((row && row.title) || "").trim();
  if (!make) return null;

  // 1. junk / blank model -> null (never an "Unknown" family)
  if (isJunk(model)) return null;

  // 2. marque performance badge (own market)
  const pb = (performanceBadge(make, [model, trim].filter(Boolean).join(" "), "", title) || {}).badge
          || (title ? (performanceBadge(make, title, "", title) || {}).badge : null);
  if (pb) return pb;

  // 3. curated own-market trim
  const own = OWN_MARKET_TRIM.find(o => o.make.test(make) && o.model.test(model) && (o.trimRe.test(trim) || o.trimRe.test(title)));
  if (own) return own.family;

  // 4. own-market model a family map would swallow (classic SL)
  const sl = classicSL(make, model, title);
  if (sl) return sl;

  // 5. chassis / generation code -> its base model (never a family)
  const effModel = codeBaseFor(make, model, title) || model;

  // 6. badged family head (head match first, then a badge -> family)
  const head = familyFor(make, effModel);
  if (head) return displayFamily(head.head);
  const fam = familyHeadFor(make, effModel, title);
  if (fam) return fam;

  // 7. base model
  return effModel || null;
}
