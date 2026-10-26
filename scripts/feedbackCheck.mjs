// THE FEEDBACK FORM (Sam, Oct 25 2026), offline: POST /api/feedback emails ONE plain-text message to feedback@goasksam.com and nothing in the request can change the
// recipient, sender, subject or headers; newlines and control characters are stripped from name and email (header injection refused); empty and over-long messages are
// refused; a filled honeypot sends nothing and answers as a success; the limit answers with the pause message; the Task email kill switch pauses it; the route and page are
// open while the site is sealed; nothing is stored and no message or address is logged. No network (fetch is a stub).   node scripts/feedbackCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_SEALED = "1"; process.env.CURTAIN_CREW_CODE = "FeedbackCheck" + "Zq8w7v6u5t4s3r2q1p0"; process.env.RESEND_API_KEY = "stub-resend";
process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub-key";
const mod = await import("../api/feedback.js"), handler = mod.default, ceil = await import("../lib/_ceilings.js"), email = await import("../lib/_email.js");
let sent = [], ledgerHeads = 0, ledgerCount = 0, switchOff = false, resendOk = true, logs = [];
const realFetch = globalThis.fetch, realLog = console.log;
console.log = (...a) => { logs.push(a.join(" ")); };
globalThis.fetch = async (u, o = {}) => {
  u = String(u);
  if (u.startsWith("https://api.resend.com/emails")) { sent.push(JSON.parse(o.body)); return resendOk ? { ok: true, status: 200, json: async () => ({ id: "x" }) } : { ok: false, status: 500, json: async () => ({ message: "boom" }) }; }
  if (u.includes("/rest/v1/app_config")) return { ok: true, status: 200, json: async () => (switchOff ? [{ value: "off" }] : []) };
  if (o.method === "HEAD") { ledgerHeads++; return { ok: true, status: 206, headers: { get: () => "0-0/" + ledgerCount } }; }
  return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({}) };
};
const mk = (method, body, headers = {}) => { const res = { code: 0, headers: {}, body: "" }; res.setHeader = (k, v) => { res.headers[k] = v; }; res.status = c => { res.code = c; return res; }; res.json = o => { res.body = JSON.stringify(o); return res; }; res.send = s => { res.body = String(s); return res; }; res.end = () => res;
  return { req: { method, query: {}, body, headers: { host: "goasksam.com", "x-forwarded-for": "198.51.100." + (1 + Math.floor(Math.random() * 200)), ...headers } }, res }; };
const go = async (...a) => { const { req, res } = mk(...a); await handler(req, res); return res; };
const good = { name: "Pat Example", email: "pat@example.com", message: "Hello Sam, a question.", website: "", path: "/feedback" };
const reset = () => { sent = []; logs = []; ledgerCount = 0; email.resetTaskEmailSwitchCache(); };

