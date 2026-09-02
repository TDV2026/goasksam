// Market-spec capability (Sep 2026): recognize federalized-vs-grey-market
// designations and wheelbase/body variants, and separate comp pools by them.
// This is ONE shared, data-driven mechanism: adding a nameplate is a data entry
// in MARKET_SPEC_MAP, not a new code path.
//
// Why it exists: a "1997 Land Rover Defender 90 NAS" (federalized North American
// Spec) trades in a wholly different market than a grey-market / Euro-spec Defender
// (different drivetrain, history, buyer pool; NAS 90s are rarer and far dearer).
// Pooling them undifferentiated blends an $80-120k market with $27k grey imports.
//
// Two signals, in priority order:
//   1. VIN WMI prefix  (structured, reliable)   e.g. SALD* = NAS, SALL* = grey.
//   2. Title token      (fallback when no VIN)    e.g. "NAS" / "North American Spec".
//
// SWEEP FINDINGS (Sep 2026 archive scan, documented so the gaps are not
// re-litigated blind). Only Defender had a clean, high-volume dual signal:
//   - Nissan Skyline GT-R: the "Motorex-federalized vs grey" split has NO reliable
//     signal (motorex title token = 0; R32/R33/R34 are all grey chassis-code VINs
//     BNR32/BCNR33/BNR34, the R35 JN1AR5* is a separate factory-US generation).
//     The real separable axis is GENERATION, not market-spec. GAP, not built.
//   - Toyota Land Cruiser: VIN JT* marks US-market but title tokens are ~absent
//     (jdm = 0) and the nameplate is heterogeneous (FJ40..200 + 70-series). No
//     clean dual signal. GAP, not built.
//   - Mercedes G-Wagen: VIN-separable (WDC/W1N US vs WDB/460 Euro) but the grey
//     subset is ~12 records; modern is nearly all US. Low-volume. GAP, not built.
//   - Porsche 959: the nameplate cannot even be cleanly identified (the "959"
//     title match is substring-polluted, almost no WP0* VINs, too few real cars).
//     GAP, not built.
// When one of these gains a reliable signal (a briefing flag, richer titles, or a
// VIN-generation map), add it to MARKET_SPEC_MAP and it inherits the whole pipeline.

// Words that name a market spec, never a make or model. Excluded from
// make-inference so "North American Spec" never misfires to Rambler American
// (the same class of bug as body-style words driving a make inference).
export const MARKET_SPEC_WORDS = new Set([
  "nas", "north", "american", "spec", "federalized", "federalised",
  "grey", "gray", "euro", "jdm", "import", "market", "canepa", "motorex"
]);

// Per-nameplate definitions. `specs` are the named designations; `grey*` is the
// catch-all "other market"; `variants` is an orthogonal axis (wheelbase) that
// also must not blend. All matchers are anchored regexes.
export const MARKET_SPEC_MAP = [
  {
    key: "landrover-defender",
    make: /^land\s*rover$/i,
    model: /^defender/i,
    // Two mutually exclusive markets. VIN 4th char is the discriminator: NAS
    // Defenders are SALD*, grey/Euro are SALL*. Both are full specs so either can
    // be the SEARCHED designation (the seller may own a grey-market import) and be
    // matched symmetrically.
    specs: [
      {
        key: "nas",
        label: "North American Spec",
        short: "NAS",
        // "It's a North American spec" / "NAS" / "federalized US truck".
        aliases: [/\bnas\b/i, /north\s*american\s*spec/i, /federali[sz]ed/i, /\bus[- ]?spec\b/i],
        vinPrefixes: [/^SALD/i],
        titleTokens: [/\bnas\b/i, /north\s*american\s*spec/i, /federali[sz]ed/i]
      },
      {
        key: "grey",
        label: "grey-market / Euro-spec",
        short: "Euro-spec",
        aliases: [/gr[ae]y[- ]?market/i, /euro[- ]?spec/i, /euro\s*import/i, /\bjdm\b/i],
        vinPrefixes: [/^SALL/i],
        titleTokens: [/gr[ae]y[- ]?market/i, /euro[- ]?spec/i, /\bjdm\b/i]
      }
    ],
    variants: {
      key: "wheelbase",
      label: "wheelbase",
      // Bare 90/110/130 next to Defender is the wheelbase. Anchored so a stray
      // number elsewhere in a title cannot trigger it. \b before the number never
      // matches inside a 4-digit year (all-digit run, no boundary).
      values: [
        { key: "90", label: "90", aliases: [/\bd?90\b/i], titleTokens: [/\bd?90\b/i] },
        { key: "110", label: "110", aliases: [/\bd?110\b/i], titleTokens: [/\bd?110\b/i] },
        { key: "130", label: "130", aliases: [/\bd?130\b/i], titleTokens: [/\bd?130\b/i] }
      ]
    }
  }
];

export function marketSpecEntryFor(make, model) {
  const mk = String(make || "").trim();
  const md = String(model || "").trim();
  if (!mk || !md) return null;
  return MARKET_SPEC_MAP.find(e => e.make.test(mk) && e.model.test(md)) || null;
}

// Read the searched designation + variant out of the user's raw text for a
// matched nameplate. Returns the matched spec/variant and the exact source
// substrings so the resolver can strip them from the trim (no junk "Spec").
export function detectSearchSpec(entry, text) {
  const t = String(text || "");
  let spec = null, specSource = null;
  for (const s of entry.specs) {
    const hit = s.aliases.map(re => t.match(re)).find(Boolean);
    if (hit) { spec = s; specSource = hit[0]; break; }
  }
  let variant = null, variantSource = null;
  if (entry.variants) {
    for (const v of entry.variants.values) {
      const hit = v.aliases.map(re => t.match(re)).find(Boolean);
      if (hit) { variant = v; variantSource = hit[0]; break; }
    }
  }
  if (!spec && !variant) return null;
  return {
    specKey: spec?.key || null,
    specLabel: spec?.label || null,
    specShort: spec?.short || null,
    variantKey: variant?.key || null,
    variantLabel: variant?.label || null,
    sources: [specSource, variantSource].filter(Boolean)
  };
}

// Classify one comp record's spec + variant from its VIN (primary) and title
// (fallback). Pure: caller passes the already-derived vin + lowercased title.
export function classifyRecordSpec(entry, { vin, title }) {
  const v = String(vin || "").toUpperCase();
  const ti = String(title || "");
  let specKey = null;
  // VIN primary.
  for (const s of entry.specs) if (s.vinPrefixes?.some(re => re.test(v))) { specKey = s.key; break; }
  // Title fallback, only when the VIN said nothing.
  if (!specKey) {
    for (const s of entry.specs) if (s.titleTokens?.some(re => re.test(ti))) { specKey = s.key; break; }
  }
  let variantKey = null;
  if (entry.variants) {
    for (const vv of entry.variants.values) if (vv.titleTokens.some(re => re.test(ti))) { variantKey = vv.key; break; }
  }
  return { specKey, variantKey };
}

// True when the searched spec/variant conflicts with the record's, i.e. the
// record is a different market and must not dilute the pool. Conservative,
// mirroring the body-style guard: an UNKNOWN record spec never excludes; only a
// KNOWN, conflicting one does.
export function recordConflictsWithSearch(search, recSpec) {
  if (!search) return null;
  if (search.specKey && recSpec.specKey && recSpec.specKey !== search.specKey) {
    return "different market spec (federalized vs grey-market)";
  }
  if (search.variantKey && recSpec.variantKey && recSpec.variantKey !== search.variantKey) {
    return "different wheelbase";
  }
  return null;
}
