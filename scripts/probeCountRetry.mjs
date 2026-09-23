import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
const post = b => page.evaluate(async body => {
  const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, b);

const merged = {};
for (let attempt = 1; attempt <= 8; attempt++) {
  const r = await post({ archiveQuery: "count", platforms: ["Bring a Trailer", "Cars & Bids"], dateFrom: "2023-01-01", dateTo: "2025-12-31" });
  for (const row of (r.json?.out || [])) {
    const m = merged[row.platform] = merged[row.platform] || { total: null, windowCount: null, bySaleYear: {} };
    if (row.total != null) m.total = row.total;
    if (row.windowCount != null) m.windowCount = row.windowCount;
    for (const [y, v] of Object.entries(row.bySaleYear || {})) if (v != null) m.bySaleYear[y] = v;
  }
  const stillNull = Object.values(merged).some(m => m.total == null || m.windowCount == null || [2023,2024,2025].some(y => m.bySaleYear[y] == null));
  process.stderr.write(`attempt ${attempt} done; stillNull=${stillNull}\n`);
  if (!stillNull) break;
}
console.log(JSON.stringify(merged, null, 2));
await browser.close();
