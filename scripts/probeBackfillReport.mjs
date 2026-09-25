import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const call = (body) => p.evaluate(async (x) => (await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(x)})).json(), body);
// exact per-source per-sale-year counts (retry to fill any timeout nulls)
const merged = {};
for (let a=0;a<6;a++){
  const r = await call({ archiveQuery:"count", platforms:["Bring a Trailer","Cars & Bids"], dateFrom:"2023-01-01", dateTo:"2025-12-31" });
  for (const row of (r.out||[])) { const m=merged[row.platform]=merged[row.platform]||{total:null,bySaleYear:{}}; if(row.total!=null)m.total=row.total; for(const [y,v] of Object.entries(row.bySaleYear||{})) if(v!=null)m.bySaleYear[y]=v; }
  const done = ["Bring a Trailer","Cars & Bids"].every(pl=>merged[pl] && [2023,2024,2025,2026].every(y=>merged[pl].bySaleYear[y]!=null));
  if (done) break;
}
console.log("=== 3. rows per source per SALE year (exact, Content-Range) ===");
console.log(JSON.stringify(merged,null,1));
// earliest sold date per source
const yc = await call({ archiveQuery:"yearCounts", platforms:["Bring a Trailer","Cars & Bids"], yearMin:2000, yearMax:2026 });
console.log("=== 4. earliest sold date per source ===");
for (const o of (yc.out||[])) console.log(" ", o.platform, "earliest:", o.earliest, "| in-window(paged, may cap):", o.inRange);
// VIN
const vp = await call({ archiveQuery:"vinPresence", vins:["WBABB1300J8271628"] });
console.log("=== 6. VIN WBABB1300J8271628 presence ===", JSON.stringify(vp.presence||vp));
await b.close();
