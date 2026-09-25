import puppeteer from "puppeteer-core";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/sell", { waitUntil: "networkidle2" });
const cnt = (pl,from,to) => p.evaluate(async (a) => { for(let k=0;k<4;k++){try{const res=await fetch("/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"count",platforms:[a[0]],dateFrom:a[1],dateTo:a[2],noYears:true})});if(res.ok){const j=await res.json();const v=j.out&&j.out[0]&&j.out[0].windowCount;if(v!=null)return v;}}catch(e){}}return null;}, [pl,from,to]);
function months(){const o=[];for(let y=2022;y<=2026;y++)for(let m=1;m<=12;m++){if(y===2026&&m>9)break;o.push([y,m]);}return o;}
function lastDay(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate();}
for (const pl of ["Bring a Trailer","Cars & Bids"]){
  const row={};
  for (const [y,m] of months()){ const mm=String(m).padStart(2,"0"); row[y+"-"+mm]=await cnt(pl,`${y}-${mm}-01`,`${y}-${mm}-${lastDay(y,m)}`); }
  console.log("### "+pl);
  console.log(JSON.stringify(row));
}
await b.close();