// a good message
reset(); let r = await go("POST", good);
ok(r.code === 200 && JSON.parse(r.body).ok === true && sent.length === 1, "a good message: 200 and exactly one email");
const m = sent[0] || {};
ok(JSON.stringify(m.to) === JSON.stringify(["feedback@goasksam.com"]), "the recipient is feedback@goasksam.com");
ok(m.subject === "GoAskSam feedback" && /^GoAskSam <[^<>\s]+@mail\.goasksam\.com>$/.test(m.from || ""), "fixed subject and the existing verified sender");
ok(m.reply_to === "pat@example.com", "Reply-To is the typed email");
ok(!m.html && !m.headers && !m.bcc && !m.cc, "plain text only: no html, no extra headers, no cc or bcc");
ok(/Name: Pat Example/.test(m.text) && /Email: pat@example\.com/.test(m.text) && /Hello Sam, a question\./.test(m.text) && /Page: \/feedback/.test(m.text) && /Time: \d{4}-\d\d-\d\dT/.test(m.text), "the body holds name, email, message, page and time");
// no email typed: no Reply-To
reset(); r = await go("POST", { ...good, email: "" }); ok(r.code === 200 && sent.length === 1 && !("reply_to" in sent[0]), "no email typed: no Reply-To at all");
// nothing in the request moves the recipient, sender, subject or headers
reset(); r = await go("POST", { ...good, to: "evil@example.com", from: "evil@example.com", subject: "x", headers: { Bcc: "evil@example.com" }, bcc: "evil@example.com", reply_to: "evil@example.com", cc: "evil@example.com" });
ok(sent.length === 1 && JSON.stringify(sent[0].to) === '["feedback@goasksam.com"]' && sent[0].subject === "GoAskSam feedback" && sent[0].reply_to === "pat@example.com" && !sent[0].headers && !sent[0].bcc && !sent[0].cc && !/evil/.test(sent[0].from), "to, from, subject, headers, bcc, cc and reply_to in the request are ignored");
// header injection
for (const [lab, e] of [["newline", "pat@example.com\nBcc: evil@example.com"], ["carriage return", "pat@example.com\r\nCc: evil@example.com"], ["comma list", "a@example.com,evil@example.com"], ["angle", "Pat <evil@example.com>"], ["space", "pat @example.com"]]) {
  reset(); r = await go("POST", { ...good, email: e }); ok(r.code === 400 && sent.length === 0, "header injection refused (" + lab + ")");
}
reset(); r = await go("POST", { ...good, name: "Pat\r\nBcc: evil@example.com" }); ok(r.code === 200 && sent.length === 1 && !/\r|\n\s*Bcc/.test(sent[0].text.split("\n\nMessage:")[0]) && !sent[0].bcc && !sent[0].headers, "newlines in the name are flattened, never a header");
// size rules
reset(); r = await go("POST", { ...good, message: "" }); ok(r.code === 400 && sent.length === 0, "an empty message is refused");
reset(); r = await go("POST", { ...good, message: "   \n  " }); ok(r.code === 400 && sent.length === 0, "a blank message is refused");
reset(); r = await go("POST", { ...good, message: "x".repeat(2001) }); ok(r.code === 400 && sent.length === 0, "2,001 characters is refused");
reset(); r = await go("POST", { ...good, message: "x".repeat(2000) }); ok(r.code === 200 && sent.length === 1, "2,000 characters is accepted");
reset(); r = await go("POST", { ...good, name: "n".repeat(101) }); ok(r.code === 400 && sent.length === 0, "a name over 100 characters is refused");
reset(); r = await go("POST", { ...good, name: "n".repeat(100) }); ok(r.code === 200 && sent.length === 1, "a name of 100 characters is accepted");
reset(); r = await go("POST", { ...good, email: "not-an-email" }); ok(r.code === 400 && sent.length === 0, "a typed email must be valid");
reset(); r = await go("POST", { message: "only a message" }); ok(r.code === 200 && sent.length === 1, "name and email are optional");
reset(); r = await go("POST", "message=hi%20there&name=A"); ok(r.code === 200 && sent.length === 1 && /hi there/.test(sent[0].text), "a form-encoded body works too");
// honeypot
reset(); r = await go("POST", { ...good, website: "http://spam.example" }); ok(r.code === 200 && JSON.parse(r.body).ok === true && sent.length === 0, "a filled honeypot answers success and sends nothing");
// pause: kill switch off, send failure, no key
reset(); switchOff = true; r = await go("POST", good); ok(r.code === 503 && /Feedback is paused right now\. Please email feedback@goasksam\.com\./.test(r.body) && sent.length === 0, "the Task email kill switch pauses it with the pause message"); switchOff = false;
reset(); resendOk = false; r = await go("POST", good); ok(r.code === 503 && /Feedback is paused right now/.test(r.body), "a failed send answers the pause message"); resendOk = true;
reset(); { const k = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY; r = await go("POST", good); ok(r.code === 503 && /Feedback is paused right now/.test(r.body) && sent.length === 0, "no mail key: the pause message"); process.env.RESEND_API_KEY = k; }
// the limit: 3 per 10 minutes and 10 a day per device and per address
ok(JSON.stringify(ceil.CEILINGS.feedback_send) === JSON.stringify({ device: [[600e3, 3], [86400e3, 10]], address: [[600e3, 3], [86400e3, 10]] }), "feedback_send ceiling: 3 per 10 minutes, 10 per day, per device and per address");
reset(); ledgerCount = 99; r = await go("POST", good, { "x-forwarded-for": "203.0.113.50" }); ok(r.code === 429 && /Feedback is paused right now/.test(r.body) && sent.length === 0 && ledgerHeads > 0, "over the limit the pause message and no email");
reset(); r = await go("POST", good, { "x-forwarded-for": "203.0.113.51", cookie: "gas_crew=" + (await import("../lib/_crew.js")).mintCrewCookieValue() }); ok(r.code === 200, "a crew device is not limited");
// foreign origin refused; same origin fine
reset(); r = await go("POST", good, { origin: "https://evil.example" }); ok(r.code === 403 && sent.length === 0, "a foreign origin is refused");
reset(); r = await go("POST", good, { origin: "https://goasksam.com" }); ok(r.code === 200 && sent.length === 1, "the site's own origin is fine");
// open while sealed, the page
r = await go("GET", undefined); ok(r.code === 200 && /<h1 class="fb-h1">Feedback<\/h1>/.test(r.body), "the page is open while the site is sealed (no crew cookie)");
ok(/Questions or feedback\? Email <a href="mailto:feedback@goasksam\.com">feedback@goasksam\.com<\/a> or use the form below\. Add your email if you would like a reply\./.test(r.body), "the lead text is exact");
ok(/Name \(optional\)/.test(r.body) && /Email \(optional\)/.test(r.body) && />Message<textarea/.test(r.body) && /<button class="fb-btn" type="submit">Send<\/button>/.test(r.body), "fields and button");
ok(/We use your name and email only to reply\. <a href="\/privacy">Privacy<\/a>/.test(r.body), "the small line under the form links Privacy");
ok(/Thanks\. We read every message\./.test(r.body) && /Feedback is paused right now\. Please email feedback@goasksam\.com\./.test(r.body), "the thanks and pause texts are on the page");
ok(/name="website"[^>]*tabindex="-1"/.test(r.body) && /aria-hidden="true"/.test(r.body), "a hidden honeypot field");
ok(/<title>Feedback \| GoAskSam<\/title>/.test(r.body) && /gas-rail/.test(r.body) && /href="\/feedback"/.test(r.body), "title, left rail, and a rail Feedback item");
ok(!/[–—]/.test(r.body), "no em or en dash on the page");
// no storage, no logging of bodies or addresses
reset(); await go("POST", { ...good, message: "SECRETWORDS-12345", email: "private.person@example.com", name: "PrivateName" });
ok(logs.length >= 1 && logs.every(l => /^feedback outcome=[a-z_]+$/.test(l)), "the only log line is an outcome word");
ok(!logs.join("\n").match(/SECRETWORDS|private\.person|PrivateName/), "no message, name or address in any log line");
const src = fs.readFileSync(new URL("../api/feedback.js", import.meta.url), "utf8");
ok(!/supabaseInsert|\/rest\/v1\/|\.from\(/.test(src.replace(/\/\/.*$/gm, "")), "the route stores nothing in the database");
ok(!/process\.env\.[A-Z_]*(KEY|SECRET|CODE)/.test(src), "no new secret");
ok(/const FEEDBACK_TO = "feedback@goasksam\.com"/.test(src) && !/FEEDBACK_TO\s*=\s*[^"]/.test(src.replace('export const FEEDBACK_TO = "feedback@goasksam.com"', "")), "the recipient is a constant in code");
console.log = realLog; globalThis.fetch = realFetch;
console.log(`feedbackCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
