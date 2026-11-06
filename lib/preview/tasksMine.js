// /preview/tasks/mine (Lane E, Nov 5 2026): the signed in dashboard of the Tasks redesign, CREW ONLY, NOT LIVE. The client is the live task app, forked and patched (lib/preview/tasksApp.js); its API address is the preview's own door below, which hands every action to the
// REAL handler (api/tasks.js) and adds only what the list lacked: each Task's confirmed criteria in the engine's own words (lib/tasks/tasks.js matchReasons, the same test the matcher runs: every item is required, none is "preferred").
import { SHARED } from "./previewPages.js";
import { LIVE_APP_CSS } from "./tasksAppFork.js";
import { TASKS_APP_JS } from "./tasksApp.js";
import { findCardKitJs, FIND_CARD_CSS } from "../findCardKit.js";
const { esc, header, footer, doc } = SHARED;

export const DASH_CSS = `
:root{--div:var(--line);--green:var(--forest);--on-accent:#fff;--red:var(--forest);--tk-line:var(--line);--tk-soft:var(--tint);--tk-text2:var(--ink)}
.apph{display:none}
.dash{max-width:900px;padding-top:44px;padding-bottom:80px;min-height:60vh}
.dh{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:0 0 22px}.dh h1{margin:0}
.dcount{margin:8px 0 0;color:var(--sec);font:400 16px/1.4 var(--sans)}
.tk-new{display:inline-flex;align-items:center;height:44px;padding:0 20px;border:0;border-radius:var(--r-ctl);background:var(--forest);color:#fff;font:500 15.5px/1 var(--sans);cursor:pointer}.tk-new:hover{background:var(--forest-hover)}.tk-new:active{transform:translateY(1px)}
.dtabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin:0 0 24px}
.dtabs button{border:0;background:none;padding:12px 6px;margin-right:18px;font:500 16px/1 var(--sans);color:var(--sec);border-bottom:2px solid transparent;cursor:pointer}.dtabs button:hover{color:var(--ink)}
.dtabs button[aria-selected="true"]{color:var(--forest);border-bottom-color:var(--forest)}
.pane[hidden]{display:none!important}
.tcard,.limitbox,.lk,.notify,.past{border-radius:12px}
.tcard{background:#fff;border:1px solid var(--line);box-shadow:none;padding:20px 22px}
.limitbox{background:#fff;border:1px solid var(--line);border-left:3px solid var(--forest)}
.tgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
article.tc{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px;box-shadow:none}
article.tc.open{border-color:var(--forest)}
article.tc .thit{display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:10px 12px;width:100%;text-align:left;background:none;border:0;padding:0 110px 0 0;min-height:0;cursor:pointer;font:inherit;color:inherit}
article.tc .thit::after{right:4px;top:8px}article.tc .thit[aria-expanded=true]::after{top:13px}
article.tc .tline{flex:1 1 100%;margin:2px 0 0;text-align:left;font:500 21px/1.3 var(--serif);color:var(--ink)}
article.tc .tshow{position:absolute;right:30px;top:6px;font:500 14px/1.4 var(--sans);color:var(--forest);text-decoration:underline;text-underline-offset:4px}
.pill{font:500 12.5px/1 var(--sans);letter-spacing:.02em;text-transform:none;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--sec)}
.pill.running{background:var(--tint);border-color:#C9D6CD;color:var(--forest)}.pill.needs{background:var(--forest);border-color:var(--forest);color:#fff}.pill.paused,.pill.draft{background:#fff}.pill.done,.pill.stopped{background:#F3F1EC;color:var(--sec)}
.tun{font:600 12.5px/1 var(--sans);padding:6px 10px;border-radius:999px;background:var(--forest);color:#fff}
.twords{margin:12px 0 0;font:400 16.5px/1.5 var(--sans);color:var(--ink)}
.tcrit{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 8px}.tcrit li{font:400 14px/1 var(--sans);color:var(--sec);padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--cream)}
.tcount{margin:12px 0 0;color:var(--sec);font:400 14.5px/1.45 var(--sans)}
article.tc .tbtns{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0}
.sbtn{font:500 14px/1 var(--sans);border:1px solid var(--line);border-radius:var(--r-ctl);background:#fff;color:var(--ink);min-height:38px;padding:0 14px}.sbtn:hover{border-color:var(--forest)}
.pbtn{background:var(--forest);border-radius:var(--r-ctl);font:500 15px/1 var(--sans)}.pbtn:hover{background:var(--forest-hover)}
.tkbox{border-radius:var(--r-ctl);border-color:var(--line)}.tkbox:focus-within{border-color:var(--forest);box-shadow:0 0 0 3px rgba(11,49,38,.12)}.tkbox button{background:var(--forest);border-radius:8px}
.statusline,.countsline{color:var(--sec)}
.nbadge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:6px;padding:0 5px;border-radius:999px;background:#fff;color:var(--forest);font:600 11.5px/1 var(--sans)}
.tabs a[aria-current] .nbadge{background:var(--forest);color:#fff}
.past summary,.lk h2{font-family:var(--sans)}
@media (max-width:860px){article.tc .thit{padding-right:0}article.tc .tshow{position:static;margin-left:auto;order:2}article.tc .thit::after{display:none}.dash{padding-top:26px}.dh{align-items:stretch}.tk-new{width:100%;justify-content:center}article.tc .tline{font-size:19px}.dtabs button{margin-right:10px;padding:14px 4px}}
`;

