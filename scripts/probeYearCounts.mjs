import puppeteer from "puppeteer-core";
import { withProbeKey } from "./_probeKey.mjs";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.HVT_BASE || "https://goasksam.com";
const body = JSON.parse(process.argv[2] || '{"archiveQuery":"yearCounts","platforms":["Bring a Trailer","Cars & Bids"],"dateFrom":"2023-01-01","dateTo":"2025-12-31"}');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage(); await withProbeKey(page);
await page.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: new URL(BASE).hostname, path: "/" });
await page.goto(BASE + "/sell", { waitUntil: "networkidle2" });
const out = await page.evaluate(async b => {
  const r = await fetch("/api/sellerDecision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, body);
console.log(JSON.stringify(out, null, 2));
await browser.close();
