import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const cnt = (body) => p.evaluate(async (x) => { for(let a=0;a<4;a++){ try{ const res=await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(x)}); if(res.ok){const j=await res.json(); const v=j.out&&j.out[0]&&j.out[0].windowCount; if(v!=null)return v;} }catch(e){} } return null; }, body);
const P=["Bring a Trailer","Cars & Bids"];
// (b) created_at buckets for rows with sale_date 2023-2025
console.log("=== (b) created_at (ingest) buckets for 2023-2025 rows ===");
for (const pl of P) {
  const base={archiveQuery:"count",platforms:[pl],dateFrom:"2023-01-01",dateTo:"2025-12-31",noYears:true};
  const runWin = await cnt({...base, createdFrom:"2026-09-22T20:48:00Z", createdTo:"2026-09-22T21:28:59Z"});
  const onDay  = await cnt({...base, createdFrom:"2026-09-22T00:00:00Z", createdTo:"2026-09-22T23:59:59Z"});
  const before = await cnt({...base, createdTo:"2026-09-22T00:00:00Z"});
  const after  = await cnt({...base, createdFrom:"2026-09-23T00:00:00Z"});
  const totalWin = await cnt({...base});
  console.log(pl+": sale-2023-2025 total="+totalWin+" | created_in_run_window(20:48-21:28 Sep22)="+runWin+" | created_on_Sep22="+onDay+" | created_before_Sep22="+before+" | created_after_Sep22="+after);
}
// created-by-month histogram (shape) for BaT 2023-2025 rows
console.log("=== created-by-month (BaT, sale 2023-2025) ===");
const months=[];
for (let y=2025;y<=2026;y++) for (let m=1;m<=12;m++){ if(y===2026&&m>9)break; months.push(y+"-"+String(m).padStart(2,"0")); }
// only sample recent created months (backfills are recent); also add a pre-2025 bucket
const preCount = await cnt({archiveQuery:"count",platforms:["Bring a Trailer"],dateFrom:"2023-01-01",dateTo:"2025-12-31",noYears:true,createdTo:"2025-01-01T00:00:00Z"});
process.stdout.write("  created before 2025: "+preCount+"\n");
for (const mo of months){ const nx=nextMonth(mo); const c=await cnt({archiveQuery:"count",platforms:["Bring a Trailer"],dateFrom:"2023-01-01",dateTo:"2025-12-31",noYears:true,createdFrom:mo+"-01T00:00:00Z",createdTo:nx+"-01T00:00:00Z"}); process.stdout.write("  "+mo+": "+c+"\n"); }
function nextMonth(mo){let[y,m]=mo.split("-").map(Number);m++;if(m>12){m=1;y++;}return y+"-"+String(m).padStart(2,"0");}
await b.close();
