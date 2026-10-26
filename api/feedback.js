// /feedback and POST /api/feedback (Sam, Oct 25 2026). The Feedback page draws in the shared app shell like About and is open while the site is sealed
// (it never calls heldFor, like /api/crew). The send route emails ONE plain-text message to feedback@goasksam.com through the existing sender
// (lib/_email.js sendTaskEmail, so the Task email kill switch pauses it too). Nothing in the request can change the recipient, sender, subject
// or headers; name and email lose every control character; Reply-To is set only for a valid typed email; a filled honeypot sends nothing and
// answers as a success; the message and the email address are never stored and never logged (the one log line holds an outcome word only).
import { FONT_LINKS, isCrewRequest } from "./_chrome.js";
import { AUTH_SIGNBAR_HTML, AUTH_SIGNBAR_CSS, AUTH_SIGNBAR_MIRROR_JS } from "../lib/authBar.js";
import { SHELL_CSS, SHELL_JS, railOpenHtml, SHELL_MAIN_CLOSE } from "../lib/appShell.js";
import { CONSENT_BANNER_CSS, CONSENT_BANNER_HTML, CONSENT_BANNER_JS } from "../lib/consentBanner.js";
import { fullyLaunched } from "../lib/_launchStage.js";
import { hasServerCredential } from "../lib/_credential.js";
import { checkCeiling } from "../lib/_ceilings.js";
import { supabaseEnv } from "../lib/_supabase.js";
import { sendTaskEmail } from "../lib/_email.js";

