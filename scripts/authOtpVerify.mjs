// Deployed-page check for the code-only OTP sign-in UI. Opens the sign-in card, asserts
// the "code" copy, sends an OTP to a test address, and asserts the 6-digit code-entry
// screen renders (input + Verify + Resend). It CANNOT verify the final code exchange
// (that needs the Supabase template change + an inbox), so it stops at the code screen.
// Usage: node scripts/authOtpVerify.mjs
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TEST_EMAIL = "sam-verify@thedailyvroom.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#inp", { timeout: 30000 });

// Open the sign-in card directly.
await page.evaluate(() => openSignInCard());
await page.waitForSelector("#auth-modal .auth-dialog", { timeout: 10000 });
const cardText = await page.evaluate(() => document.querySelector("#auth-modal .auth-dialog").innerText);
console.log("CARD:", cardText.replace(/\s+/g, " ").slice(0, 160));
ok(/Email me a sign-in code|Email me a code/i.test(cardText) && !/magic link/i.test(cardText), "sign-in card: 'code' copy, no 'magic link'");
ok(/one-time 6-digit code/i.test(cardText), "fineprint mentions a one-time 6-digit code");

// Send the code and wait for the code-entry screen.
await page.type("#auth-email", TEST_EMAIL);
await page.evaluate(() => { const b = [...document.querySelectorAll("#auth-modal button")].find(x => /email me a code/i.test(x.textContent)); if (b) b.click(); });
await page.waitForSelector("#auth-code", { timeout: 15000 }).catch(() => {});
const screen = await page.evaluate(() => {
  const d = document.querySelector("#auth-modal .auth-dialog");
  return { text: d ? d.innerText.replace(/\s+/g, " ") : "", hasCodeInput: !!document.querySelector("#auth-code"), hasVerify: !![...document.querySelectorAll("#auth-modal button")].find(b => /verify and sign in/i.test(b.textContent)), hasResend: !![...document.querySelectorAll("#auth-modal button")].find(b => /resend code/i.test(b.textContent)) };
});
console.log("CODE SCREEN:", screen.text.slice(0, 160));
ok(screen.hasCodeInput, "code-entry screen: 6-digit input (#auth-code) rendered");
ok(screen.hasVerify && screen.hasResend, "code-entry screen: 'Verify and sign in' + 'Resend code' buttons");
ok(new RegExp(`sent a 6-digit code to.*${TEST_EMAIL.replace(/[.+]/g, "\\$&")}`, "i").test(screen.text), "code-entry screen: names the email the code was sent to");

await browser.close();
console.log(fails === 0 ? "\nOTP-UI DEPLOYED-PAGE CHECK: ALL PASS (final code exchange needs the template change + an inbox)" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
