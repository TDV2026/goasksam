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

// BaT 2025 in monthly slices (small enough not to time out); retry each until non-null.
const months = [];
for (let m = 1; m <= 12; m++) {
  const from = `2025-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? "2025-12-31" : `2025-${String(m + 1).padStart(2, "0")}-01`;
  let v = null;
  for (let a = 0; a < 4 && v == null; a++) {
    const r = await post({ archiveQuery: "count", platforms: ["Bring a Trailer"], dateFrom: from, dateTo: to });
    v = r.json?.out?.[0]?.windowCount;
  }
  months.push([from, v]);
  process.stderr.write(`${from}: ${v}\n`);
}
const bat2025 = months.reduce((s, [, v]) => s + (v || 0), 0);
const anyNull = months.some(([, v]) => v == null);
console.log(JSON.stringify({ bat2025, anyNull, months }, null, 2));

// VIN re-check
const vin = "WBABB1300J8271628";
const vp = await post({ archiveQuery: "vinPresence", vins: [vin] });
console.log("VIN " + vin + " presence:", JSON.stringify(vp.json?.presence || vp.json));
await browser.close();
