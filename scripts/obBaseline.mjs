// LIVE baseline: drives the real goasksam.com/onebox UI (type + Enter), intercepts the
// /api/sellerDecision response, and captures the RENDERED #ob text. Zero code changes.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCENARIOS = [
  "S65", "S65 AMG 2010", "2003 Mercedes-Benz S-Class", "300SL Roadster",
  "E46 M3", "E46 M3 CSL", "BMW M3 Coupe", "2016 BMW M3",
  "Ford GT", "2006 Ford GT", "GT40", "F355", "F355 GTS", "F355 Spider", "d50",
  // scenario 17: three of my own (multi-gen nameplate, badge, body-split classic)
  "2015 Chevrolet Corvette Z06", "Jaguar E-Type", "1969 Porsche 911"
];

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], protocolTimeout: 120000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: new URL(BASE).hostname, path: "/" });

let lastApi = null;
p.on("response", async (r) => {
  try {
    if (/\/api\/(sellerDecision|vehicleIdentity)/.test(r.url())) {
      const j = await r.json().catch(() => null);
      if (j) lastApi = { url: r.url().split("/api/")[1], body: j };
    }
  } catch (e) {}
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runOne(q) {
  lastApi = null;
  await p.goto(BASE + "/onebox", { waitUntil: "domcontentloaded" });
  await sleep(700);
  await p.evaluate(() => { const i = document.getElementById("ob-input"); if (i) { i.value = ""; i.focus(); } });
  await p.type("#ob-input", q, { delay: 8 });
  await p.keyboard.press("Enter");
  // wait for an API response then let the loader + render settle
  for (let i = 0; i < 40 && !lastApi; i++) await sleep(250);
  await sleep(3500);
  const rendered = await p.evaluate(() => {
    const ob = document.getElementById("ob");
    const txt = ob ? ob.innerText.replace(/\n{2,}/g, "\n").trim() : "(no #ob)";
    const chips = Array.prototype.map.call(document.querySelectorAll("#ob .qchips button, #ob .askchips button, #ob .chip, #ob [data-chip], #ob .qchip"), e => e.innerText.trim()).filter(Boolean);
    return { txt, chips: [...new Set(chips)] };
  });
  const d = lastApi ? lastApi.body : null;
  return {
    q, api: lastApi ? lastApi.url : "(none)",
    tier: d && (d.tier || d.status), resolvedCar: d && d.resolvedCar,
    prompt: d && (d.prompt || (d.clarification && d.clarification.question)),
    bodyOptions: d && d.bodyOptions, generationOptions: d && (d.generationOptions || []).map(o => o.label || o),
    span: d && d.span, poolN: d && d.poolN, thinN: d && d.thin && d.thin.totalN,
    classEraN: d && d.classEra && d.classEra.totalN, windowLabel: d && d.windowLabel,
    widening: d && d.widening, modelWidened: d && d.modelWidened,
    freshness: d && d.freshness,
    renderedChips: rendered.chips,
    rendered: rendered.txt.slice(0, 900)
  };
}

for (const q of SCENARIOS) {
  try {
    const r = await runOne(q);
    console.log("\n================= " + q + " =================");
    console.log("api:", r.api, "| tier:", r.tier);
    if (r.resolvedCar) console.log("resolved:", JSON.stringify(r.resolvedCar));
    if (r.prompt) console.log("PROMPT:", r.prompt);
    if (r.bodyOptions) console.log("bodyOptions:", JSON.stringify(r.bodyOptions));
    if (r.generationOptions && r.generationOptions.length) console.log("generationOptions:", JSON.stringify(r.generationOptions));
    console.log("span:", JSON.stringify(r.span), "| poolN:", r.poolN, "| thinN:", r.thinN, "| classEraN:", r.classEraN);
    console.log("windowLabel:", r.windowLabel, "| widening:", r.widening || (r.modelWidened ? JSON.stringify(r.modelWidened) : null));
    console.log("freshness:", JSON.stringify(r.freshness));
    console.log("RENDERED CHIPS:", JSON.stringify(r.renderedChips));
    console.log("RENDERED TEXT:\n" + r.rendered);
  } catch (e) { console.log("\n================= " + q + " =====  ERROR:", e.message); }
}
await b.close();