export const FEEDBACK_TO = "feedback@goasksam.com";
export const FEEDBACK_SUBJECT = "GoAskSam feedback";
export const PAUSED_TEXT = "Feedback is paused right now. Please email feedback@goasksam.com.";
const TITLE = "Feedback | GoAskSam";
const DESC = "Send GoAskSam a question or a note. Add your email if you would like a reply.";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
.fb-col{max-width:640px;margin:0 auto;padding:56px 48px 80px}
.fb-h1{margin:0 0 14px;font:600 44px/1.12 var(--serif,Georgia,serif);letter-spacing:-.01em;color:var(--ink,#15201A)}
.fb-lead{margin:0 0 26px;font:400 17px/1.6 var(--sans,sans-serif);color:var(--ink,#15201A)}
.fb-lead a{color:var(--green,#1E4D38);text-decoration:underline}
.fb-form{display:flex;flex-direction:column;gap:16px}
.fb-form label{display:flex;flex-direction:column;gap:6px;font:500 14px/1.3 var(--sans,sans-serif);color:var(--ink,#15201A)}
.fb-form input,.fb-form textarea{font:400 16px/1.4 var(--sans,sans-serif);color:var(--ink,#15201A);background:#fff;border:1px solid var(--shell-div,#D8D4CB);border-radius:10px;padding:11px 13px;width:100%}
.fb-form textarea{min-height:150px;resize:vertical}
.fb-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.fb-btn{align-self:flex-start;min-height:44px;padding:0 26px;border-radius:10px;border:1px solid var(--ink,#15201A);background:var(--ink,#15201A);color:#fff;font:500 15px/1 var(--sans,sans-serif);cursor:pointer}
.fb-btn[disabled]{opacity:.6;cursor:default}
.fb-small{margin:14px 0 0;font:400 13px/1.5 var(--sans,sans-serif);color:var(--sec,#5E6B63)}
.fb-small a{color:inherit;text-decoration:underline}
.fb-msg{margin:18px 0 0;font:400 16px/1.5 var(--sans,sans-serif);color:var(--ink,#15201A)}
.fb-err{color:#8A2B1C}
@media (max-width:640px){.fb-col{padding:32px 20px 56px}.fb-h1{font-size:32px}}`;

const JS = `(function(){var f=document.getElementById("fb-form");if(!f)return;var msg=document.getElementById("fb-msg"),btn=f.querySelector(".fb-btn");
f.addEventListener("submit",function(e){e.preventDefault();var m=(f.message.value||"").trim();if(!m){msg.className="fb-msg fb-err";msg.textContent="Please write a message.";f.message.focus();return}
btn.disabled=true;msg.className="fb-msg";msg.textContent="";
fetch("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:f.name.value,email:f.email.value,message:f.message.value,website:f.website.value,path:"/feedback"})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,j:j}})})
.then(function(x){if(x.ok&&x.j&&x.j.ok){f.hidden=true;msg.className="fb-msg";msg.textContent="Thanks. We read every message."}else{btn.disabled=false;msg.className="fb-msg fb-err";msg.textContent=(x.j&&x.j.error)||${JSON.stringify(PAUSED_TEXT)}}})
.catch(function(){btn.disabled=false;msg.className="fb-msg fb-err";msg.textContent=${JSON.stringify(PAUSED_TEXT)}})})})();`;

function page(req) {
  const crew = isCrewRequest(req);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(TITLE)}</title><meta name="description" content="${esc(DESC)}"><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://goasksam.com/feedback">
<link rel="icon" href="/favicon.ico" sizes="any"><meta name="theme-color" content="#F6F3EC">
${FONT_LINKS}<style>:root{--ink:#15201A;--sec:#5E6B63;--soft:#3C4942;--green:#1E4D38;--sans:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--serif:"Newsreader",Georgia,"Times New Roman",serif}*{box-sizing:border-box}html,body{margin:0}body{background:var(--main-bg,#F6F3EC);color:var(--ink);font:400 17px/1.5 var(--sans)}a{color:var(--green)}:focus-visible{outline:2px solid var(--green);outline-offset:2px}${CSS}${AUTH_SIGNBAR_CSS}${SHELL_CSS}${CONSENT_BANNER_CSS}</style></head><body>
${AUTH_SIGNBAR_HTML}
<script>${AUTH_SIGNBAR_MIRROR_JS}</script>
${railOpenHtml({ active: "feedback", crew, req, analytics: true })}
<main><div class="fb-col">
<h1 class="fb-h1">Feedback</h1>
<p class="fb-lead">Questions or feedback? Email <a href="mailto:${FEEDBACK_TO}">${FEEDBACK_TO}</a> or use the form below. Add your email if you would like a reply.</p>
<form id="fb-form" class="fb-form" method="post" action="/api/feedback" novalidate>
<label>Name (optional)<input name="name" type="text" maxlength="100" autocomplete="name"></label>
<label>Email (optional)<input name="email" type="email" maxlength="254" autocomplete="email" inputmode="email"></label>
<label>Message<textarea name="message" required maxlength="2000"></textarea></label>
<div class="fb-hp" aria-hidden="true"><label>Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
<button class="fb-btn" type="submit">Send</button>
<p class="fb-small">We use your name and email only to reply. <a href="/privacy">Privacy</a></p>
</form>
<p id="fb-msg" class="fb-msg" role="status" aria-live="polite"></p>
</div></main>${SHELL_MAIN_CLOSE}
<script>${SHELL_JS}</script>
<script>${JS}</script>
<script>window.gasIsGuestLink=window.gasIsGuestLink||function(){return false};window.GAS_AUTH_MODE="topbar";</script>
<script src="/js/auth.js" defer></script>
${CONSENT_BANNER_HTML}
<script>${CONSENT_BANNER_JS}</script>
</body></html>`;
  return { html, crew };
}

// ---- the send route ----
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
export const cleanLine = (v, max) => String(v == null ? "" : v).replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
const EMAIL_RE = /^[^\s@<>",;:\\()[\]]+@[^\s@<>",;:\\()[\]]+\.[^\s@<>",;:\\()[\]]{2,}$/;
// The message keeps its line breaks (it is the body, never a header); every other control character goes.
export const cleanMessage = v => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g, "").trim();

function readBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); }
  }
  return b && typeof b === "object" ? b : {};
}

export function buildEmail({ name, email, message, path, now }) {
  const text = ["Name: " + (name || "(not given)"), "Email: " + (email || "(not given)"), "Page: " + path, "Time: " + now, "", "Message:", message].join("\n");
  return { to: FEEDBACK_TO, subject: FEEDBACK_SUBJECT, text, always: false, replyTo: email ? email : false };
}

async function send(req, res) {
  const out = (code, body, outcome) => { console.log("feedback outcome=" + outcome); return res.status(code).json(body); };
  const origin = String(req.headers.origin || "");
  if (origin) { let oh = ""; try { oh = new URL(origin).host; } catch {} if (oh !== String(req.headers.host || "")) return out(403, { ok: false, error: PAUSED_TEXT }, "refused_origin"); }
  const b = readBody(req);
  // A filled honeypot is a bot: it is told it worked and nothing is sent.
  if (String(b.website == null ? "" : b.website).trim() !== "") return out(200, { ok: true }, "honeypot");
  const message = cleanMessage(b.message), name = cleanLine(b.name, 400), email = cleanLine(b.email, 400);
  if (!message) return out(400, { ok: false, error: "Please write a message." }, "refused_empty");
  if (message.length > 2000) return out(400, { ok: false, error: "Please keep the message under 2,000 characters." }, "refused_long");
  if (name.length > 100) return out(400, { ok: false, error: "Please keep the name under 100 characters." }, "refused_name");
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return out(400, { ok: false, error: "Please check the email address." }, "refused_email");
  const lim = await checkCeiling(supabaseEnv(), req, "feedback_send", { tool: null }).catch(() => ({ ok: true }));
  if (!lim.ok) return out(429, { ok: false, paused: true, error: PAUSED_TEXT }, "rate_limited");
  const rawPath = String(b.path || "");
  const path = /^\/[A-Za-z0-9\-_/]{0,60}$/.test(rawPath) ? rawPath : "/feedback";
  const r = await sendTaskEmail(buildEmail({ name, email, message, path, now: new Date().toISOString() })).catch(() => ({ ok: false }));
  if (!r || !r.ok) return out(503, { ok: false, paused: true, error: PAUSED_TEXT }, r && r.skipped ? "paused" : "failed");
  return out(200, { ok: true }, "sent");
}

export default async function handler(req, res) {
  if (req.method === "POST") { res.setHeader("Cache-Control", "no-store"); return send(req, res); }
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD, POST"); return res.status(405).end(); }
  const { html, crew } = page(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, follow");
  const hasCrewCookie = /(?:^|;\s*)gas_crew=/.test(String(req.headers.cookie || ""));
  res.setHeader("Cache-Control", (crew || hasCrewCookie || hasServerCredential(req) || !fullyLaunched()) ? "private, no-store" : "public, s-maxage=30");
  res.status(200).send(html);
}
