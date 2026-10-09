// lib/appShell.js (Round D, Oct 2026): ONE shared app shell for every public product page (Buy, Sell,
// Market Check, Tasks, the homepage) - the left rail, the main area and the mobile top bar. Before
// this, four pages carried four separate copies (onebox.html's #ob-rail, api/_chrome.js's .rail for
// Tasks/history/VIN/spec pages, api/buy.js's own redesigned .rail, index.html's .hp-rail-*), each with
// its own hex copies of the same two surface colours. This file is the single source for all of them.
//
// Surfaces (Sam, Round D): the rail is the pale sage surface - the SAME token the search/context boxes
// already use (onebox.html .mk/.widen pills, api/buy.js .mcdrawer: var(--tint)). The main area is the
// existing cream (var(--page)). The hairline between them is the existing var(--div). Defined once here
// as --rail-bg/--rail-line/--main-bg so no page keeps a per-page hex copy.
//
// Scope note: api/_chrome.js (Lane C) still serves History/VIN/Spec pages unchanged - out of this
// round's named list (Buy, Sell, Market Check, Tasks, homepage) - so its railHtml()/whyResultHtml()
// are left alone. Buy's own markup/CSS/JS are not edited here (Lane C's js files); the handoff for
// Buy to adopt this module is in docs/lane-notes.md.
import { AUTH_SIGNBAR_HTML } from "./authBar.js";
import { gaBootstrapHtml } from "./analytics.js";

export const SHELL_PAGES = [
  { key: "buy", href: "/buy", label: "Buy" },
  { key: "sell", href: "/sell", label: "Sell" },
  { key: "market-check", href: "/market-check", label: "Market Check" },
  { key: "tasks", href: "/tasks", label: "Tasks" },
  { key: "business", href: "/business", label: "For business" }
];

// PUBLIC LAUNCH SWITCH (Oct 2026, Sam): until PUBLIC_LAUNCH=1, a visitor without the gas_crew=ok
// cookie sees a reduced rail/footer - Where to sell, PowerSellers, Your results (when the page
// passes it), Send feedback, Privacy, About - nothing that names or links to Buy, Market Check,
// Tasks, For business or How Sam decides. Crew always sees the full rail; everyone does once
// PUBLIC_LAUNCH=1. The pages themselves are NOT gated (reachable by direct address either way) -
// this hides the discovery surface only, per Sam's explicit instruction not to touch URLs/titles/
// canonicals/sitemap/noindex. Mirrored in styles.css for the homepage/Sell's own rail system.
export function isFullAccess(crew) { return !!crew || process.env.PUBLIC_LAUNCH === "1"; }
const REDUCED_PAGES = [
  { key: "sell", href: "/sell", label: "Where to sell" },
  { key: "powersellers", href: "/powersellers", label: "PowerSellers" }
];
const REDUCED_FOOT = '<a class="gas-navitem" href="mailto:feedback@goasksam.com?subject=GoAskSam%20feedback">Send feedback</a>' +
  '<a class="gas-navitem" href="/privacy">Privacy</a><a class="gas-navitem" href="/about">About</a>';

export const SHELL_TOKENS_CSS = `:root{--rail-bg:#EDF3EE;--rail-line:#D5E2D8;--main-bg:#F6F3EC;--shell-div:#E2DED3;--rail-text:#46524B;--rail-active-bg:#D7E6DA;--rail-hover-bg:#E3EFE6}`;

