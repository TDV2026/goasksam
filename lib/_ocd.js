// OldCarsData API client. /makes and /models are free; /auctions is metered,
// so every /auctions call must be counted by the caller for usage logging.

export const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";

// Read OCD's rate-limit headers so the guard can reconcile against OCD's real
// remaining count instead of only our own tally. Header naming varies, so try
// the common forms. Present on 200s and 429s alike.
function readRateLimit(res) {
  const g = (...names) => { for (const n of names) { const v = res.headers.get(n); if (v != null && v !== "") return v; } return null; };
  return {
    remaining: g("x-ratelimit-remaining", "ratelimit-remaining", "x-rate-limit-remaining"),
    limit: g("x-ratelimit-limit", "ratelimit-limit", "x-rate-limit-limit"),
    reset: g("x-ratelimit-reset", "ratelimit-reset", "x-rate-limit-reset", "retry-after")
  };
}

export async function fetchJson(url, headers = {}, options = {}) {
  const res = await fetch(url, { headers, signal: options.signal });
  const rateLimit = readRateLimit(res);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${res.status}: ${json.message || json.error || "request failed"}`);
    err.status = res.status;
    err.rateLimited = res.status === 429;
    err.rateLimit = rateLimit;
    throw err;
  }
  try { Object.defineProperty(json, "__rateLimit", { value: rateLimit, enumerable: false }); } catch (e) {}
  return json;
}

export async function callOldCarsData(path, params, apiKey, options = {}) {
  const url = new URL(`${OLDCARSDATA_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return fetchJson(url.toString(), { Authorization: `Bearer ${apiKey}` }, options);
}
