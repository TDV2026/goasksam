// Shared consent banner (Lane A, Job 6, Oct 2026). One component, spliced into every public page,
// not owned by any one product's own shell system (index.html, lib/appShell.js, api/_chrome.js,
// About/Privacy all have their own, separate page chrome - this is the one piece common to all of
// them). Cookie name/values match lib/track/consent.js exactly (gas_consent: "granted"/"declined",
// 13 months, Path=/, SameSite=Lax) - a REGULAR cookie, not HttpOnly, since this one is set by the
// browser itself, never the server. Region check reuses the SAME /api/track?consent=1 endpoint the
// tracking helper (api/track.js) already calls - no second mechanism, no page carries its own
// region flag. gasShowConsentBanner() is always defined (not gated by region) so the footer's
// "Privacy choices" link works in an open region too.
export const CONSENT_BANNER_CSS = `
.gas-consent-banner{position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;flex-wrap:wrap;align-items:center;gap:14px 20px;padding:16px 20px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));background:#FFFFFF;border-top:1px solid #DCD8CC;box-shadow:0 -4px 20px rgba(21,32,26,.12);font-family:var(--sans,-apple-system,system-ui,sans-serif)}
.gas-consent-banner[hidden]{display:none}
.gas-consent-banner p{margin:0;flex:1 1 320px;min-width:240px;font-size:14px;line-height:1.5;color:#15201A}
.gas-consent-actions{display:flex;align-items:center;gap:10px;flex:none}
.gas-consent-decline,.gas-consent-accept{min-height:40px;padding:0 18px;border-radius:8px;font:500 14px/1 var(--sans,inherit);cursor:pointer}
.gas-consent-decline{border:1px solid #DCD8CC;background:#fff;color:#15201A}
.gas-consent-accept{border:1px solid #15201A;background:#15201A;color:#fff}
.gas-consent-privacy{font-size:13px;color:#5E6B63;text-decoration:underline;text-underline-offset:3px}
@media (max-width:520px){.gas-consent-banner{flex-direction:column;align-items:stretch}.gas-consent-actions{flex-wrap:wrap}}
`;

export const CONSENT_BANNER_HTML = `<div id="gas-consent-banner" class="gas-consent-banner" hidden role="region" aria-label="Cookie choice">
  <p>GoAskSam uses cookies and similar technology to count visits and see which parts of the site are useful, so we can improve it. Accept or decline, the site works the same either way.</p>
  <div class="gas-consent-actions">
    <button type="button" class="gas-consent-decline">Decline</button>
    <button type="button" class="gas-consent-accept">Accept</button>
    <a class="gas-consent-privacy" href="/privacy">Privacy</a>
  </div>
</div>`;

export const CONSENT_BANNER_JS = `(function(){
  function hasConsentCookie(){ return /(?:^|; )gas_consent=/.test(document.cookie); }
  function setConsent(v){
    document.cookie = "gas_consent=" + v + "; Path=/; Max-Age=" + (395*24*3600) + "; SameSite=Lax";
    if (typeof gasTrack === "function" && typeof gasTrack.consentChanged === "function") gasTrack.consentChanged();
    hideBanner();
  }
  function showBanner(){ var el = document.getElementById("gas-consent-banner"); if (el) el.hidden = false; }
  function hideBanner(){ var el = document.getElementById("gas-consent-banner"); if (el) el.hidden = true; }
  window.gasShowConsentBanner = showBanner;
  document.addEventListener("click", function(e){
    if (!e.target || !e.target.closest) return;
    if (e.target.closest(".gas-consent-accept")) setConsent("granted");
    else if (e.target.closest(".gas-consent-decline")) setConsent("declined");
  });
  if (!hasConsentCookie()) {
    fetch("/api/track?consent=1", { credentials: "same-origin", cache: "no-store" })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if (j && j.region_class === "restricted") showBanner(); })
      .catch(function(){});
  }
})();`;
