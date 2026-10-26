// The ten real columns of docs/supabase-raw-columns.sql plus their marker, written from the same record fields raw_record holds. ONE definition
// for every writer of sales_archive.raw_record (scripts/ingest.js, scripts/pullSources.js). Off unless INGEST_RAW_COLUMNS=1, because writing a
// column that is not there yet fails the whole insert. A writer that changes raw_record WITHOUT writing these would leave a stale copy behind
// the marker, so any new writer of sales_archive.raw_record must call this.
// The one place that decides on or off, so the nightly log line and the writer can never disagree.
export function rawColumnsOn() { return process.env.INGEST_RAW_COLUMNS === "1"; }
export function rawColumnsLine() { return `raw columns: ${rawColumnsOn() ? "on" : "off"}`; }
export function rawColumnsOf(r) {
  if (!rawColumnsOn()) return {};
  return {
    image_url: r.featured_image_url ?? null, mileage_text: r.mileage == null ? null : String(r.mileage), transmission_text: r.transmission ?? null,
    currency: r.currency ?? null, listing_url: r.url ?? null, source_url: r.source_url ?? null, city: r.city ?? null, state: r.state ?? null,
    country_code: r.country_code ?? null, end_precision: r.auction_end_precision ?? null, raw_cols_at: new Date().toISOString()
  };
}
