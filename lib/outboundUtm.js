// OUTBOUND LINK TAGS (Sam, Oct 26 2026): every link from GoAskSam to an external auction or listing site carries utm_source=goasksam, utm_medium=referral and
// utm_campaign=<the surface: find, market_check, tasks, tasks_email, sell>, so those sites can see the traffic comes from GoAskSam. ONE helper does it, at RENDER time in
// the page and email code, never in a stored engine answer (so no engine stamp bump and no cold rebuild). Rules:
//   - only an https link whose host is one of the 19 auction and listing sources (the same list as lib/_email.js PRIOR_SALE_HOSTS; scripts/outboundUtmCheck.mjs keeps them equal);
//     never mailto, never our own pages, never another site, never http;
//   - a link that already has ANY utm_ parameter is left exactly as it is;
//   - every existing query parameter and the fragment are kept;
//   - nothing about the person is ever added (no email, account or session): the three fixed tags and nothing else.
// tagOutbound is deliberately self-contained (no imports, no outer names) because its SOURCE also runs in the browser (OUTBOUND_JS prints it as window.gasTagOutbound).
export function tagOutbound(url, campaign) {
  var HOSTS = ["bringatrailer.com", "carsandbids.com", "barrett-jackson.com", "rmsothebys.com", "bonhams.com", "broadarrowauctions.com", "hagerty.com", "mecum.com", "sothebysmotorsport.com", "pcarmarket.com", "goodingco.com", "hemmings.com", "allcollectorcars.com", "carandclassic.com", "collectingcars.com", "mbmarket.com", "autohunter.com", "themarket.co.uk", "pistonheads.com"];
  var s = String(url == null ? "" : url).trim();
  if (!s) return url;
  var u; try { u = new URL(s); } catch (e) { return url; }
  if (u.protocol !== "https:" || u.username || u.password) return url;
  var host = u.hostname.toLowerCase(), listed = false;
  for (var i = 0; i < HOSTS.length; i++) if (host === HOSTS[i] || host.endsWith("." + HOSTS[i])) { listed = true; break; }
  if (!listed) return url;
  var camp = String(campaign || "").replace(/[^a-z0-9_]/g, "");
  if (!camp) return url;
  var keys = []; u.searchParams.forEach(function (v, k) { keys.push(k); });
  for (var j = 0; j < keys.length; j++) if (/^utm_/i.test(keys[j])) return url;
  u.searchParams.set("utm_source", "goasksam"); u.searchParams.set("utm_medium", "referral"); u.searchParams.set("utm_campaign", camp);
  return u.toString();
}
// The browser side: tags every listing link on the page as it is drawn (and any drawn later), and drops "noreferrer" from the ones it tags, so the site can see where the
// visit came from. Installed once per page with its surface.
export const OUTBOUND_JS = "window.gasTagOutbound=" + tagOutbound.toString() + ";" + String.raw`
window.gasOutboundInstall=function(campaign){
  function one(a){
    if (!a || a.nodeType !== 1 || a.tagName !== "A" || a.__gasTagged) return;
    var h = a.getAttribute("href"); if (!h || h.charAt(0) === "#" || h.charAt(0) === "/") return;
    var t = window.gasTagOutbound(h, campaign);
    if (t !== h) { a.setAttribute("href", t); var r = a.getAttribute("rel"); if (r && /noreferrer/i.test(r)) a.setAttribute("rel", r.replace(/\bnoreferrer\b/ig, "").replace(/\s+/g, " ").trim() || "noopener"); }
    a.__gasTagged = true;
  }
  function scan(root){ if (!root) return; if (root.tagName === "A") one(root); var l = root.querySelectorAll ? root.querySelectorAll("a[href]") : []; for (var i = 0; i < l.length; i++) one(l[i]); }
  scan(document);
  try { new MutationObserver(function(ms){ for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (m.type === "attributes") { m.target.__gasTagged = false; one(m.target); } else for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]); } }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] }); } catch (e) {}
};`;
