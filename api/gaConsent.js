// Tiny, uncached GA consent check (Oct 2026). The browser calls this BEFORE loading the GA tag -
// see lib/analytics.js's own comment for why this decision can never be made by varying a cached
// page. Answers {load:false} for crew (gas_crew=ok cookie) and for visitors in the EEA, UK or
// Switzerland (no consent banner yet - see docs/lane-notes.md). {load:true} otherwise.
// Cache-Control: private, no-store - this response is never cached, never varies a public page.
import { GA_BLOCKED_COUNTRIES } from "../lib/analytics.js";

import { isCrewRequest } from "../lib/_crew.js";
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {} }
  });
  return out;
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "OPTIONS") return res.status(405).json({ load: false });
  const cookies = parseCookies(req.headers.cookie);
  const isCrew = isCrewRequest(req);   // signed crew cookie (lib/_crew.js)
  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  const blocked = GA_BLOCKED_COUNTRIES.has(country);
  return res.status(200).json({ load: !isCrew && !blocked });
}
