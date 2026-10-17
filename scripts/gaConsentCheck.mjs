// GA CONSENT BY COUNTRY (Sam, Oct 17 2026; api/gaConsent.js + lib/analytics.js). No network: the real handler with the
// country header Vercel sets (x-vercel-ip-country). EEA, UK and Switzerland: the tag LOADS with consent required (consent
// mode, analytics storage denied until the Allow / No thanks banner); everywhere else it loads with no banner; crew and any
// host other than goasksam.com load nothing. Exits 1 on any failure.
import crypto from "node:crypto";
process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || crypto.randomBytes(16).toString("hex");
const { default: h } = await import("../api/gaConsent.js");
const { GA_CONSENT_COUNTRIES, gaBootstrapHtml } = await import("../lib/analytics.js");
const { mintCrewCookieValue } = await import("../lib/_crew.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL  " + m); } };
const call = (country, extra = {}) => { let out = null; h({ method: "GET", headers: { host: "goasksam.com", "x-vercel-ip-country": country, ...extra } }, { setHeader() {}, status() { return this; }, json(o) { out = o; return this; } }); return out; };
for (const c of ["DE", "FR", "IE", "NL", "PL", "SE", "IS", "LI", "NO", "GB", "CH"]) { const r = call(c); ok(r.load === true && r.consentRequired === true, `${c}: the tag loads, consent required (got ${JSON.stringify(r)})`); }
for (const c of ["US", "CA", "AU", "JP", "MX", ""]) { const r = call(c); ok(r.load === true && r.consentRequired === false, `${c || "no country"}: the tag loads, no banner (got ${JSON.stringify(r)})`); }
ok(call("DE", { cookie: "gas_crew=" + mintCrewCookieValue() }).load === false && call("US", { cookie: "gas_crew=" + mintCrewCookieValue() }).load === false, "crew: nothing loads, in any country");
{ let out = null; h({ method: "GET", headers: { host: "goasksam.vercel.app", "x-vercel-ip-country": "US" } }, { setHeader() {}, status() { return this; }, json(o) { out = o; return this; } }); ok(out.load === false, "another host: nothing loads"); }
ok(GA_CONSENT_COUNTRIES.size === 32 && ["GB", "CH", "NO", "IS", "LI"].every(c => GA_CONSENT_COUNTRIES.has(c)), `the consent set is the EU 27 + Iceland, Liechtenstein, Norway + the UK and Switzerland (${GA_CONSENT_COUNTRIES.size} countries)`);
const boot = gaBootstrapHtml();
ok(/analytics_storage/.test(boot) && /denied/.test(boot), "the bootstrap sets consent mode with analytics storage denied where consent is required");
console.log(`gaConsentCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
