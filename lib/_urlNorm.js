// Normalised listing URL for an INDEXED exact match (so a pasted listing link resolves with no
// unindexed scan). Lowercase, protocol + leading www stripped, query string and fragment dropped,
// trailing slash removed. Stored in sales_archive.url_norm / auction_attempts.url_norm, stamped at
// ingest and matched by the MCP car_history tool.
export function normalizeListingUrl(u) {
  let s = String(u || "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("#")[0].split("?")[0];
  s = s.replace(/\/+$/, "");
  return s || null;
}

// A bare Bring a Trailer slug ("2005-porsche-911-carrera-s-coupe-84") -> the canonical normalised URL,
// so a slug the user pastes resolves through the SAME indexed url_norm match (no scan).
export function batSlugToUrlNorm(slug) {
  const sl = String(slug || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!sl || !/^[a-z0-9][a-z0-9-]*$/.test(sl)) return null;
  return `bringatrailer.com/listing/${sl}`;
}

// Pick the best url_norm to store for a record: its listing url, else the source_url.
export function recordUrlNorm(r) {
  return normalizeListingUrl((r && (r.url || r.source_url)) || null);
}
