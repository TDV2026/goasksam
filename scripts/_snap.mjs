import puppeteer from "puppeteer-core";
const BASE="https://goasksam.com", CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const Q=["ZHWBU37M47LA02229","2004 BMW M3 E46 coupe","E46 M3","2006 Mercedes S65 AMG","2018 Jaguar XF Sportbrake S","1991 Porsche 964 Carrera 2 Cabriolet 45,000 miles","2021 Porsche 911","1995 Ferrari F355 GTS","1967 Chevrolet Corvette 427","2005 Ford GT","1970 Chevrolet Chevelle SS 454","1957 Mercedes 300SL Roadster","1997 Land Rover Defender 90","1988 BMW E30 M3","1987 Dodge D50","1972 Datsun 240Z","Eagle Talon","Singer Gazelle","ram 50","Ram 50 1990"];
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"],protocolTimeout:120000});
const p=await b.newPage();p.setDefaultNavigationTimeout(90000);await p.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});
await p.goto(BASE,{waitUntil:"domcontentloaded",timeout:90000});
const out=await p.evaluate(async(base,Q)=>{
  async function ob(raw){const x=await fetch(base+"/api/sellerDecision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({oneBox:true,anonId:"snap"+Math.random(),car:{raw}})});return await x.json();}
  const r={};
  for(const q of Q){try{const d=await ob(q);r[q]={tier:d.tier,span:d.span||null,poolN:d.poolN!=null?d.poolN:(d.thin&&d.thin.totalN)||null};}catch(e){r[q]="ERR";}}
  return r;
},BASE,Q);
console.log(JSON.stringify(out));
await b.close();
