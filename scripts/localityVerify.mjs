// Deployed-page check for the locality confirmation (Part 2 + the state-typo extension).
// Drives the wizard to the state step and types a misspelled locality; asserts the "Did
// you mean ...?" confirm + chips render, only the confirm chips are active (prior state
// chips dimmed), and accepting advances. Covers a CITY typo and a STATE-NAME typo. The
// confirm fires BEFORE any search, so this spends ZERO OldCarsData. Usage: node scripts/localityVerify.mjs
import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) fails++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
const lastSam = () => page.evaluate(() => { const r = [...document.querySelectorAll(".row.sam")]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
const activeChips = () => page.evaluate(() => [...document.querySelectorAll(".chip")].filter(c => !c.classList.contains("chip-spent")).map(c => c.textContent.trim()));
async function type(t) { await page.evaluate(x => { document.getElementById("inp").value = x; }, t); await page.click("#btn"); await sleep(2200); }
async function clickChip(l) { const h = await page.evaluate(x => { const c = [...document.querySelectorAll(".chip")].filter(b => !b.classList.contains("chip-spent") && b.textContent.trim().toLowerCase().includes(x.toLowerCase())); if (c.length) { c[c.length - 1].click(); return true; } return false; }, l); await sleep(2200); return h; }

// One case: fresh load, drive to the state step, type the misspelled locality, assert.
async function testTypo(label, input, promptRe) {
  await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#inp", { timeout: 30000 });
  await type("2021 Porsche 911 Carrera");
  let typed = false, seen = false;
  for (let i = 0; i < 16; i++) {
    const s = (await lastSam()).toLowerCase();
    if (promptRe.test(s)) { seen = true; break; }
    if (/which state|what state/.test(s) && !typed) { typed = true; await type(input); continue; }
    if (/which trim|any specific trim|edition|did you mean the/.test(s)) await type("skip");
    else if (/which country|located|region of the world/.test(s)) { if (!await clickChip("United States")) await type("United States"); }
    else await type("skip");
  }
  const reply = await lastSam(); const active = await activeChips();
  console.log(`\n[${label}] "${input}" -> ${reply.slice(0, 120)}`);
  console.log(`[${label}] ACTIVE CHIPS -> ${JSON.stringify(active)}`);
  ok(seen || promptRe.test(reply), `${label}: "${input}" surfaces the confirm prompt`);
  ok(active.some(c => /^yes, california$/i.test(c)) && active.some(c => /somewhere else/i.test(c)), `${label}: only the confirm chips are active`);
  ok(!active.some(c => /^(florida|texas|new york|new jersey|other)$/i.test(c)), `${label}: prior state-step chips are dimmed`);
  await clickChip("Yes, California");
  ok(!/did you mean/i.test(await lastSam()), `${label}: accepting the confirm advances`);
}

await testTypo("city-typo", "san fransisco", /did you mean san francisco, california\?/);
await testTypo("state-typo", "californa", /did you mean california\?/);

await browser.close();
console.log(fails === 0 ? "\nLOCALITY DEPLOYED-PAGE CHECK: ALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
