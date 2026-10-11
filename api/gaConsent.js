// Tiny, uncached GA consent check (Oct 2026). The browser calls this BEFORE loading the GA tag -
// see lib/analytics.js's own comment for why this decision can never be made by varying a cached
// page. {load:false} for crew (signed gas_crew cookie) and for any request not addressed to the
// real production host (defense in depth - the bootstrap script already host-locks itself).
// {load:true, consentRequired:true} for the EEA/UK/Switzerland set - the tag loads with Consent
// Mode defaulted to denied and the small Allow/No-thanks banner decides from there (lib/
// analytics.js). {load:true, consentRequired:false} everywhere else.
// Cache-Control: private, no-store - this response is never cached, never varies a public page.
import { GA_CONSENT_COUNTRIES } from "../lib/analytics.js";
import { isCrewRequest } from "../lib/_crew.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "OPTIONS") return res.status(405).json({ load: false });
  const host = String(req.headers.host || "").toLowerCase();
  if (host !== "goasksam.com") return res.status(200).json({ load: false });
  const isCrew = isCrewRequest(req);   // signed crew cookie (lib/_crew.js)
  if (isCrew) return res.status(200).json({ load: false });
  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const consentRequired = GA_CONSENT_COUNTRIES.has(country);
  return res.status(200).json({ load: true, consentRequired });
}
