import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const p=await b.newPage(); await p.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});
await p.goto("https://goasksam.com/onebox",{waitUntil:"networkidle2"});
const r=await p.evaluate(async()=>{const res=await fetch("/api/vehicleIdentity",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:"2018 Jaguar XF Sportbrake S"})});const t=await res.text();try{return JSON.parse(t)}catch(e){return{raw:t.slice(0,120)}}});
const v=r.vehicle||r;console.log("model:",v.model,"| trim:",v.trim,"| bodyStyle:",v.bodyStyle,"| canonicalLabel:",v.canonicalLabel);
await b.close();
