// THE PRIVACY AND TERMS PAGES (Sam, Oct 26 2026), offline: both pages draw Sam's approved text word for word in the shared shell (the rail), with the effective date October 29, 2026,
// no footer, the small line linking Terms, Privacy and Privacy choices, open while the site is sealed, and /terms in the sitemap; the Privacy page names no vendor and no
// company or address; the Home bottom line and the sign-in card link Terms. No network.   node scripts/legalPagesCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_SEALED = "1"; process.env.LAUNCH_STAGE = "2";
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const legal = (await import("../api/legal.js")), handler = legal.default;
const { PRIVACY_TEXT } = await import("../lib/legal/privacyText.js"), { TERMS_TEXT } = await import("../lib/legal/termsText.js");
const get = async (q) => { const res = { code: 0, h: {}, body: "" }; res.setHeader = (k, v) => { res.h[k] = v; }; res.status = c => { res.code = c; return res; }; res.send = s => { res.body = String(s); return res; }; res.end = () => res;
  await handler({ method: "GET", query: q, headers: { host: "goasksam.com", cookie: "" } }, res); return res; };
const visible = h => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<\/?(strong|em|b|i|a|span)(\s[^>]*)?>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/\s+/g, " ").trim();
const plain = t => t.replace(/^H3 /gm, "").replace(/^- /gm, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const pr = await get({ page: "privacy" }), te = await get({ page: "terms" });
// open while sealed, 200, the shell
for (const [n, r] of [["privacy", pr], ["terms", te]]) {
  ok(r.code === 200 && !/Something big is coming/.test(r.body), `/${n} answers 200 while the site is sealed (no cookie)`);
  ok(/gas-rail/.test(r.body) && !/<footer/i.test(r.body) && !/class="(ab-foot|bottom)"/.test(r.body), `/${n} is in the shared shell with the rail and has no footer`);
  ok(/<p class="lg-eff" data-lead-sentence>Effective October 29, 2026<\/p>/.test(r.body), `/${n} shows Effective October 29, 2026`);
  ok(/<p class="lg-nav"><a href="\/terms">Terms<\/a><i>&middot;<\/i><a href="\/privacy">Privacy<\/a><i>&middot;<\/i><a href="#"[^>]*>Privacy choices<\/a><\/p>/.test(r.body), `/${n} has the one small line: Terms, Privacy, Privacy choices`);
  ok(/gas-consent-banner/.test(r.body) && /gasShowConsentBanner/.test(r.body), `/${n} keeps the cookie banner and the Privacy choices link working`);
  ok(/name="robots" content="index, follow"/.test(r.body) && /rel="canonical" href="https:\/\/goasksam\.com\/(privacy|terms)"/.test(r.body), `/${n} is indexable with its canonical`);
  ok(!/[–—]/.test(r.body), `/${n} has no em or en dash`);
}
ok(/<title>Privacy Policy - GoAskSam<\/title>/.test(pr.body) && /<h1 class="lg-h1">Privacy Policy<\/h1>/.test(pr.body), "Privacy: page title and H1");
ok(/<title>Terms and Conditions \| GoAskSam<\/title>/.test(te.body) && /<h1 class="lg-h1">Terms and Conditions<\/h1>/.test(te.body) && /<meta name="description" content="The terms for using GoAskSam, including Market Check, Find, Sell and Tasks\.">/.test(te.body), "Terms: page title, H1 and meta description are exactly as ordered");
// the approved text, word for word
const pv = visible(pr.body), tv = visible(te.body);
ok(pv.includes(plain(PRIVACY_TEXT)), "Privacy: the approved text is on the page word for word");
ok(tv.includes(plain(TERMS_TEXT)), "Terms: the approved text is on the page word for word");
ok((pr.body.match(/<h2 class="lg-h">/g) || []).length === (PRIVACY_TEXT.match(/^H3 /gm) || []).length && (PRIVACY_TEXT.match(/^H3 /gm) || []).length === 11, "Privacy: the eleven headings are headings");
ok(/<strong>1\. Agreement\.<\/strong>/.test(te.body) && /<strong>22\. Contact\.<\/strong>/.test(te.body) && /WE DISCLAIM ALL WARRANTIES/.test(te.body) && /OUR TOTAL LIABILITY[^<]*US\$100\)/.test(te.body), "Terms: 22 numbered paragraphs, bold heads, the capital letters kept");
// Privacy names no vendor, no company or address
for (const w of ["Supabase", "Beehiiv", "Resend", "Anthropic", "Vercel", "Cloudflare", "GoDaddy"]) ok(!new RegExp(w, "i").test(pv), `Privacy: no vendor name ${w}`);
ok(!/auction platforms and marketplaces/i.test(pv) && !/Company name|\[Company|Delaware corporation|Suite \d|\d{3,5} [A-Z][a-z]+ (Street|St|Ave|Avenue|Road|Rd)/.test(pv), "Privacy: not the old phrase, no company name or address");
ok(/Contact[\s\S]*feedback@goasksam\.com/.test(pv.slice(pv.lastIndexOf("Contact") - 5)), "Privacy: the contact email stays");
// sitemap
const sm = await (await import("../api/sitemapPages.js")).default({ method: "GET", headers: { host: "goasksam.com", cookie: "" }, query: {} }, (() => { const r = { h: {}, body: "" }; r.setHeader = () => {}; r.status = () => r; r.send = s => { r.body = String(s); return r; }; r.end = () => r; globalThis.__smRes = r; return r; })());
const smx = (globalThis.__smRes && globalThis.__smRes.body) || "";
ok(/<loc>https:\/\/goasksam\.com\/terms<\/loc>/.test(smx) && /<loc>https:\/\/goasksam\.com\/privacy<\/loc>/.test(smx), "the sitemap lists /terms and /privacy");
// routing, Home line, sign-in card
const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8")).rewrites || [];
ok(vj.some(r => r.source === "/terms" && /api\/legal\?page=terms/.test(r.destination)) && vj.some(r => r.source === "/privacy" && /api\/legal\?page=privacy/.test(r.destination)), "vercel.json routes /terms and /privacy to the one handler");
ok(!fs.existsSync("public/privacy.html"), "the old static Privacy page is gone");
const home = fs.readFileSync("api/home.js", "utf8");
ok(/<div class="hm-legal"><span>&copy; GoAskSam, from The Daily Vroom<\/span><a href="\/terms">Terms<\/a><a href="\/privacy">Privacy<\/a><a href="#"[^>]*>Privacy choices<\/a><\/div>/.test(home), "the Home bottom line links Terms, Privacy and Privacy choices");
const au = fs.readFileSync("public/js/auth.js", "utf8");
ok((au.match(/By continuing you agree to our <a href="\/terms">Terms<\/a> and <a href="\/privacy">Privacy Policy<\/a>\./g) || []).length === 2 && !/agree to our <a href="\/privacy">Privacy Policy<\/a>\./.test(au), "the sign-in card says Terms and Privacy Policy, linked, on the form step and the code step");
console.log(`legalPagesCheck: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
