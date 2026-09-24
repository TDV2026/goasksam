// Sam Desk golden / regression checks (production). Run: node scripts/deskGolden.mjs
import puppeteer from "puppeteer-core";
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE=(process.argv.find(a=>a.startsWith("http"))||"https://goasksam.com").replace(/\/$/,"");
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCookie({name:"gas_crew",value:"ok",domain:new URL(BASE).hostname,path:"/"});
await p.goto(BASE+"/sell",{waitUntil:"networkidle2"});
const run=(dsl,vehicle)=>p.evaluate(async(dsl,vehicle,BASE)=>{const r=await fetch(BASE+"/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({desk:true,action:"run",dsl,vehicle})});const t=await r.text();let j;try{j=JSON.parse(t)}catch(e){return{parseError:t.slice(0,60)}}return{status:j.status,total:j.answer&&j.answer.total,ids:(j.receipts||[]).filter(x=>!x.excluded).map(x=>x.title+"|"+x.hammer_usd).sort()};},dsl,vehicle,BASE);
let fails=0; const ck=(n,ok,d="")=>{console.log((ok?"PASS":"FAIL")+"  "+n+(ok?"":"  -> "+d));if(!ok)fails++;};

// (b) widening can never shrink: Carrera T 2016-2019 >= 2018-2019, and > 0
const ct16=await run({filters:{make:"Porsche",model:"911",trim:"Carrera T",year_min:2016,year_max:2019,window:"36mo"},groupBy:[],measures:["count"]},{make:"Porsche",model:"911",trim:"Carrera T",year:2016});
const ct18=await run({filters:{make:"Porsche",model:"911",trim:"Carrera T",year_min:2018,year_max:2019,window:"36mo"},groupBy:[],measures:["count"]},{make:"Porsche",model:"911",trim:"Carrera T",year:2018});
console.log("  Carrera T 2016-2019:",ct16.total,"| 2018-2019:",ct18.total);
ck("(b) Carrera T 2016-2019 > 0 (was 0)", ct16.total>0, JSON.stringify(ct16));
ck("(b) widening 2016-2019 >= narrower 2018-2019", (ct16.total||0)>=(ct18.total||0), `${ct16.total} vs ${ct18.total}`);

// (c) determinism: GT350 three runs identical pool
const runs=[]; for(let i=0;i<3;i++){ runs.push(await run({filters:{make:"Shelby",model:"GT350",year_min:1965,year_max:1967,window:"36mo"},groupBy:[],measures:["count"]},{make:"Shelby",model:"GT350",year:1965})); await new Promise(r=>setTimeout(r,700)); }
console.log("  GT350 totals:",runs.map(r=>r.total).join(", "));
const t0=runs[0].total, sameTotal=runs.every(r=>r.total===t0);
const sig=r=>JSON.stringify(r.ids), sameSet=runs.every(r=>sig(r)===sig(runs[0]));
ck("(c) GT350 same total across 3 runs", sameTotal, runs.map(r=>r.total).join(","));
ck("(c) GT350 identical receipt set across 3 runs", sameSet, "signatures differ");

console.log(fails?`\n${fails} FAILURE(S)`:"\nAll Desk golden checks passed.");
await b.close(); process.exit(fails?1:0);
