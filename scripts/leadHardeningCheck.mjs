// The public lead endpoints, hardened (Oct 21 2026, Lane D, Sam's job D, docs/lane-security.md F-03 and F-08). Offline:
// the database (PostgREST), the ceiling ledger and the mail API are stubbed in fetch, and the real handlers run.
// Proves: a real lead stores one row and sends one email to the partner, built from the stored row; the reference is
// GAS- plus 12 random characters; a filled honeypot stores and sends nothing; over a ceiling (device or email) it is
// refused with nothing stored or sent; add-details refuses an unknown or malformed reference and a mismatched email,
// and sends to the partner stored on the lead; a bad prior-sale link never reaches the email; CORS answers goasksam.com
// only; an oversized body is refused; businessLead has the same honeypot and ceiling and sends one email per call.
//   node scripts/leadHardeningCheck.mjs
// Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.RESEND_API_KEY = "r";
process.env.LAUNCH_BUSINESS = "1"; delete process.env.CRON_SECRET;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// ---- the stubbed world ----
let W;
const reset = () => { W = { leads: [], patches: [], emails: [], ledgerCount: 0, emailLedgerCount: 0, records: 0, partners: { "genau-auto-werks": { active: true, display_name: "Ingo", notification_email: "ingo@partner.test" }, "other-partner": { active: true, display_name: "Other", notification_email: "other@partner.test" } } }; };
const J = (v, status = 200, headers = {}) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || "GET").toUpperCase();
  if (u.startsWith("https://api.resend.com/emails")) { W.emails.push(JSON.parse(opts.body)); return J({ id: "em_" + W.emails.length }); }
  if (u.includes("/rest/v1/ip_rate_hits")) {
    if (m === "HEAD") { const n = /ip=in\.\(%22em%3A|ip=in\.\("em:/.test(u) || /%22em%3A/.test(u) ? W.emailLedgerCount : W.ledgerCount; return new Response(null, { status: 200, headers: { "content-range": `0-0/${n}` } }); }
    W.records++; return new Response(null, { status: 201 });
  }
  if (u.includes("/rest/v1/partners")) { const slug = decodeURIComponent((/slug=eq\.([^&]+)/.exec(u) || [])[1] || ""); const p = W.partners[slug]; return J(p ? [p] : []); }
  if (u.includes("/rest/v1/seller_leads")) {
    if (m === "POST") { const row = JSON.parse(opts.body); W.leads.push(row); return J([row], 201); }
    if (m === "PATCH") { W.patches.push({ url: u, body: JSON.parse(opts.body) }); return new Response(null, { status: 204 }); }
    const ref = decodeURIComponent((/reference=eq\.([^&]+)/.exec(u) || [])[1] || ""); return J(W.leads.filter(l => l.reference === ref).slice(0, 1));
  }
  if (u.includes("/rest/v1/business_leads")) { if (m === "POST") { W.leads.push({ business: JSON.parse(opts.body) }); return J([{ id: 7 }], 201); } return new Response(null, { status: 204 }); }
  return J({});   // analytics and anything else
};
const call = async (handler, body, headers = {}) => {
  const res = { code: 0, body: null, h: {}, setHeader(k, v) { this.h[k.toLowerCase()] = v; }, getHeader(k) { return this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  const req = { method: "POST", headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "check", ...headers }, body, socket: {} };
  await handler(req, res); return res;
};
const { default: lead } = await import("../api/submitSellerLead.js");
const { default: biz } = await import("../api/businessLead.js");
const LEAD = (o = {}) => ({ seller: { email: "seller@example.com" }, car: { raw: "1995 Porsche 911 Carrera\u0007" + "x".repeat(400), state: "California", notes: "Garage kept" }, choice: { destination: "Ingo Schmoldt", destinationType: "powerseller", powerSeller: { slug: "genau-auto-werks" } }, decision: { decision: { recommendedPath: "Bring a Trailer" }, vinArchiveMatch: { url: "https://bringatrailer.com/listing/1995-porsche-911-carrera-12/" } }, ...o });

// 1. A real lead.
reset(); let r = await call(lead, LEAD(), { origin: "https://goasksam.com" });
ok(r.code === 200 && r.body.status === "submitted", `a real lead is submitted (${r.code} ${JSON.stringify(r.body).slice(0, 80)})`);
ok(/^GAS-[A-HJ-NP-Z2-9]{12}$/.test(r.body.reference), `the reference is GAS- plus 12 random characters (${r.body.reference})`);
ok(W.leads.length === 1 && W.emails.length === 1, `one row stored, one email sent (${W.leads.length}, ${W.emails.length})`);
const e1 = W.emails[0] || {}, row1 = W.leads[0] || {};
ok(JSON.stringify(e1.to) === '["ingo@partner.test"]' && JSON.stringify(e1.bcc) === '["feedback@goasksam.com"]', `to the partner, feedback@ BCC (${JSON.stringify(e1.to)} ${JSON.stringify(e1.bcc)})`);
ok(row1.car_raw.length === 200 && !/[\u0000-\u001f]/.test(row1.car_raw) && e1.text.includes(row1.car_raw) && !/x{201}/.test(e1.text), "the email carries the stored, capped car (control characters out)");
ok(row1.decision_summary && row1.decision_summary.partnerSlug === "genau-auto-werks", "the partner slug is stored on the lead");
ok(/This car's previous auction: https:\/\/bringatrailer\.com\/listing\//.test(e1.text), "an allowed https prior-sale link is kept");
ok(r.h["access-control-allow-origin"] === "https://goasksam.com", "CORS answers goasksam.com");
const r2 = await call(lead, LEAD(), { origin: "https://evil.test" });
ok(!r2.h["access-control-allow-origin"], "CORS never answers another origin");
// 2. Bad links never reach the email.
for (const bad of ["http://bringatrailer.com/listing/x", "https://evil.test/listing/x", "https://bringatrailer.com.evil.test/x", "javascript:alert(1)", "https://user:pw@bringatrailer.com/x"]) {
  reset(); await call(lead, LEAD({ decision: { vinArchiveMatch: { url: bad } } }));
  ok(W.emails.length === 1 && !/previous auction/.test(W.emails[0].text + W.emails[0].html) && !W.emails[0].html.includes(bad), `a bad link is dropped (${bad})`);
}
// 3. Honeypot.
reset(); r = await call(lead, LEAD({ hp: "http://spam.test" }));
ok(r.code === 200 && r.body.status === "submitted" && W.leads.length === 0 && W.emails.length === 0, "a filled honeypot: success-shaped reply, nothing stored or sent");
// 4. Over a ceiling.
reset(); W.ledgerCount = 999; r = await call(lead, LEAD());
ok(r.code === 429 && W.leads.length === 0 && W.emails.length === 0, `over the device/address ceiling: 429, nothing stored or sent (${r.code})`);
reset(); W.emailLedgerCount = 5; r = await call(lead, LEAD());
ok(r.code === 429 && W.leads.length === 0 && W.emails.length === 0, `over the per-email ceiling: 429, nothing stored or sent (${r.code})`);
// 5. Bad input.
reset(); r = await call(lead, LEAD({ seller: { email: "not-an-email" } })); ok(r.code === 400 && W.leads.length === 0, "a bad email is refused");
reset(); r = await call(lead, LEAD({ car: { raw: "y".repeat(25000) } })); ok(r.code === 413 && W.leads.length === 0 && W.emails.length === 0, "an oversized body is refused");
// 6. Add-details.
reset(); await call(lead, LEAD()); const ref = W.leads[0].reference; W.emails = [];
const DET = (o = {}) => ({ action: "additionalDetails", reference: ref, partnerSlug: "other-partner", seller: { email: "seller@example.com" }, car: { raw: "a car I typed" }, vin: "WP0AA2994SS320001", note: "Two owners", ...o });
r = await call(lead, DET());
ok(r.code === 200 && r.body.status === "sent" && W.patches.length === 1 && W.emails.length === 1, `add-details for the stored lead and its email works (${r.code})`);
ok(JSON.stringify((W.emails[0] || {}).to) === '["ingo@partner.test"]', `add-details goes to the partner STORED on the lead, never the one named in the request (${JSON.stringify((W.emails[0] || {}).to)})`);
ok((W.emails[0] || {}).text && W.emails[0].text.includes(W.leads[0].car_raw.slice(0, 40)) && !W.emails[0].text.includes("a car I typed"), "add-details names the stored car, not the request's");
for (const [what, o] of [["an unknown reference", { reference: "GAS-ZZZZZZZZZZZZ" }], ["a malformed reference", { reference: "GAS-1' or 1=1" }], ["a mismatched email", { seller: { email: "stranger@example.com" } }], ["no reference", { reference: null }]]) {
  W.patches = []; W.emails = []; r = await call(lead, DET(o));
  ok(r.code === 404 && W.patches.length === 0 && W.emails.length === 0, `add-details refuses ${what}: nothing stored or sent (${r.code})`);
}
W.patches = []; W.emails = []; W.ledgerCount = 999; r = await call(lead, DET());
ok(r.code === 429 && W.patches.length === 0 && W.emails.length === 0, "add-details over its ceiling: 429, nothing stored or sent");
// 7. businessLead.
const BIZ = (o = {}) => ({ name: "Pat", company: "Auction Co", email: "pat@auctionco.test", message: "A walkthrough please", ...o });
reset(); r = await call(biz, BIZ());
ok(r.code === 200 && r.body.ok === true && W.leads.length === 1 && W.emails.length === 1, `businessLead: one row, one email per call (${r.code}, ${W.leads.length}, ${W.emails.length})`);
reset(); r = await call(biz, BIZ({ hp: "filled" }));
ok(r.code === 200 && r.body.ok === true && W.leads.length === 0 && W.emails.length === 0, "businessLead: a filled honeypot stores and sends nothing");
reset(); W.ledgerCount = 999; r = await call(biz, BIZ());
ok(r.code === 429 && W.leads.length === 0 && W.emails.length === 0, "businessLead over its ceiling: 429, nothing stored or sent");
console.log(`leadHardeningCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
