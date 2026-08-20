// Deployed-page verification for the fifth PowerSeller (Spencer Bailey / SpecWerksLTD).
// Drives goasksam.com through the REAL sell wizard as a Colorado seller with an 80s
// German car (1988 BMW M3, E30 - well above his $35k floor), where Spencer is the only
// LOCAL candidate and therefore the pick. Confirms his PowerSeller card renders with the
// three expected tiles (Track record, Specialises in = the identity label, Based in
// Colorado) and the full-name headline, and screenshots it. Needs system Chrome + crew
// cookie. Usage: node scripts/spencerVerify.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.SHOT_DIR || process.cwd();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=1200,1400"], defaultViewport: { width: 1120, height: 1300 } });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#inp", { timeout: 30000 });

const lastSam = () => page.evaluate(() => { const r = [...document.querySelectorAll(".row.sam")]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
async function type(text) { await page.evaluate(t => { document.getElementById("inp").value = t; }, text); await page.click("#btn"); await sleep(2400); }
async function clickChip(label) {
  const hit = await page.evaluate(l => { const c = [...document.querySelectorAll(".chip")].filter(b => b.textContent.trim().toLowerCase().includes(l.toLowerCase())); if (c.length) { c[c.length - 1].click(); return true; } return false; }, label);
  await sleep(2400); return hit;
}

await type("1988 BMW M3");
for (let i = 0; i < 18; i++) {
  if (await page.$(".pcard-ps")) { console.log("PS CARD at iter", i); break; }
  const s = (await lastSam()).toLowerCase();
  console.log(`iter${i} sam="${s.slice(0, 90)}"`);
  if (/which m3|base and competition|which variant|did you mean/.test(s)) { if (!await clickChip("Base")) await clickChip("Yes"); }
  else if (/which country|where .*located|which region of the world/.test(s)) { if (!await clickChip("United States")) await type("United States"); }
  else if (/which state|what state/.test(s)) { if (!await clickChip("Colorado")) await type("Colorado"); }
  else if (/city or region|whereabouts|part of/.test(s)) await type("Denver, Colorado");
  else if (/hoping to get|roughly what|asking|what.*price|have a number/.test(s)) await type("85000");
  else if (/how would you like to sell|last one|handle the sale|run the sale/.test(s)) { if (!await clickChip("handle everything")) await clickChip("someone"); }
  else if (/mileage|how many miles/.test(s)) await type("48000");
  else if (/condition/.test(s)) { if (!await clickChip("Excellent")) await type("Excellent"); }
  else if (/service records|history|documentation/.test(s)) { if (!await clickChip("Yes")) await type("Yes"); }
  else if (/title/.test(s)) { if (!await clickChip("Clean")) await type("Clean"); }
  else if (/timeline|how soon|when .*sell|in a hurry/.test(s)) { if (!await clickChip("No rush")) await type("No rush"); }
  else if (/anything else|notes|tell me more/.test(s)) await type("skip");
  else if (/look right|confirm|got this right|is this correct/.test(s)) { if (!await clickChip("Yes")) await type("yes"); }
  else await type("skip");
}

await page.waitForSelector(".pcard-ps", { timeout: 60000 });
await sleep(1500);
const info = await page.evaluate(() => {
  const card = document.querySelector(".pcard-ps");
  if (!card) return { found: false };
  const text = card.textContent.replace(/\s+/g, " ").trim();
  const tiles = [...card.querySelectorAll(".pcard-ttile")].map(t => t.textContent.replace(/\s+/g, " ").trim());
  return {
    found: true,
    headline: ((card.querySelector(".pcard-name-ps") || {}).textContent || "").replace(/\s+/g, " ").trim(),
    hl: ((card.querySelector(".pcard-hl") || {}).textContent || "").trim(),
    tiles,
    hasTrack: /Track record/i.test(text), hasSpec: /Specialises in/i.test(text),
    hasIdentity: /Original and preserved enthusiast cars/i.test(text),
    hasBased: /Based in Colorado/i.test(text),
    hasPremium: /\+\d+%/.test(text),
    noMarqueSpec: !/Specialises in\s*(BMW|Mercedes|Porsche|Toyota)/i.test(text)
  };
});
console.log("\nCARD:", JSON.stringify(info, null, 2));

ok(info.found, "Spencer's PowerSeller card (.pcard-ps) renders on the deployed page");
ok(info.hl === "Spencer Bailey", `headline names the full name 'Spencer Bailey' [${info.hl}]`);
ok(info.hasTrack && info.hasPremium, "tile 1: Track record with a premium figure");
ok(info.hasSpec && info.hasIdentity, "tile 2: Specialises in = 'Original and preserved enthusiast cars'");
ok(info.hasBased, "tile 3: Based in Colorado");
ok(info.noMarqueSpec, "Specialises in is the identity label, never a marque");
ok(info.tiles.length === 3, `exactly 3 tiles (no density overflow) [${info.tiles.length}]`);

const card = await page.$(".pcard-ps");
await card.evaluate(el => el.scrollIntoView({ block: "center" }));
await sleep(500);
await card.screenshot({ path: `${OUT}/spencer-card.png` });
await page.screenshot({ path: `${OUT}/spencer-fullpage.png`, fullPage: true });
console.log(`\nscreenshots -> ${OUT}/spencer-card.png , ${OUT}/spencer-fullpage.png`);

// Post-result chat: "how would u run it" (no path named) must FOLLOW the lead (Spencer),
// not pivot to the DIY platform path. This is a local composer (v2ComposeRunListing), so
// it spends ZERO OldCarsData - no fresh search. (Aug 2026 regression.)
await page.evaluate(() => { const i = document.getElementById("inp"); i.value = "how would u run it"; });
await page.click("#btn");
await sleep(3000);
const chatReply = await page.evaluate(() => { const r = [...document.querySelectorAll(".row.sam")]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
console.log("\nCHAT 'how would u run it' ->", chatReply.slice(0, 200));
ok(/spencer/i.test(chatReply) && /run it/i.test(chatReply) && !/^I would list your/.test(chatReply), "chat: 'how would u run it' follows Spencer (the lead), not a DIY platform pivot");

await browser.close();
console.log(fails === 0 ? "\nSPENCER DEPLOYED-PAGE CHECK: ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
