import puppeteer from "puppeteer-core";
// THE LIVE GUARD (Lane F's rule, Oct 20 2026): this script POSTs to PRODUCTION /api/sellerDecision (the full Sell path,
// which can spend OldCarsData on a cache miss). It refuses without --live and says what it would call; run it only in a
// gap the lanes name, with the protection-bypass header.
if (!process.argv.includes("--live")) { console.log("probeDeskRecs: REFUSED. This script POSTs to production /api/sellerDecision (the full Sell path). Run it only in a gap the lanes name, with --live."); process.exit(2); }
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: process.env.GAS_CREW_COOKIE || "", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const j = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",question:"Which house has sold the most air-cooled 911s in the last two years, and what did they bring?"})})).json());
const recs = (j.receipts||[]).slice().sort((a,c)=>(a.hammer_usd||0)-(c.hammer_usd||0));
console.log("CHEAPEST 14 (venue | hammerUSD | year | title):");
for (const r of recs.slice(0,14)) console.log(" ", (r.venue||"").padEnd(16), String(r.hammer_usd).padStart(10), r.year||"?", "|", (r.title||"").slice(0,70));
console.log("\nDEARER end 4:");
for (const r of recs.slice(-4)) console.log(" ", (r.venue||"").padEnd(16), String(r.hammer_usd).padStart(10), r.year||"?", "|", (r.title||"").slice(0,70));
await b.close();
