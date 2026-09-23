import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const W3FROM = new Date(Date.now() - 36 * 30.44 * 864e5).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
const pool = b => page.evaluate(async body => {
  const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ archiveQuery: "pool", ...body }) });
  const j = await r.json().catch(() => null); return { status: r.status, count: j?.count, err: j?.error };
}, b);

// Each case: full config, then loosen one filter at a time.
const cases = [
  { name: "Testarossa", term: ["Testarossa"], make: "Ferrari", yMin: 1987, yMax: 1991 },
  { name: "458 Italia", term: ["458 Italia"], make: "Ferrari", yMin: 2010, yMax: 2015 },
  { name: "Ford GT", term: ["Ford GT"], make: "Ford", yMin: 2005, yMax: 2006 },
  { name: "Gallardo", term: ["Gallardo"], make: "Lamborghini", yMin: 2004, yMax: 2008 },
  { name: "NSX", term: ["NSX"], make: "Acura", yMin: 1991, yMax: 1996 },
];
for (const c of cases) {
  const full = await pool({ terms: c.term, make: c.make, yearMin: c.yMin, yearMax: c.yMax, dateFrom: W3FROM, dateTo: TODAY });
  const noDate = await pool({ terms: c.term, make: c.make, yearMin: c.yMin, yearMax: c.yMax });
  const noYear = await pool({ terms: c.term, make: c.make });
  const noMake = await pool({ terms: c.term });
  console.log(`${c.name}: full(term+make+year+36mo)=${JSON.stringify(full)}  noDate=${JSON.stringify(noDate)}  noYear=${JSON.stringify(noYear)}  termOnly=${JSON.stringify(noMake)}`);
}
await browser.close();
