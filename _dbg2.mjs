import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/", { waitUntil: "networkidle2" });
// how much reserve data exists for the 997 (911, 2005-2012, last 12mo)?
const pool=await p.evaluate(async()=>{const r=await fetch("/api/sellerDecision",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({archiveQuery:"pool",make:"Porsche",term:"911",yearMin:2005,yearMax:2012})});return await r.json();});
const rows=(pool&&pool.rows)||[];
const since=new Date(Date.now()-365*864e5).toISOString().slice(0,10);
const recent=rows.filter(r=>String(r.date||"")>=since);
// has_reserve isn't in the pool cols; check raw via a targeted query is hard. Just report counts + a sample title/price.
console.log("997 911 2005-2012 rows total:",rows.length,"last12mo:",recent.length);
// debug the reserveInsight directly via debug flag
const dec=await p.evaluate(async()=>{const r=await fetch("/api/sellerDecision",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({car:{raw:"2011 Porsche 911 Carrera",acceptModelLevel:true},state:"Texas",region:"South",targetPrice:"122000",debug:true})});return await r.json();});
const dd=dec.decision||{};
console.log("recommendedPath:",dd.recommendedPath,"routeFit routes:",(dd.routeFit&&dd.routeFit.routes||[]).length);
const routes=(dd.routeFit&&dd.routeFit.routes)||[];
routes.slice(0,3).forEach(r=>console.log("  route",r.platform||r.label,"routable:",r.routable,"hasEv:",!!r.marketEvidence,"reserveInsight:",r.marketEvidence&&r.marketEvidence.reserveInsight?JSON.stringify(r.marketEvidence.reserveInsight):"none"));
console.log("priceBand:",JSON.stringify(dd.priceBand));
// render via renderDecision (the real path) and read the page
const out=await p.evaluate((dec)=>{
  document.getElementById("msgs").innerHTML="";
  sellState.active=true;sellState.sellDecision=dec;sellState.decision=dec.decision;sellState.resolvedVehicle=dec.vehicle;
  sellState.carName="2011 Porsche 911 Carrera";sellState.state="Texas";sellState.region="South";sellState.price="122000";sellState.sellerPreference="unsure";sellState.step=12;
  try{ renderDecision(dec); }catch(e){ return {err:String(e)}; }
  var t=document.getElementById("msgs").innerText;
  return { len:t.length, best:(t.match(/sold for the most[^.]*\./i)||[])[0]||null, closeStrong:/close strongest|closed strongest/i.test(t),
    reserve:(t.match(/reserve[^.]*\./i)||[])[0]||null, ask:(t.match(/Your \$[\d,]+ ask[^.]*\./i)||[])[0]||null, serves:(t.match(/Serves[^.]*\.|Works nationwide/i)||[])[0]||null };
},dec);
console.log("\\nrenderDecision out:",JSON.stringify(out));
await b.close();
