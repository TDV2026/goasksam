import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://goasksam.com";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ANON = "obdiag-" + Date.now() + "-" + Math.floor(Math.random()*1e9);
const CARS = [
  { raw: "2006 Mercedes S65 AMG" },
  { raw: "1995 Ferrari F355 GTS" },
  { raw: "2005 Ford GT" },
  { raw: "1957 Mercedes 300SL Roadster" },
  { raw: "E46 M3" }
];
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: new URL(BASE).hostname, path: "/" });
await p.goto(BASE, { waitUntil: "domcontentloaded" });
for (const car of CARS) {
  const d = await p.evaluate(async (base, anon, car) => {
    const r = await fetch(base + "/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ oneBox: true, anonId: anon, car }) });
    return await r.json();
  }, BASE, ANON, car);
  const out = {
    q: car.raw, tier: d.tier, status: d.status,
    resolvedCar: d.resolvedCar,
    span: d.span, cluster: d.cluster,
    poolN: d.poolN, count: d.count,
    thin: d.thin ? { totalN: d.thin.totalN, receipts: d.thin.receipts && d.thin.receipts.length, houseSteer: d.thin.houseSteer } : null,
    classEra: d.classEra ? { totalN: d.classEra.totalN, era: d.classEra.era } : null,
    bodyOptions: d.bodyOptions, generationOptions: d.generationOptions && d.generationOptions.map(o=>o.label),
    modelWidened: d.modelWidened, widening: d.widening, prompt: d.prompt,
    resolvedSpec: d.resolvedSpec
  };
  console.log(JSON.stringify(out, null, 2));
}
await b.close();
