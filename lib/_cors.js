// ONE CORS HELPER (security job E, F-06; Sam approved, Oct 21 2026; Lane C). Every page calls its API from goasksam.com
// itself (same origin, so CORS never applies). A cross-origin answer header is given only to GoAskSam's own hosts: the
// site, www, and this project's Vercel preview hosts. Any other site gets no Access-Control-Allow-Origin, so its pages
// cannot make their visitors' browsers call the engine, chat or lead APIs (spreading load past per-address limits).
// `pub: true` keeps "*" for a truly public static read (the daily pulse, the page-view pixel).
const ALLOWED = new Set(["https://goasksam.com", "https://www.goasksam.com"]);
const PREVIEW = /^https:\/\/goasksam-[a-z0-9-]+-sam-s-projects-4277cbfa\.vercel\.app$/;
export function allowedOrigin(origin) {
  const o = String(origin || "");
  return ALLOWED.has(o) || PREVIEW.test(o) ? o : null;
}
// Sets the CORS headers for this response. Returns true when the request is a preflight that was answered here.
export function cors(req, res, { methods = "POST, OPTIONS", headers = "Content-Type", pub = false } = {}) {
  const o = allowedOrigin(req.headers && req.headers.origin);
  if (pub) res.setHeader("Access-Control-Allow-Origin", "*");
  else { res.setHeader("Vary", "Origin"); if (o) res.setHeader("Access-Control-Allow-Origin", o); }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", headers);
  return false;
}
