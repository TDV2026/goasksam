import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
const pages=[["home","/"],["find","/find"],["mc","/market-check"],["sell","/sell"],["tasks","/tasks"],["about","/about"],["privacy","/privacy"],["feedback","/feedback"]];
const out=process.argv[2]; const BASE=process.env.BASE||"https://goasksam.com";
for(const [n,path] of pages){const p=await b.newPage();await p.setViewport({width:1440,height:900});
 await p.setExtraHTTPHeaders({"x-ops-key":process.env.PROBE_KEY,"x-launch-stage-test":"2"});
 const r=await p.goto(BASE+path,{waitUntil:"networkidle2",timeout:60000}).catch(()=>null);await new Promise(r=>setTimeout(r,1500));
 const d=await p.evaluate(()=>{const q=s=>document.querySelector(s);const wm=q(".gas-wm .gas-logo,.rail .wm .logo,.gas-logo,.logo");const be=q(".gas-beta,.beta");const tb=[...document.querySelectorAll("[data-tasks-badge],.tbadge")].map(e=>({txt:e.textContent,hidden:e.hidden||getComputedStyle(e).display==="none"}));const R=e=>{if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),fs:c.fontSize}};return {rail:!!q("#gas-rail,.rail"),wm:R(wm),beta:R(be),badge:tb}});
 console.log(n,r&&r.status(),JSON.stringify(d));await p.screenshot({path:`${out}/rail-${n}-1440.png`});await p.close();}
await b.close();
