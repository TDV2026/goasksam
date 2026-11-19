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
// TRACKED EMAIL LINKS (Lane D, launch dashboard, Oct 26 2026): a Task email cannot run script, so its listing links go through GoAskSam's own /out route, which logs one
// auction_clickout (surface tasks_email) and then redirects to the SAME already-tagged address (the utm tags above ride inside it, unchanged). isSourceUrl is the open-redirect
// guard: only an https link on one of the 19 sources, the same test tagOutbound applies. Nothing about the person is in the link.
export function isSourceUrl(url) {
  var s = String(url == null ? "" : url).trim(), u;
  if (!s || s.length > 2000) return false;
  try { u = new URL(s); } catch (e) { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  var del = []; u.searchParams.forEach(function (v, k) { if (/^utm_/i.test(k)) del.push(k); });
  del.forEach(function (k) { u.searchParams.delete(k); });
  var bare = u.toString();
  return tagOutbound(bare, "zz") !== bare;
}
export function trackedLink(url) {
  return isSourceUrl(url) ? "https://goasksam.com/out?l=" + encodeURIComponent(String(url).trim()) + "&sf=tasks_email" : url;
}
// The platform word the event carries: the address's own name, lower case, letters and digits only (bringatrailer, carsandbids), with the few sources whose slug differs mapped.
export function platformKeyFor(url) {
  var h; try { h = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return "unknown"; }
  var MAP = { "barrett-jackson.com": "barrettjackson", "broadarrowauctions.com": "broadarrow", "goodingco.com": "gooding", "allcollectorcars.com": "acc", "carandclassic.com": "carandclassic", "themarket.co.uk": "themarket" };
  for (var k in MAP) if (h === k || h.endsWith("." + k)) return MAP[k];
  return h.split(".")[0].replace(/[^a-z0-9]/g, "") || "unknown";
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