export const SHELL_CSS = SHELL_TOKENS_CSS + `
#gas-scrim{display:none;position:fixed;inset:0;background:rgba(21,32,26,.36);z-index:45}
#gas-scrim.open{display:block}
#gas-rail{position:fixed;left:0;top:0;bottom:0;width:240px;background:var(--rail-bg);border-right:1px solid var(--shell-div);display:flex;flex-direction:column;padding:28px 24px 20px;z-index:50}
.gas-logo{text-decoration:none;display:block;margin:0 0 22px;font:600 26px/1.1 var(--serif);letter-spacing:-.01em;color:var(--ink)}
.gas-rail-nav{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow:auto}
.gas-navitem{display:flex;align-items:center;min-height:44px;text-decoration:none;color:var(--rail-text);font:400 15px/1.3 var(--sans);padding:0 14px;border-radius:10px;cursor:pointer}
.gas-navitem:hover,.gas-navitem:focus-visible{background:var(--rail-hover-bg);color:var(--ink)}
.gas-navitem.active{background:var(--rail-active-bg);color:var(--green);font-weight:600}
.gas-rail-extra{display:flex;flex-direction:column;border-top:1px solid var(--rail-line);padding-top:10px;margin-top:10px}
.gas-rail-foot{display:flex;flex-direction:column;border-top:1px solid var(--rail-line);padding-top:10px;margin-top:12px}
.gas-rail-foot .gas-navitem{font-size:14px}
.gas-submenu{display:none;flex-direction:column;margin:0 0 4px 14px;border-left:1px solid var(--rail-line)}
.gas-submenu.open{display:flex}
.gas-submenu a{display:flex;align-items:center;min-height:40px;font:400 14px/1.3 var(--sans);color:var(--sec);text-decoration:none;padding:0 12px;cursor:pointer}
.gas-submenu a:hover{color:var(--ink)}
/* Shared Watching rail (Oct 2026) */
.gas-rail-head{font-weight:600;color:var(--rail-text);pointer-events:none;min-height:32px}
.gas-watch-row{display:flex;align-items:center;gap:6px;min-height:36px;padding:0 14px}
.gas-watch-t{flex:1;min-width:0;display:flex;flex-direction:column;font:400 14px/1.25 var(--sans);color:var(--rail-text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gas-watch-e{font-size:12px;color:var(--sec);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.gas-watch-x{flex:none;width:26px;height:26px;border:0;border-radius:50%;background:none;color:var(--sec);font-size:16px;line-height:1;cursor:pointer}
.gas-watch-x:hover{background:var(--rail-hover-bg);color:var(--ink)}
#gas-main{margin-left:240px;background:var(--main-bg);min-height:100vh}
.gas-mhead{display:none}
@media (max-width:860px){
  #gas-rail{width:260px;transform:translateX(-100%);transition:transform .22s ease;box-shadow:0 22px 56px rgba(21,32,26,.18)}
  #gas-rail.open{transform:none}
  #gas-main{margin-left:0}
  .gas-mhead{display:flex;align-items:center;gap:10px;padding:16px 16px 0 16px;background:var(--main-bg)}
  .gas-mhead .gas-brand{font:600 22px/1 var(--serif);color:var(--ink);text-decoration:none;margin-right:auto}
  .gas-mhead .gas-signbar-m{flex:none}
  .gas-mhead .gas-menu{width:44px;height:44px;flex:none;border:1px solid var(--border,#DCD8CC);border-radius:10px;background:var(--card,#fff);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;cursor:pointer}
  .gas-mhead .gas-menu span{width:18px;height:2px;background:var(--ink);display:block}
}
@media (prefers-reduced-motion:reduce){#gas-rail{transition:none}}
`;

// gasDockSignin: moves the mobile sign-in control (lib/authBar.js's .gas-signbar-m, a plain in-flow
// element with no position of its own) into .gas-mhead as its last child, so it reads as part of
// the same row as the logo and hamburger instead of wherever AUTH_SIGNBAR_HTML happened to be
// injected in the raw HTML (right after <body> on every caller). Safe to call once the shared shell
// markup exists; a no-op if either element is missing (a page with no sign-in bar, or none of this
// shell). Called inline below - both elements are already in the DOM by the time this script tag is
// reached on every current caller (api/marketCheck.js, api/sellNext.js, api/tasksPage.js,
// api/howSamDecides.js, api/publicConfig.js's /o/:id share).
export const SHELL_JS = `function gasToggleRail(open){var r=document.getElementById("gas-rail"),s=document.getElementById("gas-scrim"),b=document.getElementById("gas-hamburger");if(!r)return;var on=(open===undefined)?!r.classList.contains("open"):!!open;r.classList.toggle("open",on);if(s)s.classList.toggle("open",on);if(b)b.setAttribute("aria-expanded",on?"true":"false");}
function gasDockSignin(){var sb=document.querySelector(".gas-signbar-m"),mh=document.querySelector(".gas-mhead");if(sb&&mh&&sb.parentNode!==mh)mh.appendChild(sb);}
gasDockSignin();
// Shared Watching rail (Oct 2026): one list call, one render, every shell page except Buy (which
// already shows its own, built before this shared one existed - see railOpenHtml's note above).
// Skips entirely on the reduced pre-launch rail and when signed out.
function gasWatchRail(){
  var rail = document.getElementById("gas-rail"); if (!rail) return;
  if (rail.getAttribute("data-active") === "buy" || rail.getAttribute("data-full") !== "1") return;
  var box = document.getElementById("gas-watching-rail"); if (!box) return;
  var sess = null; try { sess = JSON.parse(localStorage.getItem("gas_auth_session") || "null"); } catch (e) {}
  if (!sess || !sess.access_token) return;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
  fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token }, body: JSON.stringify({ action: "list" }) })
    .then(function (r) { return r.json(); }).then(function (j) {
      var list = (j && j.watches) || []; if (!list.length) return;
      box.hidden = false;
      box.innerHTML = '<div class="gas-navitem gas-rail-head">Watching</div>' + list.map(function (w) {
        var t = w.label || "A car", tail = w.last_event || "Nothing yet";
        return '<div class="gas-watch-row"><span class="gas-watch-t" title="' + esc(t + " \\u00b7 " + tail) + '">' + esc(t) + '<span class="gas-watch-e">' + esc(tail) + '</span></span><button type="button" class="gas-watch-x" data-wstop="' + esc(w.id) + '" aria-label="Stop watching ' + esc(t) + '">&times;</button></div>';
      }).join("");
      Array.prototype.forEach.call(box.querySelectorAll("[data-wstop]"), function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-wstop");
          fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sess.access_token }, body: JSON.stringify({ action: "stop", id: id }) }).catch(function () {});
          var row = b.closest(".gas-watch-row"); if (row) row.remove();
          if (!box.querySelector(".gas-watch-row")) box.hidden = true;
        });
      });
    }).catch(function () {});
}
gasWatchRail();`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function navItems(active, list) {
  return list.map(p => '<a class="gas-navitem' + (active === p.key ? ' active' : '') + '" href="' + p.href + '"' + (active === p.key ? ' aria-current="page"' : '') + '>' + esc(p.label) + '</a>').join("");
}

