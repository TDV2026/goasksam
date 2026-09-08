import puppeteer from "puppeteer-core";
const EXEC="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [,,source,from]=process.argv;
const b=await puppeteer.launch({executablePath:EXEC,headless:"new",args:["--no-sandbox"]});
const p=await b.newPage();
p.setDefaultTimeout(280000);
await p.goto("https://goasksam.com/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2000));
let startpage=1, totMetered=0, totPersisted=0, done=false, guard=0;
while(!done && guard++<12){
  const url=`/api/publicConfig?bf=bf9x3k&mode=pull&source=${source}&from=${from}&maxcalls=80&startpage=${startpage}`;
  const out=await p.evaluate(async(u)=>{const r=await fetch(u);return await r.json();},url);
  if(out.error){console.log("ERR:",JSON.stringify(out));break;}
  totMetered+=out.meteredThisRun||0; totPersisted+=out.persistedThisRun||0;
  console.log(`[${source}] batch start=${startpage} -> next=${out.nextPage} metered=${out.meteredThisRun} persisted=${out.persistedThisRun} oldest=${out.oldestSeen} stop=${out.stopReason} ocdRem=${out.ocdRemaining}`);
  done=out.done; startpage=out.nextPage;
  await new Promise(r=>setTimeout(r,1500)); // gentle stagger
}
console.log(`\n[${source}] TOTAL metered=${totMetered} persisted=${totPersisted} done=${done}`);
await b.close();
