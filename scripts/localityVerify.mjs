// Deployed-page check for the locality confirmation (Part 2). Drives the wizard to the
// state step and types the misspelled "san fransisco"; asserts the "Did you mean San
// Francisco, California?" confirm + chips render. The confirm fires BEFORE any search,
// so this spends ZERO OldCarsData. Usage: node scripts/localityVerify.mjs
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("#inp", { timeout: 30000 });
const lastSam = () => page.evaluate(() => { const r = [...document.querySelectorAll(".row.sam")]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
const chips = () => page.evaluate(() => [...document.querySelectorAll(".chip")].map(c => c.textContent.trim()));
async function type(t) { await page.evaluate(x => { document.getElementById("inp").value = x; }, t); await page.click("#btn"); await sleep(2200); }
async function clickChip(l) { const h = await page.evaluate(x => { const c = [...document.querySelectorAll(".chip")].filter(b => b.textContent.trim().toLowerCase().includes(x.toLowerCase())); if (c.length) { c[c.length - 1].click(); return true; } return false; }, l); await sleep(2200); return h; }

await type("2021 Porsche 911 Carrera");
let typedCity = false, confirmSeen = false;
for (let i = 0; i < 16; i++) {
  const s = (await lastSam()).toLowerCase();
  if (/did you mean san francisco, california/.test(s)) { confirmSeen = true; break; }
  if (/which state|what state/.test(s) && !typedCity) { typedCity = true; await type("san fransisco"); continue; }
  console.log(`iter${i} sam="${s.slice(0, 80)}"`);
  if (/which trim|any specific trim|edition|did you mean the/.test(s)) await type("skip");
  else if (/which country|located|region of the world/.test(s)) { if (!await clickChip("United States")) await type("United States"); }
  else await type("skip");
}
const reply = await lastSam(); const ch = await chips();
console.log("\nCONFIRM PROMPT ->", reply.slice(0, 140));
console.log("CHIPS ->", JSON.stringify(ch));
ok(confirmSeen || /did you mean san francisco, california/i.test(reply), "typo 'san fransisco' surfaces 'Did you mean San Francisco, California?'");
ok(ch.some(c => /yes, california/i.test(c)) && ch.some(c => /somewhere else/i.test(c)), "confirm chips: 'Yes, California' + 'No, somewhere else'");
// Accept -> state stored as California (still zero OCD; the search only runs after prefs/confirm).
await clickChip("Yes, California");
const after = (await lastSam());
ok(!/did you mean/i.test(after), "accepting the confirm advances (no longer asking to confirm)");

await browser.close();
console.log(fails === 0 ? "\nLOCALITY DEPLOYED-PAGE CHECK: ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
