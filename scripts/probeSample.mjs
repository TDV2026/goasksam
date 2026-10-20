import puppeteer from "puppeteer-core";
import { withProbeKey } from "./_probeKey.mjs";
// THE LIVE GUARD (Lane F's rule, Oct 20 2026): this script POSTs to PRODUCTION /api/sellerDecision (the full Sell path,
// which can spend OldCarsData on a cache miss). It refuses without --live and says what it would call; run it only in a
// gap the lanes name, with the protection-bypass header.
if (!process.argv.includes("--live")) { console.log("probeSample: REFUSED. This script POSTs to production /api/sellerDecision (the full Sell path). Run it only in a gap the lanes name, with --live."); process.exit(2); }
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); await withProbeKey(p);
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
for (const plat of ["RM Sotheby's","Gooding & Co","Bonhams","Broad Arrow"]) {
  const r = await p.evaluate(async (pl) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"sample",platform:pl,limit:3})})).json(), plat);
  console.log("\n===== "+plat+" =====");
  console.log("keys:", (r.rows&&r.rows[0]&&r.rows[0].keys||[]).join(", "));
  for (const row of (r.rows||[])) {
    const raw = row.raw||{};
    const cand = {}; for (const k of Object.keys(raw)) if (/sale|auction|event|online|venue|location|city|title/i.test(k)) cand[k]=raw[k];
    console.log("  •", row.title, "|", JSON.stringify(cand).slice(0,260));
  }
}
await b.close();
