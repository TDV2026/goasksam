import puppeteer from "puppeteer-core";
const OUT="/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/ob";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
async function run(id,q,steps){const p=await b.newPage();await p.setViewport({width:960,height:1500});await p.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});await p.goto("https://goasksam.com/onebox",{waitUntil:"networkidle2"});
 await p.waitForSelector("#ob-input");await p.type("#ob-input",q);await p.click("#ob-go");
 await p.waitForFunction(()=>{const r=document.getElementById("ob");return r&&(r.querySelector(".livetake")||r.querySelector(".refusal")||r.querySelector(".chips")||/trouble/i.test(r.textContent||""));},{timeout:70000}).catch(()=>{});
 await new Promise(r=>setTimeout(r,1500));
 // VIN confirm: click a "yes/that's it" chip if present
 if(steps==="confirm"){await p.evaluate(()=>{var c=[...document.querySelectorAll(".chips .chip,button")].find(e=>/that.?s it|correct|yes|confirm|see/i.test(e.textContent));if(c)c.click();});await p.waitForFunction(()=>{const r=document.getElementById("ob");return r&&(r.querySelector(".livetake")||r.querySelector(".exact")||r.querySelector(".refusal"));},{timeout:70000}).catch(()=>{});await new Promise(r=>setTimeout(r,1500));}
 const t=await p.evaluate(()=>{const g=s=>{const e=document.querySelector(s);return e?e.textContent.replace(/\s+/g," ").trim():null;};return {carline:g(".carline"),xname:g(".exact .xname"),since:g(".cfg.since"),lead:g(".blk .lead")||g(".carline"),band:g(".blk .band"),tail:g(".blk .tail"),span:g(".lt-span"),ob:(document.getElementById("ob")||{}).textContent?.replace(/\s+/g," ").trim().slice(0,360)};});
 console.log("\n=== ["+id+"] "+q+" ===");console.log(JSON.stringify(t,null,1).slice(0,700));
 await p.screenshot({path:OUT+"/before_"+id+".png"});await p.close();}
await run("m3","1988 BMW M3");
await run("jag","2018 Jaguar XF Sportbrake S");
await run("s65vin","WDBNG79J36A477562","confirm");
await b.close();
