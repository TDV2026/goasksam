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

// EEA (27 EU states) + UK + Switzerland - Consent Mode default DENIED here (not a blanket block):
// the tag still loads and a small Allow / No thanks banner decides whether analytics_storage turns
// on. No banner anywhere else - consent defaults to granted outside this set. ISO 3166-1 alpha-2,
// matching Vercel's x-vercel-ip-country header.
export const GA_CONSENT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",   // EEA/EU-27
  "IS", "LI", "NO",   // EEA (non-EU)
  "GB", "CH"          // UK, Switzerland
]);
// Old name kept as an alias - nothing outside this file should depend on which set is used for what.
export const GA_BLOCKED_COUNTRIES = GA_CONSENT_COUNTRIES;

// The bootstrap: byte-identical on every page carrying it.
// - Host-locked: never fires on a preview/alternate deployment host, only the real production site.
// - Crew: an inline cookie check is the fast path (zero round-trip for the common crew case);
//   api/gaConsent.js re-checks server-side since the inline check is not the authoritative gate.
// - Token/code pages (Task pause/stop/confirm, /api/crew, sign-in) never include this snippet at
//   all - that is enforced by NOT calling gaBootstrapHtml() from those handlers, not by a runtime
//   check here (see lib/analytics.js callers: railOpenHtml's `analytics` flag, api/_chrome.js's
//   page(), and api/sellPage.js - none of the token/code paths call any of them with analytics on).
// - No VIN, no token, ever: every path sent to GA is passed through redactPath() below, which
//   replaces any VIN/chassis-shaped segment (5 to 17 alphanumeric characters with at least one
//   digit - the same shape lib/vehicle.js and lib/_flags.js already use to recognise a VIN) with a
//   fixed placeholder, in BOTH page_path and page_location. Query params matching STRIP_PARAM_RE
//   are dropped outright rather than redacted (nothing about their value is safe to generalise).
// - Consent Mode (v2): for the EEA/UK/Switzerland set, the tag loads with analytics_storage
//   defaulted to denied (Google's "cookieless ping" mode) and a small, dismissable Allow / No
//   thanks banner decides whether to turn it on - the banner never renders outside that set. The
//   choice is remembered (localStorage) so a returning visitor is never asked twice.
const STRIP_PARAM_RE = "/^(q|vin|query|search|email|name|phone|address|token|code)$/i";
const VIN_SEGMENT_RE = "/^[a-z0-9]{5,17}$/i";

export function gaBootstrapHtml() {
  return `<script>(function(){
try{
if(location.hostname!=="goasksam.com")return;
if(/(?:^|; )gas_crew=v1[.]/.test(document.cookie))return;
}catch(e){return;}
var mid=${JSON.stringify(GA_MEASUREMENT_ID)};
var vinRe=${VIN_SEGMENT_RE};
function redactPath(path){
  return path.split("/").map(function(seg){
    if(!seg)return seg;
    return (vinRe.test(seg)&&/[0-9]/.test(seg))?":id":seg;
  }).join("/");
}
function cleanUrl(){
  var u=new URL(location.href);
  u.pathname=redactPath(u.pathname);
  var bad=${STRIP_PARAM_RE};
  var keys=[];u.searchParams.forEach(function(v,k){keys.push(k);});
  keys.forEach(function(k){if(bad.test(k))u.searchParams.delete(k);});
  return u;
}
fetch("/api/gaConsent",{credentials:"same-origin"}).then(function(r){return r.json();}).then(function(j){
  if(!j||!j.load)return;
  var needsConsent=!!j.consentRequired;
  var s=document.createElement("script");s.async=true;
  s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(mid);
  document.head.appendChild(s);
  window.dataLayer=window.dataLayer||[];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag=gtag;
  gtag("js",new Date());
  var stored=null;try{stored=localStorage.getItem("gas_ga_consent");}catch(e){}
  if(needsConsent){
    gtag("consent","default",{analytics_storage:"denied"});
    if(stored==="granted")gtag("consent","update",{analytics_storage:"granted"});
  }
  gtag("config",mid,{send_page_view:false,anonymize_ip:true});
  try{
    var u=cleanUrl();
    gtag("event","page_view",{page_location:u.toString(),page_path:u.pathname,page_title:document.title});
  }catch(e){ gtag("event","page_view",{page_path:redactPath(location.pathname),page_title:document.title}); }
  window.__gasGaEvent=function(name,props){ try{ gtag("event",name,props||{}); }catch(e){} };
  if(needsConsent&&!stored){
    try{
      var b=document.createElement("div");
      b.setAttribute("role","dialog");b.setAttribute("aria-label","Analytics consent");
      b.style.cssText="position:fixed;left:16px;right:16px;bottom:16px;max-width:420px;margin:0 auto;background:#fff;border:1px solid #DCD8CC;border-radius:12px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,.12);font:400 14px/1.4 system-ui,-apple-system,sans-serif;color:#15201A;z-index:9999";
      b.innerHTML="<p style='margin:0 0 10px'>We use analytics to see how the site is used. No personal data.</p>";
      var allow=document.createElement("button");allow.textContent="Allow";
      allow.style.cssText="min-height:36px;padding:0 14px;margin-right:8px;border:0;border-radius:8px;background:#1E4D38;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer";
      var no=document.createElement("button");no.textContent="No thanks";
      no.style.cssText="min-height:36px;padding:0 14px;border:1px solid #DCD8CC;border-radius:8px;background:#fff;color:#15201A;font:500 14px system-ui,sans-serif;cursor:pointer";
      allow.onclick=function(){try{localStorage.setItem("gas_ga_consent","granted");}catch(e){}gtag("consent","update",{analytics_storage:"granted"});b.remove();};
      no.onclick=function(){try{localStorage.setItem("gas_ga_consent","denied");}catch(e){}b.remove();};
      b.appendChild(allow);b.appendChild(no);
      document.body.appendChild(b);
    }catch(e){}
  }
}).catch(function(){});
})();</script>`;
}
