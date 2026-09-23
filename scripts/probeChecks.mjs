import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
// CHECK 1: Q3 receipts model-year distribution (should be ~1986-1991 for E30 only)
const q3 = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",question:"E30 M3s: median and count by month over three years, houses and online."})})).json());
const yrs = {};
for (const r of (q3.receipts||[])) { const y=r.year||"?"; yrs[y]=(yrs[y]||0)+1; }
console.log("Q3 total:", q3.answer&&q3.answer.total, "| model-year histogram:", JSON.stringify(Object.fromEntries(Object.entries(yrs).sort())));
// CHECK 2: Duesenberg Model J house sales in 36mo, raw (with + without photo)
const HOUSES=["RM Sotheby's","Gooding & Co","Bonhams","Broad Arrow","Barrett-Jackson","Mecum Auctions"];
const raw = await p.evaluate(async () => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"pool",term:"Model J",make:"Duesenberg",dateFrom:"2023-09-23",dateTo:"2026-09-23"})})).json());
const houseRows=(raw.rows||[]).filter(r=>HOUSES.includes(r.platform));
console.log("Duesenberg Model J raw house rows (36mo):", houseRows.length);
for (const r of houseRows) console.log("   ", r.date, r.platform, "$"+r.price, "|", (r.title||"").slice(0,50));
await b.close();
