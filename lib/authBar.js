// The shared public top bar control (Oct 2026, item 9: "one shared file, do not copy it per
// page"). Lane C built the first working version for Buy (commit 791b6ce: a fixed top-right
// pill, a phone mirror slot, js/auth.js's authRenderTopbar() filling #signin-area with "Sign
// in" signed-out or the account email + "Sign out" signed-in). This file is that exact design,
// moved here so every public page uses the ONE copy instead of its own: Market Check, the Sell
// landing (New Sell, via onebox.html), Tasks, and Buy itself (api/buy.js swapped its inline
// .buytop/.mtop/#signin-area-m copy for this - see docs/lane-notes.md). The /sell wizard
// (index.html) already has its own working, pre-existing version via styles.css - left alone,
// not migrated, so a live page already in front of users is never put at risk for this.
//
// Each page: include GAS_SIGNBAR_CSS once, GAS_SIGNBAR_HTML where the top-right control should
// render, then `<script>window.GAS_AUTH_MODE="topbar";</script><script src="/js/auth.js" defer></script>`
// AFTER the HTML (so #signin-area exists before auth.js's DOMContentLoaded boot looks for it).
// GAS_AUTH_MODE="topbar" runs js/auth.js's authBootTopbarOnly() instead of the full wizard
// authBoot() - same session/sign-in/sign-out code, but skips the /sell-only upfront gate check
// and the wizard's "homepage_view" funnel stamp, neither of which belongs on these pages.
export const AUTH_SIGNBAR_HTML = '<div class="gas-signbar"><div id="signin-area"></div></div><div class="gas-signbar-m"><div id="signin-area-m"></div></div>';

export const AUTH_SIGNBAR_CSS = `
.gas-signbar{position:fixed;top:14px;right:22px;z-index:30;display:flex;align-items:center;gap:10px;background:rgba(246,243,236,.94);border-radius:999px;padding:2px 12px}
#signin-area,#signin-area-m{display:flex;align-items:center;gap:8px}
.gas-signbar .hp-signin,.gas-signbar-m .hp-signin{border:0;background:none;padding:8px 4px;font:500 14px/1 var(--sans,inherit);color:var(--ink,#15201A);cursor:pointer}
.gas-signbar .hp-signin:hover,.gas-signbar-m .hp-signin:hover{text-decoration:underline;text-underline-offset:3px}
.gas-signbar .hp-account-email,.gas-signbar-m .hp-account-email{font:400 13px/1.2 var(--sans,inherit);color:var(--sec,#5E6B63);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gas-signbar .hp-signout,.gas-signbar-m .hp-signout{font:400 13px/1 var(--sans,inherit);color:var(--sec,#5E6B63);border:1px solid var(--div,#DCD8CC);background:none;border-radius:8px;padding:6px 10px;cursor:pointer}
.gas-signbar-m{display:none}
@media (max-width:760px){.gas-signbar{display:none}.gas-signbar-m{display:inline-flex;align-items:center;position:fixed;top:16px;right:16px;z-index:30;background:rgba(246,243,236,.94);border-radius:999px;padding:2px 10px}}
.hp-dialog-scrim{position:fixed;inset:0;background:rgba(21,32,26,.45);z-index:90;display:flex;align-items:center;justify-content:center;padding:16px}
.hp-dialog{background:var(--card,#fff);border-radius:16px;padding:24px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:10px;font-size:15px}
.hp-dialog h3{margin:0;font:500 20px/1.3 var(--serif,inherit);color:var(--ink,#15201A)}
.hp-dialog p{margin:0;color:var(--sec,#5E6B63)}
.auth-dialog{text-align:left}
.auth-google,.auth-email-btn{min-height:48px;border-radius:12px;border:1.5px solid var(--green,#1E4D38);background:var(--card,#fff);color:var(--green,#1E4D38);font:600 16px var(--sans,inherit);cursor:pointer}
.auth-email-btn{background:var(--green,#1E4D38);color:#fff}
.auth-input{min-height:48px;border:1px solid var(--border,#DCD8CC);border-radius:12px;padding:0 14px;font:400 16px var(--sans,inherit)}
.auth-or{text-align:center;color:var(--sec,#5E6B63);font-size:14px}
.auth-label{font-size:13px;color:var(--sec,#5E6B63)}
.auth-error{color:#9b2c2c;font-size:14px}
.auth-fineprint,.auth-consent-row{font-size:14px;color:var(--sec,#5E6B63)}
`;

// The phone mirror (Buy's own #signin-area-m pattern, unchanged): js/auth.js only knows about
// #signin-area, so a MutationObserver copies its innerHTML into the phone slot whenever it
// changes - inline onclick="..." attributes execute fine copied this way, nothing to rewire.
export const AUTH_SIGNBAR_MIRROR_JS = `(function(){
  var a = document.getElementById("signin-area"), m = document.getElementById("signin-area-m");
  if (!a || !m || !window.MutationObserver) return;
  var copy = function(){ m.innerHTML = a.innerHTML; };
  new MutationObserver(copy).observe(a, { childList: true, subtree: true, characterData: true });
  copy();
})();`;
