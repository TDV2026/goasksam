import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const call = (body) => p.evaluate(async (x) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(x)})).json(), body);
const merged = {};
for (let a=0;a<8;a++){
  const r = await call({ archiveQuery:"count", platforms:["Bring a Trailer","Cars & Bids"], dateFrom:"2023-01-01", dateTo:"2025-12-31" });
  for (const row of (r.out||[])) { const m=merged[row.platform]=merged[row.platform]||{total:null,bySaleYear:{}}; if(row.total!=null)m.total=row.total; for(const [y,v] of Object.entries(row.bySaleYear||{})) if(v!=null)m.bySaleYear[y]=v; }
  const done = ["Bring a Trailer","Cars & Bids"].every(pl=>merged[pl] && [2020,2021,2022,2023,2024,2025,2026].every(y=>merged[pl].bySaleYear[y]!=null));
  if (done) break;
}
console.log("COUNTS:", JSON.stringify(merged));
const vp = await call({ archiveQuery:"vinPresence", vins:["WBABB1300J8271628"] });
console.log("VIN:", JSON.stringify(vp.presence||vp));
await b.close();
