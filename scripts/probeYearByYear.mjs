import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
async function yr(platform, y) {
  for (let a=0;a<4;a++){
    try { const r = await p.evaluate(async (pl,yy)=>{const res=await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"count",platforms:[pl],dateFrom:yy+"-01-01",dateTo:yy+"-12-31"})});return res.ok?await res.json():{err:res.status};}, platform, String(y));
      const v = r.out && r.out[0] && r.out[0].windowCount; if (v!=null) return v; } catch(e){}
  }
  return null;
}
for (const pl of ["Bring a Trailer","Cars & Bids"]) {
  const row = {};
  for (const y of [2020,2021,2022,2023,2024,2025,2026]) row[y] = await yr(pl, y);
  console.log(pl+":", JSON.stringify(row));
}
const vp = await p.evaluate(async()=>(await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"vinPresence",vins:["WBABB1300J8271628"]})})).json());
console.log("VIN WBABB1300J8271628:", JSON.stringify(vp.presence||vp));
await b.close();
