// Deployed-page check for the PowerSeller lead-capture copy (pre-submit personalized
// intro + post-submit confirmation). Drives to Spencer's card (Colorado 1988 BMW M3),
// requests the intro, fills a TEST email, submits, and asserts both copy states. NOTE:
// this submits a REAL lead (a test row in seller_leads) and spends ~1-2 OldCarsData for
// the one search. Usage: node scripts/leadFormVerify.mjs
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
const lastSam = () => page.evaluate(() => { const r = [...document.querySelectorAll(".row.sam")]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
const allText = () => page.evaluate(() => (document.getElementById("msgs")?.textContent || "").replace(/\s+/g, " ").trim());
async function type(t) { await page.evaluate(x => { document.getElementById("inp").value = x; }, t); await page.click("#btn"); await sleep(2300); }
async function clickChip(l) { const h = await page.evaluate(x => { const c = [...document.querySelectorAll(".chip")].filter(b => !b.classList.contains("chip-spent") && b.textContent.trim().toLowerCase().includes(x.toLowerCase())); if (c.length) { c[c.length - 1].click(); return true; } return false; }, l); await sleep(2300); return h; }

await type("1988 BMW M3");
for (let i = 0; i < 18; i++) {
  if (await page.$(".pcard-ps")) break;
  const s = (await lastSam()).toLowerCase();
  if (/which m3|base and competition|which variant|did you mean/.test(s)) { if (!await clickChip("Base")) await clickChip("Yes"); }
  else if (/which country|located|region of the world/.test(s)) { if (!await clickChip("United States")) await type("United States"); }
  else if (/which state|what state/.test(s)) { if (!await clickChip("Colorado")) await type("Colorado"); }
  else if (/hoping to get|roughly what|asking|have a number/.test(s)) await type("85000");
  else if (/how would you like to sell|last one|handle the sale/.test(s)) { if (!await clickChip("handle everything")) await clickChip("someone"); }
  else if (/in a rush|timeline|how soon/.test(s)) { if (!await clickChip("No rush")) await type("No rush"); }
  else await type("skip");
}
ok(await page.$(".pcard-ps") !== null, "reached Spencer's PowerSeller card");

// Request the introduction -> the contact form.
await page.click(".pcard-ps .pcard-cta");
await page.waitForSelector("#sellEmail", { timeout: 20000 });
await sleep(400);
const intro = await page.evaluate(() => { const t = [...document.querySelectorAll(".row.sam .sam-text")]; return t.length ? t[t.length - 1].textContent.replace(/\s+/g, " ").trim() : ""; });
console.log("\nPRE-SUBMIT INTRO ->", intro);
ok(/Last thing, so Spencer can reach you about your 1988 BMW M3\./.test(intro), "pre-submit: personalized 'so Spencer can reach you about your 1988 BMW M3'");

// Fill the test email and submit.
await page.type("#sellEmail", TEST_EMAIL);
await page.evaluate(() => { const b = [...document.querySelectorAll(".chip,button")].find(x => /submit/i.test(x.textContent || "")); if (b) b.click(); });
await page.waitForFunction(() => /Sent\.|reach out to you directly|reference/i.test(document.getElementById("msgs")?.textContent || ""), { timeout: 20000 });
await sleep(600);
const confirm = await allText();
const confirmTail = confirm.slice(-320);
console.log("CONFIRMATION ->", confirmTail);
ok(new RegExp(`Sent\\. Spencer will reach out to you directly at ${TEST_EMAIL.replace(/[.+]/g, "\\$&")}\\. That's the only place your details go\\.`).test(confirm), "post-submit: 'Sent. Spencer will reach out to you directly at <email>. That's the only place your details go.'");
ok(/Reference/i.test(confirmTail), "post-submit: reference number kept (demoted)");
ok(!/within 24 hours|within \d+ hours|business day/i.test(confirm), "post-submit: NO timeframe claim");
ok(/sell another car/i.test(confirmTail), "post-submit: 'sell another car' prompt kept");

await browser.close();
console.log(fails === 0 ? "\nLEAD-FORM DEPLOYED-PAGE CHECK: ALL PASS (note: one test lead written)" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