// railOpenHtml: everything from the scrim through the opening <div id="gas-main"> and its mobile
// header - placed right after <body> (after AUTH_SIGNBAR_HTML, same injection point every page
// already uses). pageExtra is an optional HTML string for a page-specific rail section rendered
// between the shared nav and the footer (e.g. Buy's "Your searches", Market Check/Sell/business's
// "Your results" placeholder for js/onebox.js to fill at runtime) - shown in BOTH access states.
// crew: pass isCrewRequest(req) from the caller; gates the full page list vs the reduced public set
// (see isFullAccess above). Callers write their own page content, then close with SHELL_MAIN_CLOSE.
export function railOpenHtml({ active, pageExtra, logoHref, crew, analytics }) {
  const home = logoHref || "/market-check";
  const full = isFullAccess(crew);
  const nav = navItems(active, full ? SHELL_PAGES : REDUCED_PAGES);
  const foot = full
    ? '<a class="gas-navitem' + (active === "how" ? ' active' : '') + '" href="/how-sam-decides"' + (active === "how" ? ' aria-current="page"' : '') + '>How Sam decides</a>'
    : REDUCED_FOOT;
  // gas-watching-rail (Oct 2026): a Watching list container, shared across every shell page (the
  // SHELL_JS gasWatchRail() below fills it from the same /api/watch list call Buy's own page uses).
  // data-active/data-full tell that script whether to run at all: Buy already renders its own
  // Watching section (its page-specific pageExtra JS, not this file) - gasWatchRail() checks
  // data-active==="buy" and no-ops there, so the two never double up. Reduced rail (pre-launch,
  // data-full="0") never fetches it either, per the PUBLIC_LAUNCH rule.
  // Analytics (Oct 2026, opt-in only - see lib/analytics.js): every railOpenHtml caller except the
  // not-yet-launched new Sell (api/sellNext.js) passes analytics:true explicitly. Defaulting this
  // OFF, not on, means a future shared-shell page never gets the tag by accident.
  const analyticsHtml = analytics ? gaBootstrapHtml() : "";
  return analyticsHtml + '<div id="gas-scrim" onclick="gasToggleRail(false)"></div>' +
    '<aside id="gas-rail" aria-label="Main navigation" data-active="' + esc(active || "") + '" data-full="' + (full ? "1" : "0") + '">' +
    '<a class="gas-logo" href="' + home + '">GoAskSam</a>' +
    '<nav class="gas-rail-nav">' + nav + '<div class="gas-rail-extra" id="gas-watching-rail" hidden></div>' + (pageExtra ? '<div class="gas-rail-extra">' + pageExtra + '</div>' : '') + '</nav>' +
    '<div class="gas-rail-foot">' + foot + '</div>' +
    '</aside>' +
    '<div id="gas-main">' +
    '<header class="gas-mhead"><a class="gas-brand" href="' + home + '">GoAskSam</a>' +
    '<button type="button" class="gas-menu" id="gas-hamburger" aria-label="Menu" aria-controls="gas-rail" onclick="gasToggleRail()"><span></span><span></span><span></span></button>' +
    '</header>';
}

export const SHELL_MAIN_CLOSE = "</div>";
