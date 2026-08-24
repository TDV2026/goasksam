// Deployed-page check that the OTP code screen accepts an 8-digit code (the reported
// blocker was a maxlength=6 cutoff + "6-digit" copy while Supabase sends 8). Renders the
// code screen and confirms: no "6-digit" copy, the input holds all 8 typed digits (no
// truncation), maxlength is generous, and an 8-digit code PASSES validation (the error
// after Verify is not the length error). The verify call itself is proven by task=otpselftest
// (8-digit + type:email -> session). Usage: node scripts/otpLengthVerify.mjs
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#inp", { timeout: 30000 });

// The sign-in card copy.
await page.evaluate(() => openSignInCard());
await page.waitForSelector("#auth-modal .auth-dialog", { timeout: 10000 });
const cardText = await page.evaluate(() => document.querySelector("#auth-modal .auth-dialog").innerText);
ok(!/6-digit/i.test(cardText) && /one-time code/i.test(cardText), "sign-in card copy: neutral 'one-time code', no '6-digit'");

// Render the code screen directly (no OTP send needed, dodges the SMTP rate limit).
await page.evaluate(() => authRenderCheckEmail("otpuitest@thedailyvroom.com"));
await page.waitForSelector("#auth-code", { timeout: 10000 });
const screen = await page.evaluate(() => {
  const d = document.querySelector("#auth-modal .auth-dialog");
  const inp = document.getElementById("auth-code");
  return { text: (d ? d.innerText : "").replace(/\s+/g, " "), maxLength: inp ? inp.maxLength : null };
});
ok(!/6-digit/i.test(screen.text) && /sent a code/i.test(screen.text), "code screen copy: 'sent a code', no '6-digit'");
ok(screen.maxLength >= 8, `code input maxlength fits 8+ [${screen.maxLength}]`);

// Type a full 8-digit code and confirm the field holds ALL 8 (no cutoff to 6).
await page.type("#auth-code", "59296013");
const held = await page.evaluate(() => document.getElementById("auth-code").value);
ok(held === "59296013", `input holds all 8 digits, no truncation [${held}]`);

// Click Verify: an 8-digit code must PASS length validation (error is NOT "Enter the code").
await page.evaluate(() => authVerifyCode());
await sleep(1200);
const err = await page.evaluate(() => (document.getElementById("auth-error")?.textContent || "").trim());
ok(!/enter the code/i.test(err), `8-digit code passes length validation (no length error) [err="${err.slice(0, 60)}"]`);

await browser.close();
console.log(fails === 0 ? "\nOTP LENGTH FIX: ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