export function tasksMineHtml() {
  const body = `${header("tasks")}
<main class="dash wrap" id="tk-dash"><div class="col"><div id="tkapp" aria-live="polite"></div></div></main>${footer()}`;
  const extra = `<script src="/js/auth.js" defer></script><script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_REL={mc:true,tasks:true};</script><script>${findCardKitJs()}</script><script>${TASKS_APP_JS}</script>`;
  // one accent: the live app's and Find's red and orange states are drawn in the brand forest here (Sam: no orange, no red)
  const css = (LIVE_APP_CSS + "\n" + FIND_CARD_CSS + "\n" + DASH_CSS).replace(/#D7262C|#9b2c2c/gi, "#0B3126").replace(/rgba\(178,\s*34,\s*34,/g, "rgba(11,49,38,");
  return doc("Your Tasks | GoAskSam", css, body, extra);
}

// THE PREVIEW'S API DOOR: crew only (api/crewPage.js answers the platform's 404 first), POST only; the live handler answers, nothing is stored or computed here except the criteria words the list lacked.
export async function previewTasksApi(req, res, { realHandler, matchReasonsOf } = {}) {
  const real = realHandler || (await import("../../api/tasks.js")).default;
  const matchReasons = matchReasonsOf || (await import("../tasks/tasks.js")).matchReasons;
  const cap = { code: 200, headers: {}, body: "", status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, getHeader(k) { return this.headers[k]; }, removeHeader() {}, json(o) { this.body = JSON.stringify(o); return this; }, send(x) { this.body = typeof x === "string" ? x : JSON.stringify(x); return this; }, end(x) { if (x != null) this.body = String(x); return this; }, get statusCode() { return this.code; }, set statusCode(c) { this.code = c; } };
  await real(req, cap);
  let out = cap.body;
  try {
    const j = JSON.parse(cap.body);
    if (req.body && req.body.action === "list" && j && Array.isArray(j.tasks)) { for (const t of j.tasks) { const f = t && t.filters && typeof t.filters === "object" ? t.filters : null; t.criteria = f && t.kind !== "research" ? String(matchReasons(f) || "").split(", ").filter(Boolean) : []; } out = JSON.stringify(j); }
  } catch { /* not JSON: pass it on as it came */ }
  res.statusCode = cap.code; res.setHeader("Content-Type", cap.headers["Content-Type"] || cap.headers["content-type"] || "application/json; charset=utf-8"); res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return res.end(out);
}
