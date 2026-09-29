import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/", { waitUntil: "networkidle2" });
async function dbg(raw,st){
  const d=await p.evaluate(async(body)=>{const r=await fetch("/api/sellerDecision",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return await r.json();},{car:{raw,acceptModelLevel:true},state:st,region:"South",targetPrice:"122000",debug:true});
  return {veh:d.vehicle?{make:d.vehicle.make,model:d.vehicle.model,trim:d.vehicle.trim,year:d.vehicle.year}:null, gen:d.decision&&d.decision.generation, rdbg:d.decision&&d.decision._reserveDbg};
}
console.log("911:",JSON.stringify(await dbg("2011 Porsche 911 Carrera","Texas")));
console.log("M3:",JSON.stringify(await dbg("2002 BMW M3","Texas")));
await b.close();
