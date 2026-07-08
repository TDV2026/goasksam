// OldCarsData API client. /makes and /models are free; /auctions is metered,
// so every /auctions call must be counted by the caller for usage logging.

export const OLDCARSDATA_BASE = "https://api.oldcarsdata.com";

export async function fetchJson(url, headers = {}, options = {}) {
  const res = await fetch(url, { headers, signal: options.signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status}: ${json.message || json.error || "request failed"}`);
  }
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
