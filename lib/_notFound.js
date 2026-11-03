// The ordinary 404 for a crew-only address asked without the crew cookie (Oct 2026 Job 2; Nov 3 2026, lane-e-hidecrew). A crew-only page must look like it never existed:
// the SAME status, headers and body as an address that was never there, with no redirect, no sign-in text, no header of its own.
// Two ways to get there: (1) the page case is handled at the router - vercel.json rewrites a crew-only address only for a request carrying the crew cookie, so without it
// no rewrite matches and the PLATFORM answers its own 404, byte for byte; (2) a function that is reached anyway (a direct /api address, a forged cookie the router cannot
// verify, the partner preview's code door) answers through this: the platform's 404 page as captured from an unknown address (lib/_notFoundTemplate.js), the plain-text
// variant for a non-browser Accept, the request's own x-vercel-id inside, x-vercel-error: NOT_FOUND, and every header the caller set before deciding (a robots tag, a cookie,
// a location, a referrer policy) removed so none of them tells a stranger something is here.
import { NATIVE_404_HTML } from "./_notFoundTemplate.js";
export function sendDisguisedNotFound(res, req) {
  for (const h of ["x-robots-tag", "referrer-policy", "set-cookie", "location", "content-disposition", "x-content-type-options-extra"]) { try { res.removeHeader && res.removeHeader(h); } catch { /* a response without removeHeader (a test stub) has none set */ } }
  const hd = (req && req.headers) || {}, id = String(hd["x-vercel-id"] || "").replace(/[^a-z0-9:-]/gi, ""), wantsHtml = /text\/html/i.test(String(hd.accept || ""));
  res.setHeader("x-vercel-error", "NOT_FOUND");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  if (wantsHtml) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(404).send(NATIVE_404_HTML.split("__ID__").join(id)); }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(404).send("The page could not be found\n\nNOT_FOUND\n\n" + id + "\n");
}
