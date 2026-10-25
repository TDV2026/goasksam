// Source-row corrections (Round 5 Lane B job, Oct 2026, Merkur XR4Ti/Ford Sierra RS Cosworth fix).
//
// THE PROBLEM a direct one-row UPDATE does not solve: scripts/ingest.js writes OldCarsData's
// make/model fields verbatim. A row corrected by hand in sales_archive survives only until the
// NEXT time that same upstream OCD record is re-ingested (a backfill, a re-run of a date range,
// or any future delta that happens to touch it again) - at which point the UPSERT overwrites the
// correction right back to OCD's own (wrong) values, since nothing told ingest the row needed a
// different answer than what the source feed says.
//
// THE KEY: (platform, source_id) - the SAME natural key sales_archive's own unique constraint
// upserts on, NOT this table's own internal id column. The internal id is a DB-generated UUID that
// does not exist yet on a freshly-fetched OCD record at ingest time (it is only assigned once the
// row is first inserted), so a correction list keyed on it would never match at the one moment
// (ingest) this fix most needs to fire. platform + source_id is present on every OCD record from
// the moment it is fetched, before any insert happens, and stays the row's identity across every
// future re-ingest of the same listing.
//
// Confirmed case: Bring a Trailer listing #176322 (a real 1987 Ford Sierra RS Cosworth) carries
// OldCarsData's own upstream mislabel - make="Merkur", model="XR4Ti" (ocd_make_name/ocd_model_name
// both say so in raw_record) - verified against the record's own listing_title, description, VIN
// and engine spec, all unambiguously Ford Sierra RS Cosworth, never a Merkur. Corrected directly
// in the table this round (archive row id 0df5e83d-ed54-4d35-8a7b-ea1caa260f01, task=fixMerkurRow);
// this list is what makes that correction survive every future ingest of the same listing.
export const SOURCE_ROW_CORRECTIONS = {
  "bringatrailer|176322": { make: "Ford", model: "Sierra RS Cosworth" },
  // BaT 1954 Mercedes-Benz 300b Cabriolet D: OldCarsData filed it under model "300SL", so it read as a 300SL sale in the 300SL Roadster pool. The label is the one the
  // archive already uses for its sibling 300b Cabriolet D rows (Bonhams 2021 and 2017). Confirmed by a keyed read: source_slug bringatrailer, 2022-10-29.
  "bringatrailer|124485": { model: "300b Cabriolet D" }
};

// Normalized to bare alnum before lowercasing, so the DISPLAY LABEL sales_archive.platform stores
// ("Bring a Trailer") and the lowercase SLUG scripts/ingest.js's own fresh row carries
// ("bringatrailer") collapse to the identical key - this sidesteps the exact label/slug mismatch
// already documented elsewhere in this codebase (isHouseSource's own slug-vs-label bug) rather than
// needing a second label-to-slug map just for this lookup.
const keyOf = (platform, sourceId) => `${String(platform || "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${String(sourceId || "")}`;

// Applies any matching correction to a row IN PLACE (mutates and returns the same object) when the
// row's (platform, source_id) is known to this list. Both fields are read from whichever field name
// the caller's row shape uses (ingest's fresh OCD record vs. an already-stored archive row use
// different field names for the same value). A row that matches nothing is returned unchanged -
// this is a pure lookup, never a guess, never applied by any other signal (title, VIN, make/model)
// that could accidentally touch an unrelated row.
// A corrected row remembers the make and model it was stored with (a WeakMap, so nothing is added to the row and nothing reaches an answer).
const WAS = new WeakMap();
export function applyRowCorrection(row) {
  if (!row) return row;
  const platform = row.source_slug || row.platform || row.source || null;
  const sourceId = row.source_id || row.source_record_id || row.id_on_source || null;
  if (!platform || !sourceId) return row;
  const fix = SOURCE_ROW_CORRECTIONS[keyOf(platform, sourceId)];
  if (!fix) return row;
  if ((fix.make !== undefined && fix.make !== row.make) || (fix.model !== undefined && fix.model !== row.model)) WAS.set(row, { make: row.make, model: row.model });
  Object.assign(row, fix);
  return row;
}

// ONE RULE FOR EVERY CORRECTED ROW (Sam's row 34 ruling, Oct 25 2026): a row whose correction moves it OUT of the make or model a pool asked for is dropped
// from that pool. The database still holds the wrong label, so the pool's query fetches the row; the correction then says it is another car. A row that
// was stored under the asked make/model and no longer carries it (after the correction) is out; a row whose title still names the asked model stays.
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sameName = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
export function movedOutOf(row, spec) {
  const was = WAS.get(row);
  if (!was || !spec) return false;
  const title = norm(`${row.raw_title || ""} ${row.rtitle || ""} ${row.listing_title || ""}`);
  if (spec.make && sameName(was.make, spec.make) && !sameName(row.make, spec.make)) return true;
  if (spec.model && sameName(was.model, spec.model) && !sameName(row.model, spec.model) && !title.includes(norm(spec.model))) return true;
  return false;
}
// What the table changes, for the report and the prePush check: every entry that changes a row's make or model.
export function correctionsThatMoveRows() { return Object.entries(SOURCE_ROW_CORRECTIONS).filter(([, f]) => f.make !== undefined || f.model !== undefined).map(([k, f]) => ({ key: k, ...f })); }

// Batch form for an ingest pass writing many rows at once, or a pool read handling many rows.
export function applyRowCorrections(rows) {
  for (const r of rows || []) applyRowCorrection(r);
  return rows;
}
