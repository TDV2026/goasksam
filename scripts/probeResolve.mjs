import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const inputs = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "gas_crew", value: "ok", domain: new URL(BASE).hostname, path: "/" });
await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
for (const raw of inputs) {
  const r = await page.evaluate(async text => {
    const res = await fetch("/api/vehicleIdentity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, debug: true }) });
    return { status: res.status, json: await res.json().catch(() => null) };
  }, raw);
  console.log("=== INPUT:", JSON.stringify(raw), "===");
  console.log(JSON.stringify(r.json, null, 2));
}
await browser.close();
