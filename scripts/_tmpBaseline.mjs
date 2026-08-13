import puppeteer from "puppeteer-core";
import fs from "node:fs";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = process.env.OUT || "/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/ladder-baseline.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=1200,1100"], defaultViewport: { width: 1120, height: 1050 } });

// Representative cars spanning the ladder branches, non-speed (answer preference,
// never a rush chip). pref = which preference chip to click.
const cars = [
  { text: "2021 Porsche 911 GT3", state: "California", price: "200000", pref: "myself" },
  { text: "2018 Mercedes-Benz E-Class", state: "California", price: "45000", pref: "myself" },
  { text: "2016 BMW M3", state: "New York", price: "70000", pref: "myself" },
  { text: "1973 Porsche 911 T", state: "New York", price: "120000", pref: "myself" },
  { text: "2015 Ferrari 458", state: "California", price: "250000", pref: "myself" },
  { text: "1967 Chevrolet Corvette", state: "Texas", price: "90000", pref: "myself" },
  { text: "2020 Chevrolet Corvette", state: "California", price: "70000", pref: "notsure" },
  { text: "2019 Porsche 911 Carrera", state: "California", price: "95000", pref: "handle" },
];
const prefLabel = { myself: "I'll sell it myself", handle: "I'd like someone to handle everything", notsure: "I'm not sure yet" };

async function run(car) {
  const page = await browser.newPage();
  await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
  await page.goto("https://goasksam.com/", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#inp", { timeout: 30000 });
  const lastSam = () => page.evaluate(() => { const r = [...document.querySelectorAll('.row.sam')]; const e = r[r.length - 1]; return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; });
  async function type(t) { await page.evaluate(x => { document.getElementById("inp").value = x; }, t); await page.click("#btn"); await sleep(2300); }
  async function chip(l) { const ok = await page.evaluate(x => { const c = [...document.querySelectorAll('.chip')].filter(b => b.textContent.trim().toLowerCase() === x.toLowerCase()); if (c.length) { c[c.length - 1].click(); return true; } return false; }, l); await sleep(2300); return ok; }
  await type(car.text);
  for (let i = 0; i < 15; i++) {
    if (await page.$(".pcard, .sell-rec-card")) break;
    const s = (await lastSam()).toLowerCase();
    if (/did you mean|is that right/.test(s)) await chip("Yes");
    else if (/which model|pick one below/.test(s)) await type("skip");
    else if (/any specific trim|package or edition/.test(s)) { if (!await chip("Skip")) await type("skip"); }
    else if (/which country|where are you/.test(s)) { if (!await chip("United States")) await type("United States"); }
    else if (/which state/.test(s)) { if (!await chip(car.state)) await type(car.state); }
    else if (/city or region|what state/.test(s)) await type(car.state);
    else if (/hoping to get|roughly what|price/.test(s)) await type(car.price);
    else if (/mileage/.test(s)) await type("skip");
    else if (/condition/.test(s)) { if (!await chip("Good")) await type("good"); }
    else if (/records|maintenance/.test(s)) { if (!await chip("Some")) await type("skip"); }
    else if (/title/.test(s)) { if (!await chip("Clean")) await type("skip"); }
    else if (/rush|timeline|how soon/.test(s)) { if (!await chip("No rush")) await type("skip"); }
    else if (/how would you like|handle the sale/.test(s)) { if (!await chip(prefLabel[car.pref])) await chip("I'm not sure yet"); }
    else await type("skip");
  }
  await sleep(2200);
  const cap = await page.evaluate(() => {
    const so = (window.sellState && sellState.sellOptions || []).map(o => ({ key: o.key, slug: o.platformSlug || null }));
    let comp = null;
    try { comp = (typeof v2Composition === "function") ? (() => { const c = v2Composition(); return { pick: c.pick && (c.pick.platformSlug || c.pick.name), alt: c.alt && (c.alt.platformSlug || c.alt.name), psRendered: c.psRendered, psLead: c.psLead, secondaryRendered: c.secondaryRendered }; })() : null; } catch (e) { comp = { err: String(e) }; }
    return {
      routingReason: window.sellState && sellState.routingReason,
      sellOptions: so,
      pcardCount: document.querySelectorAll('.pcard-platform').length,
      psCount: document.querySelectorAll('.pcard-ps, .pcard-powerseller, .pcard-trackblock').length,
      composition: comp,
      // structural: the ordered pick-name + why-label sequence (not the seeded copy body)
      pickName: (document.querySelector('.pcard-name') || {}).textContent || null,
    };
  });
  await page.close();
  return cap;
}

const out = {};
for (const car of cars) {
  out[car.text + " | " + car.pref] = await run(car);
  console.log(car.text.padEnd(30), JSON.stringify(out[car.text + " | " + car.pref]).slice(0, 200));
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("\nBASELINE written:", OUT);
await browser.close();
