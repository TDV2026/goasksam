// Addressable One Box result (Task 4): GET /o/<id> (rewritten to /api/oneboxShare?id=<id>).
// Serves the SAME onebox.html shell (so the crew/flag gate, CSS and bundle are reused
// verbatim), with two additions injected server-side:
//   1. Open Graph / Twitter meta in the raw <head> carrying the answer line, so a link
//      unfurl (and a curl) shows the car + span sentence + "Based on N real sales" without
//      running any JS.
//   2. window.__OB_SNAPSHOT__ (the exact stored result) so the page renders that answer
//      cold, no fetch, identical to the live view.
// The snapshot lives in saved_results (reused from /sell) tagged obShare:true; the read
// path REQUIRES that tag, so it can never serve a /sell seller result. One Box payloads are
// archive-only aggregate with no seller PII, so public exposure is safe. A missing/invalid
// id degrades to the plain empty box (default OG), never an error page.
import fs from "node:fs";
import path from "node:path";
import { supabaseSelect } from "../lib/_supabase.js";

let SHELL = null;
function shell() {
  if (SHELL != null) return SHELL;
  try { SHELL = fs.readFileSync(path.join(process.cwd(), "onebox.html"), "utf8"); }
  catch { SHELL = ""; }
  return SHELL;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function usd(n) { return "$" + Math.round(Number(n)).toLocaleString("en-US"); }
function cap(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function carLabel(rc) {
  if (!rc) return "your car";
  return [rc.year, rc.make, rc.model, rc.trim, rc.bodyStyle ? cap(rc.bodyStyle) : ""].filter(Boolean).join(" ") || "your car";
}
// Plain-text mirror of js/onebox.js answerHtml() - the span/two/one sentence, no markup.
function answerSentence(d) {
  const a = d && d.answer; if (!a) return "";
  if (a.kind === "span") {
    let z = a.closest != null ? (" The one most like yours brought " + usd(a.closest) + (a.closestMonth ? " in " + a.closestMonth : "") + ".") : "";
    return "Cars like yours have been bringing " + usd(a.low) + " to " + usd(a.high) + "." + z;
  }
  if (a.kind === "two") return "The two closest sales brought " + usd(a.high) + " and " + usd(a.low) + ".";
  if (a.kind === "one") return "The one sale I'd actually use brought " + usd(a.one) + ".";
  return "";
}

export default function handler(req, res) {
  const html = shell();
  if (!html) { res.status(500).send("One Box unavailable"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const id = String((req.query && req.query.id) || "").trim();
  const send = (page, cache) => { res.setHeader("Cache-Control", cache); res.status(200).send(page); };

  // Default OG (no/invalid id): the generic One Box card, plain empty box.
  const defaultOg =
    '<meta property="og:title" content="GoAskSam One Box" />' +
    '<meta property="og:description" content="What have cars like yours actually sold for? Real auction results, no estimates." />' +
    '<meta property="og:type" content="website" /><meta property="og:site_name" content="GoAskSam" />' +
    '<meta name="twitter:card" content="summary" />';

  const finish = (ogTags, injectScript) => {
    let page = html;
    // Robots: shared result links are still noindex pre-launch (the shell already carries a
    // noindex tag); keep it as-is so nothing leaks into search before the public launch flip.
    page = page.replace("</head>", ogTags + (injectScript || "") + "\n</head>");
    send(page, injectScript ? "public, max-age=300" : "public, max-age=120");
  };

  if (!/^[0-9a-fA-F-]{10,64}$/.test(id)) { finish(defaultOg, ""); return; }

  supabaseSelect(
    { supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY },
    `saved_results?id=eq.${encodeURIComponent(id)}&select=payload&limit=1`
  ).then(rows => {
    const payload = rows && rows[0] && rows[0].payload;
    // Hard scope: ONLY serve One Box share snapshots. A /sell result (obShare !== true) or a
    // missing row falls back to the default card - never leaks another surface's data.
    if (!payload || payload.obShare !== true || !payload.oneBox || !payload.oneBox.tier) { finish(defaultOg, ""); return; }
    const ob = payload.oneBox;
    const name = carLabel(ob.resolvedCar);
    const sentence = answerSentence(ob);
    const n = Number(ob.count) || 0;
    const desc = (sentence ? sentence + " " : "") + (n ? ("Based on " + n + " real sale" + (n === 1 ? "" : "s") + ".") : "Real auction results, no estimates.");
    const title = name + " · GoAskSam"; // middot, never an em/en dash
    const og =
      '<meta property="og:title" content="' + esc(title) + '" />' +
      '<meta property="og:description" content="' + esc(desc) + '" />' +
      '<meta property="og:type" content="website" /><meta property="og:site_name" content="GoAskSam" />' +
      '<meta name="twitter:card" content="summary" />' +
      '<meta name="twitter:title" content="' + esc(title) + '" />' +
      '<meta name="twitter:description" content="' + esc(desc) + '" />';
    // Inline the snapshot for the cold render. Escape "<" so a "</script>" inside any string
    // can't break out of the script element.
    const j = s => JSON.stringify(s == null ? null : s).replace(/</g, "\\u003c");
    const script =
      "\n<script>window.__OB_SNAPSHOT__=" + j(ob) +
      ";window.__OB_QUERY__=" + j(payload.query || name) +
      ";window.__OB_ASOF__=" + j(payload.savedAt || null) +
      ";window.__OB_SNAPID__=" + j(id) + ";</script>";
    finish(og, script);
  }).catch(() => finish(defaultOg, ""));
}
