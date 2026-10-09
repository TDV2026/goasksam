// Google Analytics 4, consent-gated (Oct 2026). One-engine rule: ONE snippet, ONE consent check,
// used by every public page exactly once - never a second copy, never a per-page variant.
//
// WHY THIS NEVER VARIES A CACHED PAGE: public pages are served s-maxage + stale-while-revalidate
// with no Vary (the same cached HTML for every visitor, by design - see api/marketCheck.js etc).
// The crew/country decision therefore CANNOT be made at render time (that would require Vary or a
// private response) - it is made in the BROWSER, after the cached HTML has already loaded, by
// calling a tiny uncached endpoint (api/gaConsent.js, Cache-Control: private, no-store). The
// bootstrap script below is byte-identical on every page load; only its RUNTIME fetch differs.
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "G-DR9CZF78GY";

// EEA (27 EU states) + UK + Switzerland - no consent banner yet, so GA never loads here at all
// (Oct 2026 decision, see docs/lane-notes.md "GA consent gate" entry - revisit once a consent
// banner exists). ISO 3166-1 alpha-2, matching Vercel's x-vercel-ip-country header.
export const GA_BLOCKED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",   // EEA/EU-27
  "IS", "LI", "NO",   // EEA (non-EU)
  "GB", "CH"          // UK, Switzerland
]);

// Query params that can carry typed text, a VIN, or anything else personal - stripped from the
// page_location GA sees, on every page, before the manual page_view fires. Named defensively: any
// param whose name suggests free text or an identifier is dropped, not just the two Sam named.
const STRIP_PARAM_RE = /^(q|vin|query|search|email|name|phone|address|token|code)$/i;

// The bootstrap: byte-identical on every page. Checks the crew cookie INLINE (zero round-trip for
// the common crew case), otherwise asks api/gaConsent.js (country + a second crew check, since the
// endpoint is the authoritative gate - the inline check is a fast path, not the real decision).
// send_page_view:false + one manual page_view with a cleaned page_location - never the raw URL,
// never a user id, never an email. GA4's own client_id (its _ga cookie) is left alone: it is
// already a random identifier, not personal data, and overriding it would fight the library.
export function gaBootstrapHtml() {
  return `<script>(function(){
try{if(/(?:^|; )gas_crew=ok(?:;|$)/.test(document.cookie))return;}catch(e){}
var mid=${JSON.stringify(GA_MEASUREMENT_ID)};
fetch("/api/gaConsent",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){
  if(!j||!j.load)return;
  var s=document.createElement("script");s.async=true;
  s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(mid);
  document.head.appendChild(s);
  window.dataLayer=window.dataLayer||[];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag=gtag;
  gtag("js",new Date());
  gtag("config",mid,{send_page_view:false,anonymize_ip:true});
  try{
    var u=new URL(location.href);
    var bad=${STRIP_PARAM_RE};
    var keys=[];u.searchParams.forEach(function(v,k){keys.push(k);});
    keys.forEach(function(k){if(bad.test(k))u.searchParams.delete(k);});
    gtag("event","page_view",{page_location:u.toString(),page_path:u.pathname,page_title:document.title});
  }catch(e){ gtag("event","page_view",{page_path:location.pathname,page_title:document.title}); }
}).catch(function(){});
})();</script>`;
}
