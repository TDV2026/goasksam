// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// Deployed-page E2E for the Beehiiv bhs link auto-signin. Visits /api/crew?bhs=<real id>,
// follows the 302, and asserts the reader lands SIGNED IN (topbar shows their email),
// the curtain is lifted, the account stores the real Beehiiv email (masked here), the
// tier is applied, and the token hash is scrubbed. No email is ever sent.
// Usage: node scripts/beehiivSigninVerify.mjs
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The reader's Beehiiv subscription id comes ONLY from the environment, by name (Sam, Oct 21 2026: treat it as live; it is
// never written in this file, a commit, the lane notes or any output). Set BEEHIIV_TEST_SUBSCRIPTION_ID (BHS still accepted).
const BHS = process.env.BEEHIIV_TEST_SUBSCRIPTION_ID || process.env.BHS || "";
if (!/^sub_[A-Za-z0-9-]{8,}$/.test(BHS)) { console.log("beehiivSigninVerify: set BEEHIIV_TEST_SUBSCRIPTION_ID (a Beehiiv subscription id, sub_...) in the environment; it is never stored in this file."); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };
const mask = e => { if (!e || e.indexOf("@") < 0) return String(e); const [u, d] = e.split("@"); return (u[0] || "") + "***@" + d; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
// Land on the email link exactly as a subscriber would (no pre-existing cookie/session).
await page.goto(`https://goasksam.com/api/crew?bhs=${encodeURIComponent(BHS)}`, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(4500); // auth boot: handle hash -> set session -> ensureAccount (Beehiiv tier)

const s = await page.evaluate(() => ({
  curtained: document.documentElement.className.indexOf("curtained") >= 0,
  signinArea: (document.getElementById("signin-area")?.textContent || "").replace(/\s+/g, " ").trim(),
  signedIn: (typeof authIsSignedIn === "function") ? authIsSignedIn() : null,
  account: (typeof authAccount === "function") ? authAccount() : null,
  hashHasToken: (location.hash || "").indexOf("access_token") >= 0,
  onApp: ["/", "", "/sell"].indexOf(location.pathname) >= 0
}));
console.log("STATE:", JSON.stringify({ ...s, signinArea: s.signinArea ? mask(s.signinArea) : s.signinArea, account: s.account ? { email: mask(s.account.email), tier: s.account.tier } : null }));

ok(s.onApp && !s.hashHasToken, "landed on the app (/sell) with the token hash scrubbed (no PII/tokens left in the URL)");
ok(s.signedIn === true, "signed in (session established from the link, no email sent)");
ok(!s.curtained, "curtain lifted for the verified subscriber");
ok(!!(s.account && /@/.test(String(s.account.email || ""))), `account stores the real Beehiiv email [${s.account ? mask(s.account.email) : "none"}]`);
ok(!!(s.account && s.account.email && /@hotmail\.com$/i.test(s.account.email)), "account email is the subscriber's real address (@hotmail.com), not a token");
ok(!!(s.account && s.account.tier === "tdv"), `TDV tier applied [tier=${s.account ? s.account.tier : "?"}]`);
ok(/@/.test(s.signinArea), "topbar shows the signed-in email (same UI as Google/code sign-in)");

await browser.close();
console.log(fails === 0 ? "\nBEEHIIV SIGN-IN E2E: ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
