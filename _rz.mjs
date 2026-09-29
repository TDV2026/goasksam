import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
const p = await b.newPage();
await p.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
await p.goto("https://goasksam.com/", { waitUntil: "networkidle2" });
async function reserveSplit(make, term, yMin, yMax, trimRe){
  const pool=await p.evaluate(async(body)=>{const r=await fetch("/api/sellerDecision",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return await r.json();},{archiveQuery:"pool",make,term,yearMin:yMin,yearMax:yMax});
  const rows=(pool&&pool.rows)||[];
  const since=new Date(Date.now()-365*864e5).toISOString().slice(0,10);
  const r12=rows.filter(r=>String(r.date||"")>=since);
  const flagged=r12.filter(r=>r.hasReserve===true||r.hasReserve===false);
  const res=flagged.filter(r=>r.hasReserve===true);
  const no=flagged.filter(r=>r.hasReserve===false);
  const trimHit=trimRe?r12.filter(r=>new RegExp(trimRe,"i").test(r.title||"")):r12;
  const tRes=trimHit.filter(r=>r.hasReserve===true), tNo=trimHit.filter(r=>r.hasReserve===false);
  return {tot:rows.length, r12:r12.length, flagged:flagged.length, res:res.length, no:no.length, trimN:trimHit.length, tRes:tRes.length, tNo:tNo.length};
}
console.log("997 911 2005-2012 (gen, all trims):",JSON.stringify(await reserveSplit("Porsche","911",2005,2012)));
console.log("911 Carrera 2009-2013 (trim+/-2):",JSON.stringify(await reserveSplit("Porsche","911",2009,2013,"\\\\bCarrera\\\\b")));
console.log("BMW M3 2001-2006 (E46):",JSON.stringify(await reserveSplit("BMW","M3",2001,2006)));
await b.close();
