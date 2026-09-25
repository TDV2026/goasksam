import puppeteer from "puppeteer-core";
const OUT="/private/tmp/claude-501/-Users-davidzysblat-Documents-GitHub-goasksam/ca33290f-26cb-4830-84de-21c1500cd74a/scratchpad/ob";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:"new",args:["--no-sandbox"]});
async function run(id,q,{confirm=false,mobile=false}={}){
 const p=await b.newPage();
 await p.setViewport(mobile?{width:390,height:1600}:{width:960,height:1600});
 await p.setCookie({name:"gas_crew",value:"ok",domain:"goasksam.com",path:"/"});
 await p.goto("https://goasksam.com/onebox",{waitUntil:"networkidle2"});
 await p.waitForSelector("#ob-input");await p.type("#ob-input",q);await p.click("#ob-go");
 await p.waitForFunction(()=>{const r=document.getElementById("ob");return r&&(r.querySelector(".livetake")||r.querySelector(".refusal")||r.querySelector(".chips")||/trouble/i.test(r.textContent||""));},{timeout:70000}).catch(()=>{});
 await new Promise(r=>setTimeout(r,1500));
 if(confirm){await p.evaluate(()=>{var c=[...document.querySelectorAll(".chips .chip,button")].find(e=>/that.?s it|correct|yes|confirm|see/i.test(e.textContent));if(c)c.click();});await p.waitForFunction(()=>{const r=document.getElementById("ob");return r&&(r.querySelector(".livetake")||r.querySelector(".exact")||r.querySelector(".refusal"));},{timeout:70000}).catch(()=>{});await new Promise(r=>setTimeout(r,1500));}
 const t=await p.evaluate(()=>{const g=s=>{const e=document.querySelector(s);return e?e.textContent.replace(/\s+/g," ").trim():null;};return {
   carline:g(".carline"),xname:g(".exact .xname"),lead:g(".blk .lead"),band:g(".blk .band"),tail:g(".blk .tail"),
   ltHero:g(".lt-hero"),ltLine:g(".lt-line"),ltSpan:g(".lt-span"),heroCard:!!document.querySelector(".livetake .cm.cm-solo img"),
   headline:g(".livetake .lead")||g(".xname"),ob:(document.getElementById("ob")||{}).textContent?.replace(/\s+/g," ").trim().slice(0,420)};});
 console.log("\n=== ["+id+"] "+q+(mobile?" (390px)":"")+" ===");console.log(JSON.stringify(t,null,1).slice(0,900));
 await p.screenshot({path:OUT+"/after_"+id+".png",fullPage:true});await p.close();
}
await run("m3","1988 BMW M3");
await run("jag","2018 Jaguar XF Sportbrake S");
await run("jag_mobile","2018 Jaguar XF Sportbrake S",{mobile:true});
await run("s65vin","WDBNG79J36A477562",{confirm:true});
await b.close();
