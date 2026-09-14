import puppeteer from "puppeteer-core";import fs from "node:fs";
const CHROME=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome"].filter(Boolean).find(p=>fs.existsSync(p));
const HOST="goasksam.com";const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();await p.setCookie({name:"gas_crew",value:"ok",domain:HOST,path:"/"});await p.goto("https://goasksam.com/",{waitUntil:"networkidle2"});await new Promise(r=>setTimeout(r,2800));
async function diag(v){return await p.evaluate(async(v)=>{const r=await fetch("/api/sellerDecision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({car:{vehicle:v,region:"US",state:"California"},poolDiag:true})});return await r.json()},v);}
for(const v of [{make:"Porsche",model:"911",year:2008,valid:true},{make:"Chevrolet",model:"Corvette",year:2004,valid:true},{make:"Ferrari",model:"360",year:2002,valid:true}]){
 const j=await diag(v);
 const f=j.fresh||{},s=j.store||{};
 console.log(`\n${v.make} ${v.model} ${v.year}:`);
 console.log(`  FRESH total=${f.total} inWin=${f.inWindow180} -> landed=${f.analysis?.landed?.key} (${f.analysis?.evidenceSales}) walk=${(f.analysis?.walk||[]).map(x=>x.key+":"+x.sales+(x.met?"*":"")).join(", ")}`);
 console.log(`  STORE total=${s.total} inWin=${s.inWindow180} -> landed=${s.analysis?.landed?.key} (${s.analysis?.evidenceSales}) walk=${(s.analysis?.walk||[]).map(x=>x.key+":"+x.sales+(x.met?"*":"")).join(", ")}`);
 console.log(`  gap freshOnly=${j.gap?.freshOnlyCount} storeOnly=${j.gap?.storeOnlyCount}  => ${f.analysis?.landed?.key===s.analysis?.landed?.key?"SAME rung":"DIFFERENT rung (inconsistent!)"}`);
}
await b.close();
