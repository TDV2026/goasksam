import puppeteer from "puppeteer-core";
const EXEC="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [,,source,from,startArg]=process.argv;
const b=await puppeteer.launch({executablePath:EXEC,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
p.setDefaultTimeout(280000);
await p.goto("https://goasksam.com/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2000));
let startpage=Number(startArg||1), totMetered=0, totPersisted=0, done=false, guard=0, rlStreak=0;
while(!done && guard++<40){
  const url=`/api/publicConfig?bf=bf9x3k&mode=pull&source=${source}&from=${from}&maxcalls=60&startpage=${startpage}`;
  let out; try{ out=await p.evaluate(async(u)=>{const r=await fetch(u);return await r.json();},url); }catch(e){console.log("evaluate err, retry:",e.message);await new Promise(r=>setTimeout(r,6000));continue;}
  if(out.error){console.log("ERR:",JSON.stringify(out));break;}
  totMetered+=out.meteredThisRun||0; totPersisted+=out.persistedThisRun||0;
  console.log(`[${source}] start=${startpage} -> next=${out.nextPage} metered=${out.meteredThisRun} persisted=${out.persistedThisRun} oldest=${out.oldestSeen} stop=${out.stopReason} ocdRem=${out.ocdRemaining}`);
  done=out.done;
  if(out.nextPage===startpage){ rlStreak++; await new Promise(r=>setTimeout(r,10000*Math.min(rlStreak,6))); } else { rlStreak=0; await new Promise(r=>setTimeout(r,2500)); }
  startpage=out.nextPage;
}
console.log(`\n[${source}] TOTAL metered=${totMetered} persisted=${totPersisted} done=${done} finalNext=${startpage}`);
await b.close();
